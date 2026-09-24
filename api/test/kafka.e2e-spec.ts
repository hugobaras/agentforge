import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { CONSUMER_GROUPS, TOPICS } from '../src/kafka/kafka.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';

async function waitForProcessedEvent(
  prisma: PrismaService,
  consumerGroup: string,
  previousCount: number,
  timeoutMs = 20000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const count = await prisma.processedEvent.count({
      where: {
        topic: TOPICS.LOT_SUBMITTED,
        consumerGroup,
      },
    });
    if (count > previousCount) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timeout: aucun ProcessedEvent pour lot.submitted');
}

describe('Kafka lot.submitted (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let tenantId: string;
  let loggerGroup: string;

  beforeAll(async () => {
    const ctx = await createTestApp({ enableKafka: true });
    app = ctx.app;
    prisma = ctx.prisma;
    loggerGroup = `${ctx.consumerGroupPrefix}${CONSUMER_GROUPS.LOT_SUBMITTED_LOGGER}`;

    const tenant = await prisma.tenant.create({
      data: { name: `e2e-kafka-${Date.now()}` },
    });
    tenantId = tenant.id;
  }, 60000);

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app?.close();
  });

  it('publie lot.submitted et le consumer de log le marque traité', async () => {
    const previousCount = await prisma.processedEvent.count({
      where: {
        topic: TOPICS.LOT_SUBMITTED,
        consumerGroup: loggerGroup,
      },
    });

    const created = await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId,
        title: 'Lot kafka e2e',
        spec: { title: 'Spec kafka', body: 'GET /ping' },
      })
      .expect(201);

    expect(created.body.status).toBe('SUBMITTED');
    await waitForProcessedEvent(prisma, loggerGroup, previousCount);

    const processed = await prisma.processedEvent.findMany({
      where: {
        topic: TOPICS.LOT_SUBMITTED,
        consumerGroup: loggerGroup,
      },
    });
    expect(processed.length).toBeGreaterThanOrEqual(1);
  }, 25000);
});
