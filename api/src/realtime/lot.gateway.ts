import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { LotRealtimeMessage } from './lot-realtime.message';

@WebSocketGateway({
  cors: { origin: true },
})
export class LotGateway {
  private readonly logger = new Logger(LotGateway.name);

  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lotId?: string },
  ): { joined: string } | { error: string } {
    if (!body?.lotId) {
      return { error: 'lotId requis' };
    }
    const room = `lot:${body.lotId}`;
    void client.join(room);
    this.logger.debug(`${client.id} a rejoint ${room}`);
    return { joined: room };
  }

  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lotId?: string },
  ): { left: string } | { error: string } {
    if (!body?.lotId) {
      return { error: 'lotId requis' };
    }
    const room = `lot:${body.lotId}`;
    void client.leave(room);
    return { left: room };
  }

  emitToLot(message: LotRealtimeMessage): void {
    this.server?.to(`lot:${message.lotId}`).emit('lot.event', message);
  }
}
