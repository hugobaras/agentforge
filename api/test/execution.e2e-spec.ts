import { INestApplication } from '@nestjs/common';
import { AgentRunType, LotStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { CONSUMER_GROUPS, TOPICS } from '../src/kafka/kafka.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';
import { waitUntil } from './helpers/wait-until';

describe('Execution implementer (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let tenantId: string;
  let implementerGroup: string;

  beforeAll(async () => {
    const ctx = await createTestApp({ enableKafka: true });
    app = ctx.app;
    prisma = ctx.prisma;
    implementerGroup = `${ctx.consumerGroupPrefix}${CONSUMER_GROUPS.EXECUTION_IMPLEMENTER}`;

    const tenant = await prisma.tenant.create({
      data: { name: `e2e-execution-${Date.now()}` },
    });
    tenantId = tenant.id;
  }, 60000);

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app?.close();
  });

  it('consomme lot.submitted, stocke un AgentRun et passe le lot en IMPLEMENTING', async () => {
    const created = await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId,
        title: 'Lot execution e2e',
        spec: { title: 'Ping', body: 'GET /ping → {pong:true}' },
      })
      .expect(201);

    const lotId = created.body.id as string;

    await waitUntil(async () => {
      const run = await prisma.agentRun.findFirst({
        where: {
          lotId,
          type: AgentRunType.IMPLEMENTER,
          finishedAt: { not: null },
        },
      });
      return Boolean(run?.deliverable);
    });

    const lot = await prisma.lot.findUnique({ where: { id: lotId } });
    const run = await prisma.agentRun.findFirst({
      where: { lotId, type: AgentRunType.IMPLEMENTER },
    });
    const processed = await prisma.processedEvent.findFirst({
      where: {
        topic: TOPICS.LOT_SUBMITTED,
        consumerGroup: implementerGroup,
      },
    });

    expect([
      LotStatus.IMPLEMENTING,
      LotStatus.EVALUATING,
      LotStatus.VERIFYING,
      LotStatus.APPROVED,
      LotStatus.REJECTED,
    ]).toContain(lot?.status);
    expect(run?.deliverable).toContain('mock');
    expect(processed).toBeTruthy();
  }, 25000);
});
