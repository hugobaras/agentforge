import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LotRealtimeMessage } from './lot-realtime.message';
import { LotGateway } from './lot.gateway';

@Injectable()
export class LotRealtimeService {
  private readonly logger = new Logger(LotRealtimeService.name);

  constructor(
    private readonly gateway: LotGateway,
    private readonly prisma: PrismaService,
  ) {}

  async emit(
    lotId: string | undefined,
    eventType: string,
    payload: unknown,
  ): Promise<LotRealtimeMessage | null> {
    if (!lotId) {
      return null;
    }

    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { status: true },
    });

    const message: LotRealtimeMessage = {
      lotId,
      status: lot?.status ?? 'UNKNOWN',
      eventType,
      payload,
    };

    this.gateway.emitToLot(message);
    this.logger.debug(`WS lot:${lotId} ${eventType} status=${message.status}`);
    return message;
  }
}
