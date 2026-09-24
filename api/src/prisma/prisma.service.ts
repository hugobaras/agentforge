import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

function loadRootEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
    resolve(__dirname, '../../../.env'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      config({ path, quiet: true });
      return;
    }
  }
}

loadRootEnv();

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
