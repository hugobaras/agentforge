import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';

describe('Submission (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantId: string;

  const specPayload = {
    title: 'Spec e2e',
    body: 'GET /ping doit répondre {"pong":true}',
  };

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    const tenant = await prisma.tenant.create({
      data: { name: `e2e-submission-${Date.now()}` },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app.close();
  });

  it('POST /lots crée un lot DRAFT avec sa spec', async () => {
    const response = await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId,
        title: 'Lot e2e ping',
        spec: specPayload,
      })
      .expect(201);

    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.status).toBe('SUBMITTED');
    expect(response.body.title).toBe('Lot e2e ping');
    expect(response.body.tenantId).toBe(tenantId);
    expect(response.body.spec).toMatchObject(specPayload);
  });

  it('POST /lots sans champs requis renvoie 400', async () => {
    await request(app.getHttpServer())
      .post('/lots')
      .send({ title: 'Incomplet' })
      .expect(400);
  });

  it('POST /lots avec un tenant inconnu renvoie 404', async () => {
    await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000000',
        title: 'Lot orphelin',
        spec: specPayload,
      })
      .expect(404);
  });

  it('GET /lots liste les lots du tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId,
        title: 'Lot liste',
        spec: specPayload,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/lots')
      .query({ tenantId })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.some((lot: { id: string }) => lot.id === created.body.id)).toBe(
      true,
    );
  });

  it('GET /lots/:id retourne le lot, 404 si absent', async () => {
    const created = await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId,
        title: 'Lot détail',
        spec: specPayload,
      })
      .expect(201);

    const found = await request(app.getHttpServer())
      .get(`/lots/${created.body.id}`)
      .expect(200);

    expect(found.body.title).toBe('Lot détail');
    expect(found.body.agentRuns).toEqual([]);
    expect(found.body.evaluations).toEqual([]);
    expect(found.body.decisions).toEqual([]);

    await request(app.getHttpServer())
      .get('/lots/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });

  it('PATCH /lots/:id met à jour le titre et la spec', async () => {
    const created = await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId,
        title: 'Lot à modifier',
        spec: specPayload,
      })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/lots/${created.body.id}`)
      .send({
        title: 'Lot modifié',
        spec: { body: 'Nouvelle spec' },
      })
      .expect(200);

    expect(updated.body.title).toBe('Lot modifié');
    expect(updated.body.spec.body).toBe('Nouvelle spec');
    expect(updated.body.spec.title).toBe(specPayload.title);
  });

  it('GET /tenants liste les tenants', async () => {
    const response = await request(app.getHttpServer()).get('/tenants').expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.some((tenant: { id: string }) => tenant.id === tenantId)).toBe(
      true,
    );
  });

  it('DELETE /lots/:id supprime le lot', async () => {
    const created = await request(app.getHttpServer())
      .post('/lots')
      .send({
        tenantId,
        title: 'Lot à supprimer',
        spec: specPayload,
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/lots/${created.body.id}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/lots/${created.body.id}`)
      .expect(404);
  });
});
