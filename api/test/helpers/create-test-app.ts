import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/common/setup-app';
import { KAFKA_OPTIONS } from '../../src/kafka/kafka.constants';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createTestApp(options?: {
  enableKafka?: boolean;
}): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
  consumerGroupPrefix: string;
}> {
  const consumerGroupPrefix = options?.enableKafka
    ? `e2e-${process.pid}-${randomUUID().slice(0, 8)}-`
    : '';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(KAFKA_OPTIONS)
    .useValue({
      enabled: Boolean(options?.enableKafka),
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
      clientId: `agentforge-e2e-${process.pid}`,
      dlqTopic: 'agentforge.dlq',
      maxAttempts: 3,
      retryBaseMs: 50,
      consumerGroupPrefix,
    })
    .compile();

  const app = moduleFixture.createNestApplication();
  setupApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService), consumerGroupPrefix };
}
