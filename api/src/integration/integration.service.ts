import { Inject, Injectable, Logger } from '@nestjs/common';
import { AgentRunType, LotStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TOPICS } from '../kafka/kafka.constants';
import {
  EvaluationScoredPayload,
  LotReworkPayload,
  VerificationPayload,
} from '../kafka/kafka.types';
import { GitService } from '../git/git.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  VERIFICATION_OPTIONS,
  VERIFIER_AGENT,
  type VerificationOptions,
  type VerifierAgent,
} from './agents/verifier-agent';

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
    @Inject(VERIFIER_AGENT)
    private readonly verifier: VerifierAgent,
    @Inject(VERIFICATION_OPTIONS)
    private readonly options: VerificationOptions,
    private readonly git: GitService,
  ) {}

  async verifyFromScored(payload: EvaluationScoredPayload): Promise<void> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: payload.lotId },
      include: {
        spec: true,
        agentRuns: {
          where: { type: AgentRunType.IMPLEMENTER, finishedAt: { not: null } },
          orderBy: { finishedAt: 'desc' },
        },
        evaluations: {
          where: { id: payload.evaluationId },
          take: 1,
        },
      },
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

    const implementerRun = lot.agentRuns[0];
    const evaluation = lot.evaluations[0];
    if (
      evaluation &&
      implementerRun?.createdAt &&
      implementerRun.createdAt > evaluation.createdAt
    ) {
      this.logger.log(
        `Rework déjà lancé après evaluation=${evaluation.id} lot=${lot.id} — skip`,
      );
      return;
    }

    const threshold = this.options.approvalThreshold;
    if (payload.score >= threshold) {
      await this.verifyDeliverable(lot.id, lot.title, lot.spec, payload, implementerRun);
      return;
    }

    const implementerCount = lot.agentRuns.length;
    const maxIterations = this.options.maxImplementIterations;
    if (implementerCount < maxIterations) {
      await this.requestRework(lot.id, payload, implementerRun?.deliverable ?? '', {
        iteration: implementerCount + 1,
        maxIterations,
      });
      return;
    }

    this.logger.log(
      `Score ${payload.score} < seuil ${threshold} après ${implementerCount} itération(s) — rejet sans vérificateur`,
    );
    await this.finalize(lot.id, {
      approved: false,
      reason: `Score d'évaluation ${payload.score} inférieur au seuil ${threshold} après ${implementerCount} itération(s).`,
      evaluationScore: payload.score,
      threshold,
    });
  }

  private async requestRework(
    lotId: string,
    payload: EvaluationScoredPayload,
    previousDeliverable: string,
    loop: { iteration: number; maxIterations: number },
  ): Promise<void> {
    await this.prisma.lot.update({
      where: { id: lotId },
      data: { status: LotStatus.IMPLEMENTING },
    });

    await this.kafkaProducer.publish<LotReworkPayload>(
      TOPICS.LOT_REWORK,
      {
        eventId: randomUUID(),
        eventType: TOPICS.LOT_REWORK,
        occurredAt: new Date().toISOString(),
        lotId,
        payload: {
          lotId,
          evaluationId: payload.evaluationId,
          score: payload.score,
          feedback: payload.feedback,
          previousDeliverable,
          iteration: loop.iteration,
          maxIterations: loop.maxIterations,
        },
      },
      lotId,
    );

    this.logger.log(
      `${TOPICS.LOT_REWORK} lot=${lotId} iteration=${loop.iteration}/${loop.maxIterations} score=${payload.score}`,
    );
  }

  private async verifyDeliverable(
    lotId: string,
    title: string,
    spec: { title: string; body: string },
    payload: EvaluationScoredPayload,
    implementerRun: { id: string; deliverable: string | null } | undefined,
  ): Promise<void> {
    const threshold = this.options.approvalThreshold;
    if (!implementerRun?.deliverable) {
      await this.finalize(lotId, {
        approved: false,
        reason: 'Aucun livrable implémenteur à vérifier.',
        evaluationScore: payload.score,
        threshold,
      });
      return;
    }

    await this.prisma.lot.update({
      where: { id: lotId },
      data: { status: LotStatus.VERIFYING },
    });

    const run = await this.prisma.agentRun.create({
      data: { lotId, type: AgentRunType.VERIFIER },
    });

    let result;
    try {
      result = await this.verifier.verify({
        lotId,
        title,
        spec: { title: spec.title, body: spec.body },
        deliverable: implementerRun.deliverable,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Vérificateur en échec lot=${lotId}: ${message}`);
      result = {
        approved: false,
        reason: `Échec du vérificateur : ${message}`,
        checks: {
          standards: false,
          tests: false,
          fidelity: false,
          lint: false,
          analysis: false,
        },
        provider: 'fallback',
      };
    }

    await this.prisma.agentRun.update({
      where: { id: run.id },
      data: {
        deliverable: JSON.stringify(result),
        finishedAt: new Date(),
      },
    });

    await this.finalize(lotId, {
      approved: result.approved,
      reason: result.reason,
      checks: result.checks,
      reports: result.reports,
      agentRunId: run.id,
      evaluationScore: payload.score,
      threshold,
    });
  }

  private async finalize(
    lotId: string,
    result: Omit<VerificationPayload, 'lotId'>,
  ): Promise<void> {
    const status = result.approved ? LotStatus.APPROVED : LotStatus.REJECTED;
    await this.prisma.lot.update({
      where: { id: lotId },
      data: { status },
    });

    const topic = result.approved
      ? TOPICS.VERIFICATION_APPROVED
      : TOPICS.VERIFICATION_REJECTED;

    await this.kafkaProducer.publish<VerificationPayload>(
      topic,
      {
        eventId: randomUUID(),
        eventType: topic,
        occurredAt: new Date().toISOString(),
        lotId,
        payload: { lotId, ...result },
      },
      lotId,
    );

    this.logger.log(`${topic} lot=${lotId} — ${result.reason}`);

    if (result.approved) {
      await this.git.openForApprovedLot(lotId);
    }
  }
}
