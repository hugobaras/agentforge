import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from './kafka.types';
import { KafkaService } from './kafka.service';

@Injectable()
export class KafkaProducerService {
  private readonly logger = new Logger(KafkaProducerService.name);

  constructor(private readonly kafkaService: KafkaService) {}

  async publish<T>(
    topic: string,
    event: DomainEvent<T>,
    key?: string,
  ): Promise<void> {
    if (!this.kafkaService.isEnabled()) {
      this.logger.debug(`Kafka off — skip ${event.eventType} ${event.eventId}`);
      return;
    }

    await this.kafkaService.getProducer().send({
      topic,
      messages: [
        {
          key: key ?? event.lotId ?? event.eventId,
          value: JSON.stringify(event),
          headers: {
            eventId: event.eventId,
            eventType: event.eventType,
          },
        },
      ],
    });

    this.logger.log(
      `Publié ${event.eventType} topic=${topic} eventId=${event.eventId}`,
    );
  }
}
