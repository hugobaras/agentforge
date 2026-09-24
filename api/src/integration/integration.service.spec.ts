import { AgentRunType, LotStatus } from '@prisma/client';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TOPICS } from '../kafka/kafka.constants';
import { PrismaService } from '../prisma/prisma.service';
import type { GitService } from '../git/git.service';
import type { VerifierAgent } from './agents/verifier-agent';
import { IntegrationService } from './integration.service';

describe('IntegrationService', () => {
  let service: IntegrationService;
  let prisma: {
    lot: { findUnique: jest.Mock; update: jest.Mock };
    agentRun: { create: jest.Mock; update: jest.Mock };
  };
  let kafkaProducer: { publish: jest.Mock };
  let verifier: { verify: jest.Mock };
  let git: { openForApprovedLot: jest.Mock };

  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const lot = {
    id: 'lot-1',
    title: 'Lot ping',
    status: LotStatus.EVALUATING,
    spec: { title: 'Ping', body: 'GET /ping' },
    agentRuns: [
      {
        id: 'impl-1',
        deliverable: '{"files":[]}',
        createdAt,
        finishedAt: createdAt,
      },
    ],
    evaluations: [{ id: 'ev-1', createdAt }],
  };

  beforeEach(() => {
    prisma = {
      lot: {
        findUnique: jest.fn().mockResolvedValue(lot),
        update: jest.fn(),
      },
      agentRun: {
        create: jest.fn().mockResolvedValue({ id: 'ver-1' }),
        update: jest.fn(),
      },
    };
    kafkaProducer = { publish: jest.fn().mockResolvedValue(undefined) };
    verifier = {
      verify: jest.fn().mockResolvedValue({
        approved: true,
        reason: 'OK',
        checks: { standards: true, tests: true, fidelity: true },
        provider: 'mock',
      }),
    };
    git = { openForApprovedLot: jest.fn().mockResolvedValue(undefined) };
    service = new IntegrationService(
      prisma as unknown as PrismaService,
      kafkaProducer as unknown as KafkaProducerService,
      verifier as unknown as VerifierAgent,
      { approvalThreshold: 70, maxImplementIterations: 3 },
      git as unknown as GitService,
    );
  });

  it('publie lot.rework si le score est sous le seuil et qu’il reste des itérations', async () => {
    await service.verifyFromScored({
      lotId: 'lot-1',
      evaluationId: 'ev-1',
      agentRunId: 'eval-1',
      score: 40,
      feedback: 'faible',
    });

    expect(verifier.verify).not.toHaveBeenCalled();
    expect(prisma.lot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { status: LotStatus.IMPLEMENTING },
    });
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.LOT_REWORK,
      expect.objectContaining({
        eventType: TOPICS.LOT_REWORK,
        payload: expect.objectContaining({
          lotId: 'lot-1',
          evaluationId: 'ev-1',
          score: 40,
          feedback: 'faible',
          previousDeliverable: '{"files":[]}',
          iteration: 2,
          maxIterations: 3,
        }),
      }),
      'lot-1',
    );
  });

  it('rejette sans vérificateur si le score est sous le seuil au plafond d’itérations', async () => {
    prisma.lot.findUnique.mockResolvedValue({
      ...lot,
      agentRuns: [
        { id: 'impl-3', deliverable: '{}', createdAt, finishedAt: createdAt },
        { id: 'impl-2', deliverable: '{}', createdAt, finishedAt: createdAt },
        { id: 'impl-1', deliverable: '{}', createdAt, finishedAt: createdAt },
      ],
    });

    await service.verifyFromScored({
      lotId: 'lot-1',
      evaluationId: 'ev-1',
      agentRunId: 'eval-1',
      score: 40,
      feedback: 'faible',
    });

    expect(verifier.verify).not.toHaveBeenCalled();
    expect(prisma.lot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { status: LotStatus.REJECTED },
    });
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.VERIFICATION_REJECTED,
      expect.objectContaining({
        eventType: TOPICS.VERIFICATION_REJECTED,
        payload: expect.objectContaining({
          approved: false,
          threshold: 70,
          evaluationScore: 40,
        }),
      }),
      'lot-1',
    );
  });

  it('ignore un replay si un IMPLEMENTER plus récent que l’évaluation existe', async () => {
    prisma.lot.findUnique.mockResolvedValue({
      ...lot,
      agentRuns: [
        {
          id: 'impl-2',
          deliverable: '{"v":2}',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          finishedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
        {
          id: 'impl-1',
          deliverable: '{"v":1}',
          createdAt,
          finishedAt: createdAt,
        },
      ],
      evaluations: [{ id: 'ev-1', createdAt }],
    });

    await service.verifyFromScored({
      lotId: 'lot-1',
      evaluationId: 'ev-1',
      agentRunId: 'eval-1',
      score: 40,
      feedback: 'faible',
    });

    expect(verifier.verify).not.toHaveBeenCalled();
    expect(kafkaProducer.publish).not.toHaveBeenCalled();
    expect(prisma.lot.update).not.toHaveBeenCalled();
  });

  it('lance le vérificateur et publie verification.approved', async () => {
    await service.verifyFromScored({
      lotId: 'lot-1',
      evaluationId: 'ev-1',
      agentRunId: 'eval-1',
      score: 85,
      feedback: 'bon',
    });

    expect(prisma.lot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { status: LotStatus.VERIFYING },
    });
    expect(verifier.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        lotId: 'lot-1',
        deliverable: '{"files":[]}',
      }),
    );
    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: { lotId: 'lot-1', type: AgentRunType.VERIFIER },
    });
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.VERIFICATION_APPROVED,
      expect.objectContaining({ eventType: TOPICS.VERIFICATION_APPROVED }),
      'lot-1',
    );
    expect(prisma.lot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { status: LotStatus.APPROVED },
    });
    expect(git.openForApprovedLot).toHaveBeenCalledWith('lot-1');
  });

  it('publie verification.rejected si le vérificateur refuse', async () => {
    verifier.verify.mockResolvedValue({
      approved: false,
      reason: 'fidélité insuffisante',
      checks: { standards: true, tests: true, fidelity: false },
      provider: 'mock',
    });

    await service.verifyFromScored({
      lotId: 'lot-1',
      evaluationId: 'ev-1',
      agentRunId: 'eval-1',
      score: 90,
      feedback: 'bon',
    });

    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.VERIFICATION_REJECTED,
      expect.objectContaining({
        payload: expect.objectContaining({ approved: false }),
      }),
      'lot-1',
    );
    expect(git.openForApprovedLot).not.toHaveBeenCalled();
  });

  it('rejette le lot si le vérificateur échoue', async () => {
    verifier.verify.mockRejectedValue(new Error('JSON invalide'));

    await service.verifyFromScored({
      lotId: 'lot-1',
      evaluationId: 'ev-1',
      agentRunId: 'eval-1',
      score: 90,
      feedback: 'bon',
    });

    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.VERIFICATION_REJECTED,
      expect.objectContaining({
        payload: expect.objectContaining({ approved: false }),
      }),
      'lot-1',
    );
  });

  it('ignore un lot déjà tranché', async () => {
    prisma.lot.findUnique.mockResolvedValue({
      ...lot,
      status: LotStatus.APPROVED,
    });

    await service.verifyFromScored({
      lotId: 'lot-1',
      evaluationId: 'ev-1',
      agentRunId: 'eval-1',
      score: 90,
      feedback: 'bon',
    });

    expect(verifier.verify).not.toHaveBeenCalled();
    expect(kafkaProducer.publish).not.toHaveBeenCalled();
  });
});
