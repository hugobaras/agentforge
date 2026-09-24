import { TOPICS, KAFKA_OPTIONS } from './kafka.constants';
import { KafkaOptions } from './kafka.types';

export function loadKafkaOptions(): KafkaOptions {
  return {
    enabled: process.env.KAFKA_ENABLED !== 'false',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'agentforge-api',
    dlqTopic: process.env.KAFKA_DLQ_TOPIC ?? TOPICS.DLQ,
    maxAttempts: Number(process.env.KAFKA_MAX_RETRIES ?? 3),
    retryBaseMs: Number(process.env.KAFKA_RETRY_BASE_MS ?? 200),
    consumerGroupPrefix: process.env.KAFKA_GROUP_PREFIX ?? '',
  };
}

export const kafkaOptionsProvider = {
  provide: KAFKA_OPTIONS,
  useFactory: loadKafkaOptions,
};
