import { Global, Module } from '@nestjs/common';
import { LotRealtimeService } from './lot-realtime.service';
import { LotGateway } from './lot.gateway';

@Global()
@Module({
  providers: [LotGateway, LotRealtimeService],
  exports: [LotRealtimeService, LotGateway],
})
export class RealtimeModule {}
