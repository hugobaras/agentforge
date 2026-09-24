import { Inject, Injectable, Logger } from '@nestjs/common';
import { AgentRunType, LotStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TOPICS } from '../kafka/kafka.constants';
import {
  AgentImplementedPayload,
  LotReworkPayload,
  LotSubmittedPayload,
} from '../kafka/kafka.types';
import { PrismaService } from '../prisma/prisma.service';
import { IMPLEMENTER_AGENT, type ImplementerAgent } from './agents/implementer-agent';

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
    @Inject(IMPLEMENTER_AGENT)
    private readonly implementer: ImplementerAgent,
  ) {}

  async implementFromSubmitted(payload: LotSubmittedPayload): Promise<void> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: payload.lotId },
      include: { spec: true },
    });
    if (!lot?.spec) {
      this.logger.warn(
        `Lot ${payload.lotId} introuvable ou sans spec — skip`,
      );
      return;
    }

    if (
      lot.status === LotStatus.APPROVED ||
      lot.status === LotStatus.REJECTED
    ) {
      this.logger.log(`Lot ${lot.id} déjà ${lot.status} — skip`);
      return;
    }

    const existing = await this.prisma.agentRun.findFirst({
      where: { lotId: lot.id, type: AgentRunType.IMPLEMENTER },
      orderBy: { createdAt: 'desc' },
    });

    if (existing?.deliverable && existing.finishedAt) {
      this.logger.log(
        `Livrable déjà présent agentRun=${existing.id} lot=${lot.id}`,
      );
      await this.publishImplemented(lot.id, existing.id, existing.deliverable);
      return;
    }

    await this.prisma.lot.update({
      where: { id: lot.id },
      data: { status: LotStatus.IMPLEMENTING },
    });

    const run = existing
      ? existing
      : await this.prisma.agentRun.create({
          data: {
            lotId: lot.id,
            type: AgentRunType.IMPLEMENTER,
          },
        });

    let result;
    try {
      result = await this.implementer.implement({
        lotId: lot.id,
        title: lot.title,
        spec: { title: lot.spec.title, body: lot.spec.body },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Implémenteur en échec lot=${lot.id}: ${message}`);
      result = {
        summary: `Échec de l'implémenteur : ${message}`,
        files: [{ path: 'IMPLEMENTATION_FAILED.md', content: message }],
        provider: 'fallback',
      };
    }

    const deliverable = JSON.stringify(result);
    await this.prisma.agentRun.update({
      where: { id: run.id },
      data: { deliverable, finishedAt: new Date() },
    });

    this.logger.log(`Livrable stocké agentRun=${run.id} lot=${lot.id}`);
    await this.publishImplemented(lot.id, run.id, deliverable);
  }

  async implementFromRework(payload: LotReworkPayload): Promise<void> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: payload.lotId },
      include: { spec: true },
    });
    if (!lot?.spec) {
      this.logger.warn(
        `Lot ${payload.lotId} introuvable ou sans spec — skip`,
      );
      return;
    }

    if (
      lot.status === LotStatus.APPROVED ||
      lot.status === LotStatus.REJECTED
    ) {
      this.logger.log(`Lot ${lot.id} déjà ${lot.status} — skip`);
      return;
    }

    const finishedCount = await this.prisma.agentRun.count({
      where: {
        lotId: lot.id,
        type: AgentRunType.IMPLEMENTER,
        finishedAt: { not: null },
      },
    });

    if (finishedCount >= payload.maxIterations) {
      this.logger.log(
        `Plafond d'itérations atteint (${finishedCount}/${payload.maxIterations}) lot=${lot.id} — skip`,
      );
      return;
    }

    if (finishedCount >= payload.iteration) {
      const latest = await this.prisma.agentRun.findFirst({
        where: {
          lotId: lot.id,
          type: AgentRunType.IMPLEMENTER,
          finishedAt: { not: null },
        },
        orderBy: { finishedAt: 'desc' },
      });
      if (latest?.deliverable) {
        this.logger.log(
          `Itération ${payload.iteration} déjà livrée agentRun=${latest.id} lot=${lot.id}`,
        );
        await this.publishImplemented(lot.id, latest.id, latest.deliverable);
      }
      return;
    }

    await this.prisma.lot.update({
      where: { id: lot.id },
      data: { status: LotStatus.IMPLEMENTING },
    });

    const unfinished = await this.prisma.agentRun.findFirst({
      where: {
        lotId: lot.id,
        type: AgentRunType.IMPLEMENTER,
        finishedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    const run = unfinished
      ? unfinished
      : await this.prisma.agentRun.create({
          data: {
            lotId: lot.id,
            type: AgentRunType.IMPLEMENTER,
          },
        });

    let result;
    try {
      result = await this.implementer.implement({
        lotId: lot.id,
        title: lot.title,
        spec: { title: lot.spec.title, body: lot.spec.body },
        previousDeliverable: payload.previousDeliverable,
        feedback: payload.feedback,
        iteration: payload.iteration,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Implémenteur en échec (rework) lot=${lot.id}: ${message}`);
      result = {
        summary: `Échec de l'implémenteur : ${message}`,
        files: [{ path: 'IMPLEMENTATION_FAILED.md', content: message }],
        provider: 'fallback',
      };
    }

    const deliverable = JSON.stringify(result);
    await this.prisma.agentRun.update({
      where: { id: run.id },
      data: { deliverable, finishedAt: new Date() },
    });

    this.logger.log(
      `Livrable rework stocké agentRun=${run.id} iteration=${payload.iteration} lot=${lot.id}`,
    );
    await this.publishImplemented(lot.id, run.id, deliverable);
  }

  private async publishImplemented(
    lotId: string,
    agentRunId: string,
    deliverable: string,
  ): Promise<void> {
    await this.kafkaProducer.publish<AgentImplementedPayload>(
      TOPICS.AGENT_IMPLEMENTED,
      {
        eventId: randomUUID(),
        eventType: TOPICS.AGENT_IMPLEMENTED,
        occurredAt: new Date().toISOString(),
        lotId,
        payload: { lotId, agentRunId, deliverable },
      },
      lotId,
    );
  }
}
