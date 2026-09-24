import { AgentRunType, LotStatus } from '@prisma/client';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TOPICS } from '../kafka/kafka.constants';
import { PrismaService } from '../prisma/prisma.service';
import { ImplementerAgent } from './agents/implementer-agent';
import { ExecutionService } from './execution.service';

describe('ExecutionService', () => {
  let service: ExecutionService;
  let prisma: {
    lot: { findUnique: jest.Mock; update: jest.Mock };
    agentRun: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
  };
  let kafkaProducer: { publish: jest.Mock };
  let implementer: { implement: jest.Mock };

  const lot = {
    id: 'lot-1',
    title: 'Lot ping',
    spec: { title: 'Ping', body: 'GET /ping' },
  };

  const result = {
    summary: 'mock',
    provider: 'mock',
    files: [{ path: 'src/a.ts', content: 'export {}' }],
  };

  beforeEach(() => {
    prisma = {
      lot: {
        findUnique: jest.fn().mockResolvedValue(lot),
        update: jest.fn().mockResolvedValue({ ...lot, status: 'IMPLEMENTING' }),
      },
      agentRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockResolvedValue({ id: 'run-1' }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    kafkaProducer = { publish: jest.fn().mockResolvedValue(undefined) };
    implementer = { implement: jest.fn().mockResolvedValue(result) };
    service = new ExecutionService(
      prisma as unknown as PrismaService,
      kafkaProducer as unknown as KafkaProducerService,
      implementer as unknown as ImplementerAgent,
    );
  });

  it('appelle l’agent, stocke le livrable et publie agent.implemented', async () => {
    await service.implementFromSubmitted({
      lotId: 'lot-1',
      tenantId: 't1',
      title: 'Lot ping',
      spec: { title: 'Ping', body: 'GET /ping' },
    });

    expect(prisma.lot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: { status: LotStatus.IMPLEMENTING },
    });
    expect(implementer.implement).toHaveBeenCalledWith({
      lotId: 'lot-1',
      title: 'Lot ping',
      spec: { title: 'Ping', body: 'GET /ping' },
    });
    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: { lotId: 'lot-1', type: AgentRunType.IMPLEMENTER },
    });
    expect(prisma.agentRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        deliverable: JSON.stringify(result),
        finishedAt: expect.any(Date),
      },
    });
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.AGENT_IMPLEMENTED,
      expect.objectContaining({
        eventType: TOPICS.AGENT_IMPLEMENTED,
        lotId: 'lot-1',
        payload: expect.objectContaining({
          lotId: 'lot-1',
          agentRunId: 'run-1',
        }),
      }),
      'lot-1',
    );
  });

  it('réutilise un run IMPLEMENTER inachevé au lieu d’en créer un autre', async () => {
    prisma.agentRun.findFirst.mockResolvedValue({
      id: 'run-open',
      deliverable: null,
      finishedAt: null,
    });

    await service.implementFromSubmitted({
      lotId: 'lot-1',
      tenantId: 't1',
      title: 'Lot ping',
      spec: { title: 'Ping', body: 'GET /ping' },
    });

    expect(prisma.agentRun.create).not.toHaveBeenCalled();
    expect(prisma.agentRun.update).toHaveBeenCalledWith({
      where: { id: 'run-open' },
      data: {
        deliverable: JSON.stringify(result),
        finishedAt: expect.any(Date),
      },
    });
  });

  it('publie un livrable de repli si l’agent échoue', async () => {
    implementer.implement.mockRejectedValue(new Error('JSON invalide'));

    await service.implementFromSubmitted({
      lotId: 'lot-1',
      tenantId: 't1',
      title: 'Lot ping',
      spec: { title: 'Ping', body: 'GET /ping' },
    });

    expect(prisma.agentRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        deliverable: expect.stringContaining('IMPLEMENTATION_FAILED.md'),
        finishedAt: expect.any(Date),
      },
    });
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.AGENT_IMPLEMENTED,
      expect.objectContaining({ eventType: TOPICS.AGENT_IMPLEMENTED }),
      'lot-1',
    );
  });

  it('ne rappelle pas l’agent si un livrable existe déjà', async () => {
    prisma.agentRun.findFirst.mockResolvedValue({
      id: 'run-old',
      deliverable: '{"summary":"déjà là"}',
      finishedAt: new Date(),
    });

    await service.implementFromSubmitted({
      lotId: 'lot-1',
      tenantId: 't1',
      title: 'Lot ping',
      spec: { title: 'Ping', body: 'GET /ping' },
    });

    expect(implementer.implement).not.toHaveBeenCalled();
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.AGENT_IMPLEMENTED,
      expect.objectContaining({
        payload: expect.objectContaining({ agentRunId: 'run-old' }),
      }),
      'lot-1',
    );
  });

  it('ignore un lot déjà tranché manuellement', async () => {
    prisma.lot.findUnique.mockResolvedValue({
      ...lot,
      status: LotStatus.APPROVED,
    });

    await service.implementFromSubmitted({
      lotId: 'lot-1',
      tenantId: 't1',
      title: 'Lot ping',
      spec: { title: 'Ping', body: 'GET /ping' },
    });

    expect(implementer.implement).not.toHaveBeenCalled();
    expect(kafkaProducer.publish).not.toHaveBeenCalled();
  });

  it('crée un nouveau run en rework et passe le feedback à l’agent', async () => {
    await service.implementFromRework({
      lotId: 'lot-1',
      evaluationId: 'ev-1',
      score: 40,
      feedback: 'manque GET /ping',
      previousDeliverable: '{"summary":"v1"}',
      iteration: 2,
      maxIterations: 3,
    });

    expect(implementer.implement).toHaveBeenCalledWith({
      lotId: 'lot-1',
      title: 'Lot ping',
      spec: { title: 'Ping', body: 'GET /ping' },
      previousDeliverable: '{"summary":"v1"}',
      feedback: 'manque GET /ping',
      iteration: 2,
    });
    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: { lotId: 'lot-1', type: AgentRunType.IMPLEMENTER },
    });
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.AGENT_IMPLEMENTED,
      expect.objectContaining({
        payload: expect.objectContaining({ agentRunId: 'run-1' }),
      }),
      'lot-1',
    );
  });

  it('ne relance pas l’agent si l’itération de rework est déjà livrée', async () => {
    prisma.agentRun.count.mockResolvedValue(2);
    prisma.agentRun.findFirst.mockResolvedValue({
      id: 'run-2',
      deliverable: '{"summary":"v2"}',
      finishedAt: new Date(),
    });

    await service.implementFromRework({
      lotId: 'lot-1',
      evaluationId: 'ev-1',
      score: 40,
      feedback: 'encore',
      previousDeliverable: '{"summary":"v1"}',
      iteration: 2,
      maxIterations: 3,
    });

    expect(implementer.implement).not.toHaveBeenCalled();
    expect(prisma.agentRun.create).not.toHaveBeenCalled();
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      TOPICS.AGENT_IMPLEMENTED,
      expect.objectContaining({
        payload: expect.objectContaining({ agentRunId: 'run-2' }),
      }),
      'lot-1',
    );
  });

  it('ignore un rework si le plafond d’itérations est atteint', async () => {
    prisma.agentRun.count.mockResolvedValue(3);

    await service.implementFromRework({
      lotId: 'lot-1',
      evaluationId: 'ev-1',
      score: 40,
      feedback: 'faible',
      previousDeliverable: '{}',
      iteration: 4,
      maxIterations: 3,
    });

    expect(implementer.implement).not.toHaveBeenCalled();
    expect(kafkaProducer.publish).not.toHaveBeenCalled();
  });

  it('ignore un lot introuvable sans publier', async () => {
    prisma.lot.findUnique.mockResolvedValue(null);

    await service.implementFromSubmitted({
      lotId: 'missing',
      tenantId: 't1',
      title: 'x',
      spec: { title: 's', body: 'b' },
    });

    expect(implementer.implement).not.toHaveBeenCalled();
    expect(kafkaProducer.publish).not.toHaveBeenCalled();
  });
});
