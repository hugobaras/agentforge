import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Consumer, Kafka, Producer } from 'kafkajs';
import { KAFKA_OPTIONS } from './kafka.constants';
import type { KafkaOptions } from './kafka.types';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;

  constructor(@Inject(KAFKA_OPTIONS) private readonly options: KafkaOptions) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  getOptions(): KafkaOptions {
    return this.options;
  }

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.log('Kafka désactivé (KAFKA_ENABLED=false)');
      return;
    }

    this.kafka = new Kafka({
      clientId: this.options.clientId,
      brokers: this.options.brokers,
      connectionTimeout: 5000,
      retry: { initialRetryTime: 300, retries: 8 },
    });

    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.logger.log(`Producer connecté (${this.options.brokers.join(', ')})`);
  }

  getProducer(): Producer {
    if (!this.producer) {
      throw new Error('Kafka producer indisponible (désactivé ou non connecté)');
    }
    return this.producer;
  }

  createConsumer(groupId: string): Consumer {
    if (!this.kafka) {
      throw new Error('Kafka client indisponible (désactivé ou non connecté)');
    }
    return this.kafka.consumer({
      groupId,
      sessionTimeout: 180_000,
      heartbeatInterval: 5_000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect().catch(() => undefined);
    }
  }
}
