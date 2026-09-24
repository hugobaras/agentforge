import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { CONSUMER_GROUPS, TOPICS } from '../kafka/kafka.constants';
import { DomainEvent, LotSubmittedPayload } from '../kafka/kafka.types';
import { ExecutionService } from './execution.service';

@Injectable()
export class LotSubmittedConsumer implements OnModuleInit {
  private readonly logger = new Logger(LotSubmittedConsumer.name);

  constructor(
    private readonly consumers: KafkaConsumerService,
    private readonly execution: ExecutionService,
  ) {}

  onModuleInit(): void {
    this.consumers.register({
      topic: TOPICS.LOT_SUBMITTED,
      groupId: CONSUMER_GROUPS.EXECUTION_IMPLEMENTER,
      handler: async (event: DomainEvent<LotSubmittedPayload>) => {
        const lotId = event.payload?.lotId ?? event.lotId;
        this.logger.log(
          `Implémentation lot=${lotId} eventId=${event.eventId}`,
        );
        await this.execution.implementFromSubmitted(event.payload);
      },
    });
  }
}
