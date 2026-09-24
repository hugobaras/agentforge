import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LotStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { parseGithubRepo, sanitizeBranch } from '../git/parse-github-repo';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TOPICS } from '../kafka/kafka.constants';
import { LotSubmittedPayload } from '../kafka/kafka.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';

const lotWithSpec = Prisma.validator<Prisma.LotDefaultArgs>()({
  include: { spec: true, pullRequest: true },
});

const lotDetailInclude = {
  spec: true,
  pullRequest: true,
  agentRuns: { orderBy: { createdAt: 'asc' as const } },
  evaluations: { orderBy: { createdAt: 'asc' as const } },
  decisions: { orderBy: { createdAt: 'asc' as const } },
};

const lotDetail = Prisma.validator<Prisma.LotDefaultArgs>()({
  include: lotDetailInclude,
});

export type LotWithSpec = Prisma.LotGetPayload<typeof lotWithSpec>;
export type LotDetail = Prisma.LotGetPayload<typeof lotDetail>;

@Injectable()
export class SubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async create(dto: CreateLotDto): Promise<LotWithSpec> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${dto.tenantId} introuvable`);
    }

    const repo = this.normalizeRepo(dto.repoUrl, dto.baseBranch);

    const lot = await this.prisma.lot.create({
      data: {
        tenantId: dto.tenantId,
        title: dto.title,
        status: LotStatus.SUBMITTED,
        repoUrl: repo.repoUrl,
        baseBranch: repo.baseBranch,
        spec: {
          create: {
            title: dto.spec.title,
            body: dto.spec.body,
          },
        },
      },
      include: { spec: true, pullRequest: true },
    });

    await this.kafkaProducer.publish<LotSubmittedPayload>(
      TOPICS.LOT_SUBMITTED,
      {
        eventId: randomUUID(),
        eventType: TOPICS.LOT_SUBMITTED,
        occurredAt: new Date().toISOString(),
        lotId: lot.id,
        payload: {
          lotId: lot.id,
          tenantId: lot.tenantId,
          title: lot.title,
          spec: {
            title: lot.spec?.title ?? dto.spec.title,
            body: lot.spec?.body ?? dto.spec.body,
          },
        },
      },
      lot.id,
    );

    return lot;
  }

  async findAll(tenantId?: string): Promise<LotWithSpec[]> {
    return this.prisma.lot.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: { spec: true, pullRequest: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<LotDetail> {
    const lot = await this.prisma.lot.findUnique({
      where: { id },
      include: lotDetailInclude,
    });
    if (!lot) {
      throw new NotFoundException(`Lot ${id} introuvable`);
    }
    return lot;
  }

  async update(id: string, dto: UpdateLotDto): Promise<LotWithSpec> {
    await this.findOne(id);

    const repo =
      dto.repoUrl !== undefined || dto.baseBranch !== undefined
        ? this.normalizeRepo(dto.repoUrl, dto.baseBranch)
        : undefined;

    return this.prisma.lot.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(repo
          ? { repoUrl: repo.repoUrl, baseBranch: repo.baseBranch }
          : {}),
        spec:
          dto.spec !== undefined
            ? {
                update: {
                  ...(dto.spec.title !== undefined
                    ? { title: dto.spec.title }
                    : {}),
                  ...(dto.spec.body !== undefined ? { body: dto.spec.body } : {}),
                },
              }
            : undefined,
      },
      include: { spec: true, pullRequest: true },
    });
  }

  private normalizeRepo(
    repoUrl?: string,
    baseBranch?: string,
  ): { repoUrl: string | null; baseBranch: string } {
    const trimmed = repoUrl?.trim() || null;
    if (trimmed) {
      try {
        parseGithubRepo(trimmed);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    try {
      return {
        repoUrl: trimmed,
        baseBranch: sanitizeBranch(baseBranch),
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.lot.delete({ where: { id } });
  }
}
