import { AgentRunType, LotStatus } from '@prisma/client';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TOPICS } from '../kafka/kafka.constants';
import { PrismaService } from '../prisma/prisma.service';
import { LotRealtimeService } from '../realtime/lot-realtime.service';
import { GitHubClient } from './github-client';
import { GitService } from './git.service';

describe('GitService', () => {
  let service: GitService;
  let prisma: {
    lot: { findUnique: jest.Mock };
    pullRequest: { create: jest.Mock };
  };
  let kafka: { publish: jest.Mock };
  let realtime: { emit: jest.Mock };
  let github: { createPullRequest: jest.Mock };

  const lot = {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    title: 'Lot ping',
    status: LotStatus.APPROVED,
    repoUrl: 'acme/api',
    baseBranch: 'main',
    tenant: { githubToken: 'tenant-token' },
    pullRequest: null,
    spec: { title: 'Ping', body: 'GET /ping' },
    agentRuns: [
      {
        type: AgentRunType.IMPLEMENTER,
        deliverable: JSON.stringify({
          files: [{ path: 'src/ping.mjs', content: 'export const ping = true' }],
        }),
      },
    ],
  };

  beforeEach(() => {
    prisma = {
      lot: { findUnique: jest.fn().mockResolvedValue(lot) },
      pullRequest: {
        create: jest.fn().mockResolvedValue({
          number: 12,
          url: 'https://github.com/acme/api/pull/12',
          branch: 'agentforge/lot-aaaaaaaabbbb',
        }),
      },
    };
    kafka = { publish: jest.fn().mockResolvedValue(undefined) };
    realtime = { emit: jest.fn().mockResolvedValue(undefined) };
    github = {
      createPullRequest: jest.fn().mockResolvedValue({
        number: 12,
        url: 'https://github.com/acme/api/pull/12',
        branch: 'agentforge/lot-aaaaaaaabbbb',
        headSha: 'abc123',
      }),
    };
    service = new GitService(
      prisma as unknown as PrismaService,
      kafka as unknown as KafkaProducerService,
      realtime as unknown as LotRealtimeService,
      github as unknown as GitHubClient,
    );
  });

  it('ouvre une PR et enregistre le résultat', async () => {
    await service.openForApprovedLot(lot.id);

    expect(github.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'api',
        baseBranch: 'main',
        files: [{ path: 'src/ping.mjs', content: 'export const ping = true' }],
      }),
    );
    expect(prisma.pullRequest.create).toHaveBeenCalled();
    expect(kafka.publish).toHaveBeenCalledWith(
      TOPICS.GIT_PR_OPENED,
      expect.objectContaining({ eventType: TOPICS.GIT_PR_OPENED }),
      lot.id,
    );
    expect(realtime.emit).toHaveBeenCalledWith(
      lot.id,
      TOPICS.GIT_PR_OPENED,
      expect.objectContaining({ number: 12 }),
    );
  });

  it('ne rappelle pas GitHub si une PR existe déjà', async () => {
    prisma.lot.findUnique.mockResolvedValue({
      ...lot,
      pullRequest: { number: 3, url: 'https://github.com/acme/api/pull/3' },
    });

    await service.openForApprovedLot(lot.id);

    expect(github.createPullRequest).not.toHaveBeenCalled();
  });

  it('skip sans repoUrl', async () => {
    prisma.lot.findUnique.mockResolvedValue({ ...lot, repoUrl: null });

    await service.openForApprovedLot(lot.id);

    expect(github.createPullRequest).not.toHaveBeenCalled();
  });

  it('émet git.pr.skipped sans jeton', async () => {
    prisma.lot.findUnique.mockResolvedValue({
      ...lot,
      tenant: { githubToken: null },
    });
    const previous = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    await service.openForApprovedLot(lot.id);

    expect(github.createPullRequest).not.toHaveBeenCalled();
    expect(realtime.emit).toHaveBeenCalledWith(
      lot.id,
      'git.pr.skipped',
      expect.objectContaining({ reason: expect.stringMatching(/jeton/i) }),
    );

    if (previous !== undefined) {
      process.env.GITHUB_TOKEN = previous;
    }
  });

  it('émet git.pr.failed si GitHub échoue', async () => {
    github.createPullRequest.mockRejectedValue(new Error('403'));

    await service.openForApprovedLot(lot.id);

    expect(realtime.emit).toHaveBeenCalledWith(
      lot.id,
      'git.pr.failed',
      expect.objectContaining({ reason: '403' }),
    );
    expect(prisma.pullRequest.create).not.toHaveBeenCalled();
  });
});
