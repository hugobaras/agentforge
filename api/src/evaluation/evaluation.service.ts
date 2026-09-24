import { Inject, Injectable, Logger } from '@nestjs/common';
import { AgentRunType, LotStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TOPICS } from '../kafka/kafka.constants';
import {
  AgentImplementedPayload,
  EvaluationScoredPayload,
} from '../kafka/kafka.types';
import { PrismaService } from '../prisma/prisma.service';
import { EVALUATOR_AGENT, type EvaluatorAgent } from './agents/evaluator-agent';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
    @Inject(EVALUATOR_AGENT)
    private readonly evaluator: EvaluatorAgent,
  ) {}

  async evaluateFromImplemented(
    payload: AgentImplementedPayload,
  ): Promise<void> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: payload.lotId },
      include: { spec: true },
    });
    if (!lot?.spec) {
      this.logger.warn(`Lot ${payload.lotId} introuvable ou sans spec — skip`);
      return;
    }

    if (
      lot.status === LotStatus.APPROVED ||
      lot.status === LotStatus.REJECTED
    ) {
      this.logger.log(`Lot ${lot.id} déjà ${lot.status} — skip`);
      return;
    }

    const existing = await this.prisma.evaluation.findFirst({
      where: { lotId: lot.id, agentRunId: payload.agentRunId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      this.logger.log(
        `Évaluation déjà présente evaluation=${existing.id} agentRun=${payload.agentRunId} lot=${lot.id}`,
      );
      await this.publishScored(existing);
      return;
    }

    await this.prisma.lot.update({
      where: { id: lot.id },
      data: { status: LotStatus.EVALUATING },
    });

    const run = await this.prisma.agentRun.create({
      data: {
        lotId: lot.id,
        type: AgentRunType.EVALUATOR,
      },
    });

    let result;
    try {
      result = await this.evaluator.evaluate({
        lotId: lot.id,
        title: lot.title,
        spec: { title: lot.spec.title, body: lot.spec.body },
        deliverable: payload.deliverable,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Évaluateur en échec lot=${lot.id}: ${message}`);
      result = {
        score: 0,
        feedback: `Échec de l'évaluateur : ${message}`,
        provider: 'fallback',
      };
    }

    const score = clampScore(result.score);
    const evaluation = await this.prisma.evaluation.create({
      data: {
        lotId: lot.id,
        agentRunId: payload.agentRunId,
        score,
        feedback: result.feedback,
      },
    });

    await this.prisma.agentRun.update({
      where: { id: run.id },
      data: {
        deliverable: JSON.stringify({ score, feedback: result.feedback }),
        finishedAt: new Date(),
      },
    });

    this.logger.log(
      `Évaluation score=${score} evaluation=${evaluation.id} lot=${lot.id}`,
    );
    await this.publishScored(evaluation);
  }

  private async publishScored(evaluation: {
    id: string;
    lotId: string;
    agentRunId: string;
    score: number;
    feedback: string;
  }): Promise<void> {
    await this.kafkaProducer.publish<EvaluationScoredPayload>(
      TOPICS.EVALUATION_SCORED,
      {
        eventId: randomUUID(),
        eventType: TOPICS.EVALUATION_SCORED,
        occurredAt: new Date().toISOString(),
        lotId: evaluation.lotId,
        payload: {
          lotId: evaluation.lotId,
          evaluationId: evaluation.id,
          agentRunId: evaluation.agentRunId,
          score: evaluation.score,
          feedback: evaluation.feedback,
        },
      },
      evaluation.lotId,
    );
  }
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(score)));
}
