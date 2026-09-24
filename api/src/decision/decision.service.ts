import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decision, DecisionType, LotStatus } from '@prisma/client';
import { GitService } from '../git/git.service';
import { PrismaService } from '../prisma/prisma.service';
import { LotRealtimeService } from '../realtime/lot-realtime.service';
import { CreateDecisionDto } from './dto/create-decision.dto';

const TERMINAL_BY_TYPE: Partial<Record<DecisionType, LotStatus>> = {
  [DecisionType.APPROVE]: LotStatus.APPROVED,
  [DecisionType.REJECT]: LotStatus.REJECTED,
};

@Injectable()
export class DecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: LotRealtimeService,
    private readonly git: GitService,
  ) {}

  async create(lotId: string, dto: CreateDecisionDto): Promise<Decision> {
    const lot = await this.prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot) {
      throw new NotFoundException(`Lot ${lotId} introuvable`);
    }

    const comment = dto.comment?.trim() ? dto.comment.trim() : null;
    if (
      (dto.type === DecisionType.REJECT || dto.type === DecisionType.ARBITRATE) &&
      !comment
    ) {
      throw new BadRequestException(
        'Un commentaire est requis pour un rejet ou un arbitrage',
      );
    }

    const decision = await this.prisma.decision.create({
      data: { lotId, type: dto.type, comment },
    });

    const nextStatus = TERMINAL_BY_TYPE[dto.type];
    if (nextStatus) {
      await this.prisma.lot.update({
        where: { id: lotId },
        data: { status: nextStatus },
      });
    }

    await this.realtime.emit(lotId, 'decision.created', {
      decisionId: decision.id,
      type: decision.type,
      comment: decision.comment,
    });

    if (nextStatus === LotStatus.APPROVED) {
      await this.git.openForApprovedLot(lotId);
    }

    return decision;
  }

  async findAll(lotId: string): Promise<Decision[]> {
    const lot = await this.prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot) {
      throw new NotFoundException(`Lot ${lotId} introuvable`);
    }

    return this.prisma.decision.findMany({
      where: { lotId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
