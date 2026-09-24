import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LotStatus } from '@prisma/client';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TOPICS } from '../kafka/kafka.constants';
import { PrismaService } from '../prisma/prisma.service';
import { SubmissionService } from './submission.service';

describe('SubmissionService', () => {
  let service: SubmissionService;
  let prisma: {
    tenant: { findUnique: jest.Mock };
    lot: { create: jest.Mock };
  };
  let kafkaProducer: { publish: jest.Mock };

  const lot = {
    id: 'lot-1',
    tenantId: 'tenant-1',
    title: 'Lot test',
    status: LotStatus.SUBMITTED,
    spec: { title: 'Spec', body: 'Body' },
  };

  beforeEach(() => {
    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      lot: { create: jest.fn().mockResolvedValue(lot) },
    };
    kafkaProducer = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new SubmissionService(
      prisma as unknown as PrismaService,
      kafkaProducer as unknown as KafkaProducerService,
    );
  });

  it('crée le lot SUBMITTED et publie lot.submitted', async () => {
    const created = await service.create({
      tenantId: 'tenant-1',
      title: 'Lot test',
      spec: { title: 'Spec', body: 'Body' },
      repoUrl: 'acme/api',
      baseBranch: 'develop',
    });

    expect(prisma.lot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repoUrl: 'acme/api',
          baseBranch: 'develop',
        }),
      }),
    );

    expect(created.status).toBe(LotStatus.SUBMITTED);
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.LOT_SUBMITTED,
      expect.objectContaining({
        eventType: TOPICS.LOT_SUBMITTED,
        lotId: 'lot-1',
        payload: expect.objectContaining({ lotId: 'lot-1', tenantId: 'tenant-1' }),
      }),
      'lot-1',
    );
  });

  it('ne publie pas si le tenant est inconnu', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(
      service.create({
        tenantId: 'missing',
        title: 'x',
        spec: { title: 's', body: 'b' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(kafkaProducer.publish).not.toHaveBeenCalled();
  });

  it('refuse un repoUrl hors GitHub', async () => {
    await expect(
      service.create({
        tenantId: 'tenant-1',
        title: 'x',
        spec: { title: 's', body: 'b' },
        repoUrl: 'https://gitlab.com/acme/api',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lot.create).not.toHaveBeenCalled();
  });
});
