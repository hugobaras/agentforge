import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from './kafka-consumer.service';
import { CONSUMER_GROUPS, TOPICS } from './kafka.constants';
import { DomainEvent, LotSubmittedPayload } from './kafka.types';

@Injectable()
export class LotSubmittedLogConsumer implements OnModuleInit {
  private readonly logger = new Logger(LotSubmittedLogConsumer.name);

  constructor(private readonly consumers: KafkaConsumerService) {}

  onModuleInit(): void {
    this.consumers.register({
      topic: TOPICS.LOT_SUBMITTED,
      groupId: CONSUMER_GROUPS.LOT_SUBMITTED_LOGGER,
      handler: async (event: DomainEvent<LotSubmittedPayload>) => {
        this.logger.log(
          `Reçu ${event.eventType} eventId=${event.eventId} lotId=${event.payload?.lotId ?? event.lotId}`,
        );
      },
    });
  }
}
