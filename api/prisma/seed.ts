import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient, LotStatus } from '@prisma/client';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

const prisma = new PrismaClient();

const DEMO_TENANT_NAME = 'Tenant Démo';
const DEMO_LOT_TITLE = 'Lot fictif — endpoint ping';

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { name: DEMO_TENANT_NAME },
    update: {},
    create: { name: DEMO_TENANT_NAME },
  });

  const existingLot = await prisma.lot.findFirst({
    where: { tenantId: tenant.id, title: DEMO_LOT_TITLE },
    include: { spec: true },
  });

  if (existingLot) {
    console.log(`Seed déjà présent — tenant=${tenant.id} lot=${existingLot.id}`);
    return;
  }

  const lot = await prisma.lot.create({
    data: {
      tenantId: tenant.id,
      title: DEMO_LOT_TITLE,
      status: LotStatus.DRAFT,
      spec: {
        create: {
          title: 'Spec ping HTTP',
          body: [
            '# Objectif',
            'Exposer un endpoint HTTP GET /ping qui répond 200 avec le corps `{"pong": true}`.',
            '',
            '# Contraintes',
            '- Aucune authentification',
            '- Réponse JSON',
            '- Temps de réponse < 100 ms en local',
          ].join('\n'),
        },
      },
    },
    include: { spec: true },
  });

  console.log(`Seed OK — tenant=${tenant.id} lot=${lot.id} spec=${lot.spec?.id}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
