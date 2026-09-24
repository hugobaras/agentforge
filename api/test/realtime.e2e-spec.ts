import { INestApplication } from '@nestjs/common';
import { LotStatus } from '@prisma/client';
import { AddressInfo } from 'net';
import { io, type Socket } from 'socket.io-client';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { LotRealtimeService } from '../src/realtime/lot-realtime.service';
import { createTestApp } from './helpers/create-test-app';

describe('WebSocket lot rooms (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let realtime: LotRealtimeService;
  let socket: Socket;
  let lotId: string;
  let tenantId: string;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    realtime = app.get(LotRealtimeService);
    await app.listen(0);

    const tenant = await prisma.tenant.create({
      data: { name: `e2e-ws-${Date.now()}` },
    });
    tenantId = tenant.id;
    const lot = await prisma.lot.create({
      data: {
        tenantId,
        title: 'Lot WS',
        status: LotStatus.SUBMITTED,
        spec: { create: { title: 'Spec WS', body: 'GET /ping' } },
      },
    });
    lotId = lot.id;
  });

  afterAll(async () => {
    socket?.disconnect();
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app.close();
  });

  it('reçoit { lotId, status, eventType, payload } sur lot.event après join', async () => {
    const address = app.getHttpServer().address() as AddressInfo;
    socket = io(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });

    const joined = await new Promise<{ joined: string }>((resolve) => {
      socket.emit('join', { lotId }, resolve);
    });
    expect(joined.joined).toBe(`lot:${lotId}`);

    const received = new Promise<{
      lotId: string;
      status: string;
      eventType: string;
      payload: unknown;
    }>((resolve) => {
      socket.on('lot.event', resolve);
    });

    await realtime.emit(lotId, 'lot.submitted', { lotId, title: 'Lot WS' });
    const message = await received;

    expect(message).toEqual({
      lotId,
      status: LotStatus.SUBMITTED,
      eventType: 'lot.submitted',
      payload: { lotId, title: 'Lot WS' },
    });
  });
});
