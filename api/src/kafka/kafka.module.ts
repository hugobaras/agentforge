import { Global, Module } from '@nestjs/common';
import { kafkaOptionsProvider } from './kafka.config';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaService } from './kafka.service';
import { LotSubmittedLogConsumer } from './lot-submitted-log.consumer';
import { ProcessedEventService } from './processed-event.service';

@Global()
@Module({
  providers: [
    kafkaOptionsProvider,
    KafkaService,
    KafkaProducerService,
    KafkaConsumerService,
    ProcessedEventService,
    LotSubmittedLogConsumer,
  ],
  exports: [KafkaService, KafkaProducerService, KafkaConsumerService],
})
export class KafkaModule {}
