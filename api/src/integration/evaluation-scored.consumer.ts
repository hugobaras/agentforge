import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { CONSUMER_GROUPS, TOPICS } from '../kafka/kafka.constants';
import { DomainEvent, EvaluationScoredPayload } from '../kafka/kafka.types';
import { IntegrationService } from './integration.service';

@Injectable()
export class EvaluationScoredConsumer implements OnModuleInit {
  private readonly logger = new Logger(EvaluationScoredConsumer.name);

  constructor(
    private readonly consumers: KafkaConsumerService,
    private readonly integration: IntegrationService,
  ) {}

  onModuleInit(): void {
    this.consumers.register({
      topic: TOPICS.EVALUATION_SCORED,
      groupId: CONSUMER_GROUPS.INTEGRATION_VERIFIER,
      handler: async (event: DomainEvent<EvaluationScoredPayload>) => {
        const lotId = event.payload?.lotId ?? event.lotId;
        this.logger.log(`Vérification lot=${lotId} eventId=${event.eventId}`);
        await this.integration.verifyFromScored(event.payload);
      },
    });
  }
}
