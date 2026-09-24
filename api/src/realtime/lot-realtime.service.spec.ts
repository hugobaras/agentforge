import { LotStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LotRealtimeService } from './lot-realtime.service';
import { LotGateway } from './lot.gateway';

describe('LotRealtimeService', () => {
  let service: LotRealtimeService;
  let gateway: { emitToLot: jest.Mock };
  let prisma: { lot: { findUnique: jest.Mock } };

  beforeEach(() => {
    gateway = { emitToLot: jest.fn() };
    prisma = {
      lot: { findUnique: jest.fn().mockResolvedValue({ status: LotStatus.IMPLEMENTING }) },
    };
    service = new LotRealtimeService(
      gateway as unknown as LotGateway,
      prisma as unknown as PrismaService,
    );
  });

  it('émet { lotId, status, eventType, payload } vers la room', async () => {
    const message = await service.emit('lot-1', 'lot.submitted', { lotId: 'lot-1' });

    expect(message).toEqual({
      lotId: 'lot-1',
      status: LotStatus.IMPLEMENTING,
      eventType: 'lot.submitted',
      payload: { lotId: 'lot-1' },
    });
    expect(gateway.emitToLot).toHaveBeenCalledWith(message);
  });

  it('n’émet rien sans lotId', async () => {
    await expect(service.emit(undefined, 'x', {})).resolves.toBeNull();
    expect(gateway.emitToLot).not.toHaveBeenCalled();
  });

  it('utilise UNKNOWN si le lot est absent', async () => {
    prisma.lot.findUnique.mockResolvedValue(null);
    const message = await service.emit('missing', 'lot.submitted', {});
    expect(message?.status).toBe('UNKNOWN');
  });
});
