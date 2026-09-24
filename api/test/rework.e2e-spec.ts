import { INestApplication } from '@nestjs/common';
import { AgentRunType, LotStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { CONSUMER_GROUPS, TOPICS } from '../src/kafka/kafka.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';
import { waitUntil } from './helpers/wait-until';

describe('Boucle implémenteur ↔ évaluateur (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let tenantId: string;
  let reworkGroup: string;

  beforeAll(async () => {
    const ctx = await createTestApp({ enableKafka: true });
    app = ctx.app;
    prisma = ctx.prisma;
    reworkGroup = `${ctx.consumerGroupPrefix}${CONSUMER_GROUPS.EXECUTION_REWORK}`;

    const tenant = await prisma.tenant.create({
      data: { name: `e2e-rework-${Date.now()}` },
    });
    tenantId = tenant.id;
  }, 60000);

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app?.close();
  });

  it('enchaîne au moins deux IMPLEMENTER puis termine le lot', async () => {
    const created = await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId,
        title: 'Lot rework e2e',
        spec: {
          title: 'Ping HTTP',
          body: 'GET /ping doit répondre pong avec un JSON structuré',
        },
      })
      .expect(201);

    const lotId = created.body.id as string;

    await waitUntil(async () => {
      const lot = await prisma.lot.findUnique({ where: { id: lotId } });
      return (
        lot?.status === LotStatus.APPROVED || lot?.status === LotStatus.REJECTED
      );
    }, 45000);

    const lot = await prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        agentRuns: { orderBy: { createdAt: 'asc' } },
        evaluations: { orderBy: { createdAt: 'asc' } },
      },
    });
    const implementers = lot?.agentRuns.filter(
      (run) => run.type === AgentRunType.IMPLEMENTER && run.finishedAt,
    );
    const reworkProcessed = await prisma.processedEvent.findFirst({
      where: {
        topic: TOPICS.LOT_REWORK,
        consumerGroup: reworkGroup,
      },
    });

    expect([LotStatus.APPROVED, LotStatus.REJECTED]).toContain(lot?.status);
    expect(implementers?.length).toBeGreaterThanOrEqual(2);
    expect(lot?.evaluations.length).toBeGreaterThanOrEqual(2);
    expect(reworkProcessed).toBeTruthy();
  }, 50000);
});
