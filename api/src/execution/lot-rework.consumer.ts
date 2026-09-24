import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { CONSUMER_GROUPS, TOPICS } from '../kafka/kafka.constants';
import { DomainEvent, LotReworkPayload } from '../kafka/kafka.types';
import { ExecutionService } from './execution.service';

@Injectable()
export class LotReworkConsumer implements OnModuleInit {
  private readonly logger = new Logger(LotReworkConsumer.name);

  constructor(
    private readonly consumers: KafkaConsumerService,
    private readonly execution: ExecutionService,
  ) {}

  onModuleInit(): void {
    this.consumers.register({
      topic: TOPICS.LOT_REWORK,
      groupId: CONSUMER_GROUPS.EXECUTION_REWORK,
      handler: async (event: DomainEvent<LotReworkPayload>) => {
        const lotId = event.payload?.lotId ?? event.lotId;
        this.logger.log(
          `Rework lot=${lotId} iteration=${event.payload?.iteration} eventId=${event.eventId}`,
        );
        await this.execution.implementFromRework(event.payload);
      },
    });
  }
}
