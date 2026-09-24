import { INestApplication } from '@nestjs/common';
import { LotStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { CONSUMER_GROUPS, TOPICS } from '../src/kafka/kafka.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';
import { waitUntil } from './helpers/wait-until';

describe('Evaluation (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let tenantId: string;
  let evaluatorGroup: string;

  beforeAll(async () => {
    const ctx = await createTestApp({ enableKafka: true });
    app = ctx.app;
    prisma = ctx.prisma;
    evaluatorGroup = `${ctx.consumerGroupPrefix}${CONSUMER_GROUPS.EVALUATION_EVALUATOR}`;

    const tenant = await prisma.tenant.create({
      data: { name: `e2e-evaluation-${Date.now()}` },
    });
    tenantId = tenant.id;
  }, 60000);

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app?.close();
  });

  it('consomme agent.implemented et enregistre un score 0-100', async () => {
    const created = await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId,
        title: 'Lot evaluation e2e',
        spec: { title: 'Ping HTTP', body: 'GET /ping doit répondre pong' },
      })
      .expect(201);

    const lotId = created.body.id as string;

    await waitUntil(async () => {
      const evaluation = await prisma.evaluation.findFirst({ where: { lotId } });
      return evaluation !== null;
    }, 25000);

    const lot = await prisma.lot.findUnique({ where: { id: lotId } });
    const evaluation = await prisma.evaluation.findFirst({ where: { lotId } });
    const processed = await prisma.processedEvent.findFirst({
      where: {
        topic: TOPICS.AGENT_IMPLEMENTED,
        consumerGroup: evaluatorGroup,
      },
    });

    expect(evaluation?.score).toBeGreaterThanOrEqual(0);
    expect(evaluation?.score).toBeLessThanOrEqual(100);
    expect(evaluation?.feedback.length).toBeGreaterThan(0);
    expect([
      LotStatus.IMPLEMENTING,
      LotStatus.EVALUATING,
      LotStatus.VERIFYING,
      LotStatus.APPROVED,
      LotStatus.REJECTED,
    ]).toContain(lot?.status);
    expect(processed).toBeTruthy();
  }, 30000);
});
