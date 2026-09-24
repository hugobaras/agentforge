import { INestApplication } from '@nestjs/common';
import { AgentRunType, LotStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { CONSUMER_GROUPS, TOPICS } from '../src/kafka/kafka.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';
import { waitUntil } from './helpers/wait-until';

describe('Integration verifier (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let tenantId: string;
  let verifierGroup: string;

  beforeAll(async () => {
    const ctx = await createTestApp({ enableKafka: true });
    app = ctx.app;
    prisma = ctx.prisma;
    verifierGroup = `${ctx.consumerGroupPrefix}${CONSUMER_GROUPS.INTEGRATION_VERIFIER}`;

    const tenant = await prisma.tenant.create({
      data: { name: `e2e-integration-${Date.now()}` },
    });
    tenantId = tenant.id;
  }, 60000);

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app?.close();
  });

  it('termine le lot en APPROVED ou REJECTED après verification.*', async () => {
    const created = await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId,
        title: 'Lot integration e2e',
        spec: { title: 'Ping HTTP', body: 'GET /ping doit répondre pong' },
      })
      .expect(201);

    const lotId = created.body.id as string;

    await waitUntil(async () => {
      const lot = await prisma.lot.findUnique({ where: { id: lotId } });
      return (
        lot?.status === LotStatus.APPROVED || lot?.status === LotStatus.REJECTED
      );
    }, 45000);

    const lot = await prisma.lot.findUnique({ where: { id: lotId } });
    const processed = await prisma.processedEvent.findFirst({
      where: {
        topic: TOPICS.EVALUATION_SCORED,
        consumerGroup: verifierGroup,
      },
    });

    expect([LotStatus.APPROVED, LotStatus.REJECTED]).toContain(lot?.status);
    expect(processed).toBeTruthy();

    if (lot?.status === LotStatus.APPROVED) {
      const verifierRun = await prisma.agentRun.findFirst({
        where: { lotId, type: AgentRunType.VERIFIER },
      });
      expect(verifierRun?.deliverable).toBeTruthy();
    }
  }, 50000);
});
