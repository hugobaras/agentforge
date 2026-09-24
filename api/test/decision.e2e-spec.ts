import { INestApplication } from '@nestjs/common';
import { LotStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';

describe('Decision (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantId: string;
  let lotId: string;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    const tenant = await prisma.tenant.create({
      data: { name: `e2e-decision-${Date.now()}` },
    });
    tenantId = tenant.id;
    const lot = await prisma.lot.create({
      data: {
        tenantId,
        title: 'Lot décision',
        status: LotStatus.EVALUATING,
        spec: { create: { title: 'Spec', body: 'GET /ping' } },
      },
    });
    lotId = lot.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app.close();
  });

  it('POST /lots/:id/decisions APPROVE met le lot en APPROVED', async () => {
    const response = await request(app.getHttpServer())
      .post(`/lots/${lotId}/decisions`)
      .send({ type: 'APPROVE', comment: 'Validé à la main' })
      .expect(201);

    expect(response.body.type).toBe('APPROVE');
    expect(response.body.comment).toBe('Validé à la main');
    expect(response.body.lotId).toBe(lotId);

    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
    expect(lot.status).toBe(LotStatus.APPROVED);
  });

  it('POST ARBITRATE exige un commentaire et conserve le statut', async () => {
    await prisma.lot.update({
      where: { id: lotId },
      data: { status: LotStatus.EVALUATING },
    });

    await request(app.getHttpServer())
      .post(`/lots/${lotId}/decisions`)
      .send({ type: 'ARBITRATE', comment: 'Relire le contrat d’API' })
      .expect(201);

    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
    expect(lot.status).toBe(LotStatus.EVALUATING);
  });

  it('POST reject sans commentaire renvoie 400', async () => {
    await request(app.getHttpServer())
      .post(`/lots/${lotId}/decisions`)
      .send({ type: 'REJECT' })
      .expect(400);
  });

  it('GET /lots/:id/decisions liste le journal', async () => {
    const response = await request(app.getHttpServer())
      .get(`/lots/${lotId}/decisions`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.some((d: { type: string }) => d.type === 'APPROVE')).toBe(
      true,
    );
  });

  it('POST sur un lot inconnu renvoie 404', async () => {
    await request(app.getHttpServer())
      .post('/lots/00000000-0000-4000-8000-000000000000/decisions')
      .send({ type: 'APPROVE' })
      .expect(404);
  });
});
