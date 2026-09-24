import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DecisionType, LotStatus } from '@prisma/client';
import type { GitService } from '../git/git.service';
import { PrismaService } from '../prisma/prisma.service';
import { LotRealtimeService } from '../realtime/lot-realtime.service';
import { DecisionService } from './decision.service';

describe('DecisionService', () => {
  let service: DecisionService;
  let prisma: {
    lot: { findUnique: jest.Mock; update: jest.Mock };
    decision: { create: jest.Mock; findMany: jest.Mock };
  };
  let realtime: { emit: jest.Mock };
  let git: { openForApprovedLot: jest.Mock };

  const lot = { id: 'lot-1', status: LotStatus.EVALUATING };
  const created = {
    id: 'dec-1',
    lotId: 'lot-1',
    type: DecisionType.APPROVE,
    comment: 'OK humain',
  };

  beforeEach(() => {
    prisma = {
      lot: {
        findUnique: jest.fn().mockResolvedValue(lot),
        update: jest.fn().mockResolvedValue({ ...lot, status: LotStatus.APPROVED }),
      },
      decision: {
        create: jest.fn().mockResolvedValue(created),
        findMany: jest.fn().mockResolvedValue([created]),
      },
    };
    realtime = { emit: jest.fn().mockResolvedValue(undefined) };
    git = { openForApprovedLot: jest.fn().mockResolvedValue(undefined) };
    service = new DecisionService(
      prisma as unknown as PrismaService,
      realtime as unknown as LotRealtimeService,
      git as unknown as GitService,
    );
  });

  it('APPROVE crée la décision, passe le lot en APPROVED et émet WS', async () => {
    const decision = await service.create('lot-1', {
      type: DecisionType.APPROVE,
      comment: 'OK humain',
    });

    expect(decision.type).toBe(DecisionType.APPROVE);
    expect(prisma.lot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { status: LotStatus.APPROVED },
    });
    expect(realtime.emit).toHaveBeenCalledWith(
      'lot-1',
      'decision.created',
      expect.objectContaining({ type: DecisionType.APPROVE }),
    );
    expect(git.openForApprovedLot).toHaveBeenCalledWith('lot-1');
  });

  it('REJECT exige un commentaire', async () => {
    await expect(
      service.create('lot-1', { type: DecisionType.REJECT }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.decision.create).not.toHaveBeenCalled();
  });

  it('ARBITRATE n’altère pas le statut du lot', async () => {
    prisma.decision.create.mockResolvedValue({
      ...created,
      type: DecisionType.ARBITRATE,
      comment: 'Besoin d’un avis',
    });

    await service.create('lot-1', {
      type: DecisionType.ARBITRATE,
      comment: 'Besoin d’un avis',
    });

    expect(prisma.lot.update).not.toHaveBeenCalled();
    expect(realtime.emit).toHaveBeenCalled();
    expect(git.openForApprovedLot).not.toHaveBeenCalled();
  });

  it('404 si le lot est inconnu', async () => {
    prisma.lot.findUnique.mockResolvedValue(null);

    await expect(
      service.create('missing', { type: DecisionType.APPROVE }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(realtime.emit).not.toHaveBeenCalled();
  });
});
