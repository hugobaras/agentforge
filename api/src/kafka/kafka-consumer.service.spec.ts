import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaService } from './kafka.service';
import { ProcessedEventService } from './processed-event.service';

describe('KafkaConsumerService', () => {
  const options = {
    enabled: true,
    brokers: ['localhost:9092'],
    clientId: 'test',
    dlqTopic: 'agentforge.dlq',
    maxAttempts: 3,
    retryBaseMs: 1,
  };

  let consumer: KafkaConsumerService;
  let producer: { publish: jest.Mock };
  let processed: { wasProcessed: jest.Mock; mark: jest.Mock };
  let realtime: { emit: jest.Mock };

  beforeEach(() => {
    producer = { publish: jest.fn().mockResolvedValue(undefined) };
    processed = {
      wasProcessed: jest.fn().mockResolvedValue(false),
      mark: jest.fn().mockResolvedValue(undefined),
    };
    realtime = { emit: jest.fn().mockResolvedValue(undefined) };

    consumer = new KafkaConsumerService(
      {
        isEnabled: () => true,
        getOptions: () => options,
      } as unknown as KafkaService,
      producer as unknown as KafkaProducerService,
      processed as unknown as ProcessedEventService,
      realtime as never,
    );
  });

  it('ignore un event déjà traité (idempotence)', async () => {
    processed.wasProcessed.mockResolvedValue(true);
    const handler = jest.fn();

    await consumer.handleMessage({
      topic: 'lot.submitted',
      consumerGroup: 'g1',
      raw: JSON.stringify({
        eventId: 'evt-1',
        eventType: 'lot.submitted',
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
      handler,
    });

    expect(handler).not.toHaveBeenCalled();
    expect(producer.publish).not.toHaveBeenCalled();
    expect(processed.mark).not.toHaveBeenCalled();
    expect(realtime.emit).not.toHaveBeenCalled();
  });

  it('marque l’event après un handler réussi', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);

    await consumer.handleMessage({
      topic: 'lot.submitted',
      consumerGroup: 'g1',
      raw: JSON.stringify({
        eventId: 'evt-2',
        eventType: 'lot.submitted',
        occurredAt: new Date().toISOString(),
        payload: { lotId: 'lot-from-payload' },
      }),
      handler,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(processed.mark).toHaveBeenCalledWith('evt-2', 'lot.submitted', 'g1');
    expect(producer.publish).not.toHaveBeenCalled();
    expect(realtime.emit).toHaveBeenCalledWith(
      'lot-from-payload',
      'lot.submitted',
      { lotId: 'lot-from-payload' },
    );
  });

  it('retry puis envoie en DLQ et marque traité', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('agent down'));

    await consumer.handleMessage({
      topic: 'lot.submitted',
      consumerGroup: 'g1',
      raw: JSON.stringify({
        eventId: 'evt-3',
        eventType: 'lot.submitted',
        occurredAt: new Date().toISOString(),
        lotId: 'lot-1',
        payload: {},
      }),
      handler,
    });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(producer.publish).toHaveBeenCalledWith(
      'agentforge.dlq',
      expect.objectContaining({
        eventType: 'dlq',
        payload: expect.objectContaining({
          originalTopic: 'lot.submitted',
          error: 'agent down',
        }),
      }),
    );
    expect(processed.mark).toHaveBeenCalledWith('evt-3', 'lot.submitted', 'g1');
  });

  it('envoie en DLQ un message sans eventId', async () => {
    await consumer.handleMessage({
      topic: 'lot.submitted',
      consumerGroup: 'g1',
      raw: JSON.stringify({ eventType: 'lot.submitted' }),
      handler: jest.fn(),
    });

    expect(producer.publish).toHaveBeenCalledWith(
      'agentforge.dlq',
      expect.objectContaining({ eventType: 'dlq' }),
    );
    expect(processed.mark).not.toHaveBeenCalled();
  });
});
