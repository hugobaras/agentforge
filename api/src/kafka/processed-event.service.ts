import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProcessedEventService {
  constructor(private readonly prisma: PrismaService) {}

  async wasProcessed(eventId: string, consumerGroup: string): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({
      where: {
        eventId_consumerGroup: { eventId, consumerGroup },
      },
    });
    return row !== null;
  }

  async mark(
    eventId: string,
    topic: string,
    consumerGroup: string,
  ): Promise<void> {
    try {
      await this.prisma.processedEvent.create({
        data: { eventId, topic, consumerGroup },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }
}
