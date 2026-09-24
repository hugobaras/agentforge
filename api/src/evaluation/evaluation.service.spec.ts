import { AgentRunType, LotStatus } from '@prisma/client';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TOPICS } from '../kafka/kafka.constants';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluatorAgent } from './agents/evaluator-agent';
import { EvaluationService } from './evaluation.service';

describe('EvaluationService', () => {
  let service: EvaluationService;
  let prisma: {
    lot: { findUnique: jest.Mock; update: jest.Mock };
    agentRun: { create: jest.Mock; update: jest.Mock };
    evaluation: { findFirst: jest.Mock; create: jest.Mock };
  };
  let kafkaProducer: { publish: jest.Mock };
  let evaluator: { evaluate: jest.Mock };

  const lot = {
    id: 'lot-1',
    title: 'Lot ping',
    spec: { title: 'Ping', body: 'GET /ping' },
  };

  beforeEach(() => {
    prisma = {
      lot: {
        findUnique: jest.fn().mockResolvedValue(lot),
        update: jest.fn(),
      },
      agentRun: {
        create: jest.fn().mockResolvedValue({ id: 'eval-run-1' }),
        update: jest.fn(),
      },
      evaluation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'ev-1',
          lotId: 'lot-1',
          agentRunId: 'eval-run-1',
          score: 82,
          feedback: 'ok',
        }),
      },
    };
    kafkaProducer = { publish: jest.fn().mockResolvedValue(undefined) };
    evaluator = {
      evaluate: jest.fn().mockResolvedValue({
        score: 82.4,
        feedback: 'ok',
        provider: 'mock',
      }),
    };
    service = new EvaluationService(
      prisma as unknown as PrismaService,
      kafkaProducer as unknown as KafkaProducerService,
      evaluator as unknown as EvaluatorAgent,
    );
  });

  it('évalue, stocke Evaluation et publie evaluation.scored', async () => {
    await service.evaluateFromImplemented({
      lotId: 'lot-1',
      agentRunId: 'impl-1',
      deliverable: '{"summary":"ping"}',
    });

    expect(prisma.lot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { status: LotStatus.EVALUATING },
    });
    expect(evaluator.evaluate).toHaveBeenCalled();
    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: { lotId: 'lot-1', type: AgentRunType.EVALUATOR },
    });
    expect(prisma.evaluation.create).toHaveBeenCalledWith({
      data: {
        lotId: 'lot-1',
        agentRunId: 'impl-1',
        score: 82,
        feedback: 'ok',
      },
    });
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.EVALUATION_SCORED,
      expect.objectContaining({
        eventType: TOPICS.EVALUATION_SCORED,
        payload: expect.objectContaining({
          evaluationId: 'ev-1',
          score: 82,
        }),
      }),
      'lot-1',
    );
  });

  it('publie un score 0 si l’évaluateur échoue', async () => {
    evaluator.evaluate.mockRejectedValue(new Error('JSON invalide'));
    prisma.evaluation.create.mockResolvedValue({
      id: 'ev-fail',
      lotId: 'lot-1',
      agentRunId: 'eval-run-1',
      score: 0,
      feedback: "Échec de l'évaluateur : JSON invalide",
    });

    await service.evaluateFromImplemented({
      lotId: 'lot-1',
      agentRunId: 'impl-1',
      deliverable: '{}',
    });

    expect(prisma.evaluation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ score: 0 }),
    });
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.EVALUATION_SCORED,
      expect.objectContaining({
        payload: expect.objectContaining({ score: 0 }),
      }),
      'lot-1',
    );
  });

  it('ne réévalue pas si une Evaluation existe déjà pour cet agentRunId', async () => {
    prisma.evaluation.findFirst.mockResolvedValue({
      id: 'ev-old',
      lotId: 'lot-1',
      agentRunId: 'impl-1',
      score: 70,
      feedback: 'déjà là',
    });

    await service.evaluateFromImplemented({
      lotId: 'lot-1',
      agentRunId: 'impl-1',
      deliverable: '{}',
    });

    expect(prisma.evaluation.findFirst).toHaveBeenCalledWith({
      where: { lotId: 'lot-1', agentRunId: 'impl-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(evaluator.evaluate).not.toHaveBeenCalled();
    expect(prisma.evaluation.create).not.toHaveBeenCalled();
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.EVALUATION_SCORED,
      expect.objectContaining({
        payload: expect.objectContaining({ evaluationId: 'ev-old', score: 70 }),
      }),
      'lot-1',
    );
  });

  it('évalue à nouveau si l’agentRunId implémenteur est différent', async () => {
    prisma.evaluation.findFirst.mockResolvedValue(null);

    await service.evaluateFromImplemented({
      lotId: 'lot-1',
      agentRunId: 'impl-2',
      deliverable: '{"summary":"v2"}',
    });

    expect(prisma.evaluation.findFirst).toHaveBeenCalledWith({
      where: { lotId: 'lot-1', agentRunId: 'impl-2' },
      orderBy: { createdAt: 'desc' },
    });
    expect(evaluator.evaluate).toHaveBeenCalled();
    expect(prisma.evaluation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lotId: 'lot-1',
        agentRunId: 'impl-2',
      }),
    });
  });

  it('ignore un lot déjà tranché manuellement', async () => {
    prisma.lot.findUnique.mockResolvedValue({
      ...lot,
      status: LotStatus.REJECTED,
    });

    await service.evaluateFromImplemented({
      lotId: 'lot-1',
      agentRunId: 'impl-1',
      deliverable: '{}',
    });

    expect(evaluator.evaluate).not.toHaveBeenCalled();
    expect(kafkaProducer.publish).not.toHaveBeenCalled();
  });

  it('ignore un lot introuvable', async () => {
    prisma.lot.findUnique.mockResolvedValue(null);

    await service.evaluateFromImplemented({
      lotId: 'missing',
      agentRunId: 'impl-1',
      deliverable: '{}',
    });

    expect(evaluator.evaluate).not.toHaveBeenCalled();
    expect(kafkaProducer.publish).not.toHaveBeenCalled();
  });
});
