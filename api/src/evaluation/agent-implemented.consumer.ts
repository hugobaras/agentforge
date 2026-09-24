import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { CONSUMER_GROUPS, TOPICS } from '../kafka/kafka.constants';
import { AgentImplementedPayload, DomainEvent } from '../kafka/kafka.types';
import { EvaluationService } from './evaluation.service';

@Injectable()
export class AgentImplementedConsumer implements OnModuleInit {
  private readonly logger = new Logger(AgentImplementedConsumer.name);

  constructor(
    private readonly consumers: KafkaConsumerService,
    private readonly evaluation: EvaluationService,
  ) {}

  onModuleInit(): void {
    this.consumers.register({
      topic: TOPICS.AGENT_IMPLEMENTED,
      groupId: CONSUMER_GROUPS.EVALUATION_EVALUATOR,
      handler: async (event: DomainEvent<AgentImplementedPayload>) => {
        const lotId = event.payload?.lotId ?? event.lotId;
        this.logger.log(`Évaluation lot=${lotId} eventId=${event.eventId}`);
        await this.evaluation.evaluateFromImplemented(event.payload);
      },
    });
  }
}
