import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DecisionModule } from './decision/decision.module';
import { GitModule } from './git/git.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { ExecutionModule } from './execution/execution.module';
import { IntegrationModule } from './integration/integration.module';
import { KafkaModule } from './kafka/kafka.module';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SubmissionModule } from './submission/submission.module';

@Module({
  imports: [
    PrismaModule,
    LlmModule,
    RealtimeModule,
    KafkaModule,
    SubmissionModule,
    ExecutionModule,
    EvaluationModule,
    IntegrationModule,
    DecisionModule,
    GitModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
