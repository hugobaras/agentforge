import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Consumer } from 'kafkajs';
import type { LotRealtimeService } from '../realtime/lot-realtime.service';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaService } from './kafka.service';
import {
  ConsumerRegistration,
  DomainEvent,
  MessageHandler,
} from './kafka.types';
import { ProcessedEventService } from './processed-event.service';
import { runWithExponentialBackoff } from './retry';

@Injectable()
export class KafkaConsumerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly registrations: ConsumerRegistration[] = [];
  private readonly consumers: Consumer[] = [];

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly producer: KafkaProducerService,
    private readonly processedEvents: ProcessedEventService,
    @Optional() private readonly realtime?: LotRealtimeService,
  ) {}

  register(registration: ConsumerRegistration): void {
    const prefix = this.kafkaService.getOptions().consumerGroupPrefix ?? '';
    this.registrations.push({
      ...registration,
      groupId: `${prefix}${registration.groupId}`,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.kafkaService.isEnabled()) {
      return;
    }

    await Promise.all(
      this.registrations.map(async (registration) => {
        const consumer = this.kafkaService.createConsumer(registration.groupId);
        await consumer.connect();
        await consumer.subscribe({
          topic: registration.topic,
          fromBeginning: true,
        });
        await consumer.run({
          eachMessage: async ({ topic, message, heartbeat }) => {
            const pulse = setInterval(() => {
              void heartbeat().catch(() => undefined);
            }, 5_000);
            try {
              await this.handleMessage({
                topic,
                consumerGroup: registration.groupId,
                raw: message.value?.toString() ?? null,
                handler: async (event) => {
                  await heartbeat();
                  await registration.handler(event);
                },
              });
            } finally {
              clearInterval(pulse);
            }
          },
        });
        this.consumers.push(consumer);
        this.logger.log(
          `Consumer ${registration.groupId} sur ${registration.topic}`,
        );
      }),
    );
  }

  async handleMessage(params: {
    topic: string;
    consumerGroup: string;
    raw: string | null;
    handler: MessageHandler;
  }): Promise<void> {
    const options = this.kafkaService.getOptions();
    let event: DomainEvent;

    try {
      event = JSON.parse(params.raw ?? '') as DomainEvent;
      if (!event?.eventId) {
        throw new Error('eventId manquant');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Message invalide sur ${params.topic}: ${message}`);
      await this.publishDlq(params.topic, params.consumerGroup, {
        raw: params.raw,
        error: message,
      });
      return;
    }

    if (
      await this.processedEvents.wasProcessed(event.eventId, params.consumerGroup)
    ) {
      this.logger.debug(
        `Idempotence: skip ${event.eventId} group=${params.consumerGroup}`,
      );
      return;
    }

    try {
      await runWithExponentialBackoff(() => params.handler(event), {
        maxAttempts: options.maxAttempts,
        baseDelayMs: options.retryBaseMs,
      });
      await this.processedEvents.mark(
        event.eventId,
        params.topic,
        params.consumerGroup,
      );
      await this.emitRealtime(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Échec handler ${event.eventId} après ${options.maxAttempts} tentatives: ${message}`,
      );
      await this.publishDlq(params.topic, params.consumerGroup, {
        originalEvent: event,
        error: message,
        attempts: options.maxAttempts,
      });
      await this.processedEvents.mark(
        event.eventId,
        params.topic,
        params.consumerGroup,
      );
    }
  }

  private async emitRealtime(event: DomainEvent): Promise<void> {
    const lotId =
      event.lotId ??
      (typeof event.payload === 'object' &&
      event.payload !== null &&
      'lotId' in event.payload
        ? String((event.payload as { lotId?: unknown }).lotId ?? '')
        : '');
    if (!lotId || !this.realtime) {
      return;
    }
    await this.realtime.emit(lotId, event.eventType, event.payload);
  }

  private async publishDlq(
    originalTopic: string,
    consumerGroup: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const options = this.kafkaService.getOptions();
    await this.producer.publish(options.dlqTopic, {
      eventId: randomUUID(),
      eventType: 'dlq',
      occurredAt: new Date().toISOString(),
      lotId:
        typeof payload.originalEvent === 'object' &&
        payload.originalEvent !== null &&
        'lotId' in payload.originalEvent
          ? (payload.originalEvent as DomainEvent).lotId
          : undefined,
      payload: {
        originalTopic,
        consumerGroup,
        failedAt: new Date().toISOString(),
        ...payload,
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      this.consumers.map((consumer) =>
        consumer.disconnect().catch(() => undefined),
      ),
    );
  }
}
