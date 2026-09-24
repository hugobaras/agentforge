import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AgentRunType, LotStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { parseDeliverableFiles } from '../integration/workspace/deliverable-files';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TOPICS } from '../kafka/kafka.constants';
import { GitPrOpenedPayload } from '../kafka/kafka.types';
import { PrismaService } from '../prisma/prisma.service';
import { LotRealtimeService } from '../realtime/lot-realtime.service';
import { GITHUB_CLIENT, type GitHubClient } from './github-client';
import { OctokitGitHubClient } from './octokit-github.client';
import {
  lotHeadBranch,
  parseGithubRepo,
  sanitizeBranch,
} from './parse-github-repo';

@Injectable()
export class GitService {
  private readonly logger = new Logger(GitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly realtime: LotRealtimeService,
    @Optional()
    @Inject(GITHUB_CLIENT)
    private readonly injectedClient?: GitHubClient,
  ) {}

  async openForApprovedLot(lotId: string): Promise<void> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        tenant: true,
        pullRequest: true,
        spec: true,
        agentRuns: {
          where: { type: AgentRunType.IMPLEMENTER, finishedAt: { not: null } },
          orderBy: { finishedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!lot) {
      this.logger.warn(`Lot ${lotId} introuvable — skip PR`);
      return;
    }
    if (lot.status !== LotStatus.APPROVED) {
      this.logger.log(`Lot ${lotId} statut=${lot.status} — skip PR`);
      return;
    }
    if (lot.pullRequest) {
      this.logger.log(`PR déjà enregistrée lot=${lotId} #${lot.pullRequest.number}`);
      return;
    }
    if (!lot.repoUrl?.trim()) {
      this.logger.log(`Lot ${lotId} sans repoUrl — skip PR`);
      return;
    }

    const token = lot.tenant.githubToken?.trim() || process.env.GITHUB_TOKEN?.trim();
    if (!token) {
      this.logger.warn(
        `Pas de GITHUB_TOKEN (env ou tenant) pour lot=${lotId} — skip PR`,
      );
      await this.realtime.emit(lotId, 'git.pr.skipped', {
        reason: 'Aucun jeton GitHub configuré.',
      });
      return;
    }

    const deliverable = lot.agentRuns[0]?.deliverable;
    const parsed = parseDeliverableFiles(deliverable ?? '');
    if (parsed.files.length === 0) {
      this.logger.warn(`Aucun fichier livrable pour PR lot=${lotId}`);
      await this.realtime.emit(lotId, 'git.pr.skipped', {
        reason: parsed.error ?? 'Aucun fichier dans le livrable.',
      });
      return;
    }

    try {
      const repo = parseGithubRepo(lot.repoUrl);
      const baseBranch = sanitizeBranch(lot.baseBranch);
      const headBranch = lotHeadBranch(lot.id);
      const client =
        this.injectedClient ?? (await OctokitGitHubClient.fromToken(token));
      const created = await client.createPullRequest({
        owner: repo.owner,
        repo: repo.repo,
        baseBranch,
        headBranch,
        title: `AgentForge: ${lot.title}`,
        body: this.prBody(lot),
        commitMessage: `feat: livrable AgentForge — ${lot.title}`,
        files: parsed.files,
      });

      const record = await this.prisma.pullRequest.create({
        data: {
          lotId: lot.id,
          number: created.number,
          url: created.url,
          branch: created.branch,
          headSha: created.headSha,
        },
      });

      await this.kafkaProducer.publish<GitPrOpenedPayload>(
        TOPICS.GIT_PR_OPENED,
        {
          eventId: randomUUID(),
          eventType: TOPICS.GIT_PR_OPENED,
          occurredAt: new Date().toISOString(),
          lotId: lot.id,
          payload: {
            lotId: lot.id,
            number: record.number,
            url: record.url,
            branch: record.branch,
          },
        },
        lot.id,
      );

      await this.realtime.emit(lot.id, TOPICS.GIT_PR_OPENED, {
        number: record.number,
        url: record.url,
        branch: record.branch,
      });

      this.logger.log(`PR #${record.number} ouverte lot=${lot.id} ${record.url}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Échec PR GitHub lot=${lotId}: ${message}`);
      await this.realtime.emit(lotId, 'git.pr.failed', { reason: message });
    }
  }

  private prBody(lot: {
    title: string;
    spec: { title: string; body: string } | null;
  }): string {
    const spec = lot.spec
      ? `## Spec\n\n**${lot.spec.title}**\n\n${lot.spec.body}`
      : '';
    return [
      `Pull request générée automatiquement par AgentForge pour le lot **${lot.title}**.`,
      spec,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}
