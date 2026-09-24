const API_URL = (process.env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL ?? 'http://localhost:5173').replace(
  /\/$/,
  '',
);
const TIMEOUT_MS = Number(process.env.E2E_CHAIN_TIMEOUT_MS ?? 240_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, label, ok = (response) => response.ok) {
  const started = Date.now();
  let lastError = 'aucune réponse';
  while (Date.now() - started < TIMEOUT_MS) {
    try {
      const response = await fetch(url);
      if (ok(response)) {
        return response;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(2000);
  }
  throw new Error(`${label} indisponible (${url}): ${lastError}`);
}

async function json(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log(`Chaîne e2e — API ${API_URL}`);
  await waitFor(`${API_URL}/health`, 'API', (response) => response.ok);
  await waitFor(FRONTEND_URL, 'Frontend');

  let tenants = [];
  const tenantWaitStart = Date.now();
  while (Date.now() - tenantWaitStart < 30_000) {
    tenants = await json(`${API_URL}/tenants`);
    if (Array.isArray(tenants) && tenants.length > 0) {
      break;
    }
    await sleep(1000);
  }
  if (!tenants[0]?.id) {
    throw new Error('Aucun tenant — le seed API a-t-il tourné ?');
  }

  const created = await json(`${API_URL}/lots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: tenants[0].id,
      title: `Lot CI chaîne ${Date.now()}`,
      spec: {
        title: 'Ping HTTP',
        body: 'GET /ping doit répondre 200 avec {"pong":true}',
      },
    }),
  });

  console.log(`Lot créé ${created.id} status=${created.status}`);

  const pollStart = Date.now();
  let lot;
  while (Date.now() - pollStart < TIMEOUT_MS) {
    lot = await json(`${API_URL}/lots/${created.id}`);
    console.log(`  status=${lot.status}`);
    if (lot.status === 'APPROVED' || lot.status === 'REJECTED') {
      break;
    }
    await sleep(1500);
  }

  if (lot?.status !== 'APPROVED' && lot?.status !== 'REJECTED') {
    throw new Error(`Timeout: lot resté en ${lot?.status}`);
  }

  const implementer = [...(lot.agentRuns ?? [])]
    .reverse()
    .find((run) => run.type === 'IMPLEMENTER' && run.deliverable);
  if (!implementer?.deliverable) {
    const summary = (lot.agentRuns ?? [])
      .map((run) => `${run.type}:${run.deliverable ? 'ok' : 'vide'}`)
      .join(', ');
    throw new Error(
      `Livrable IMPLEMENTER manquant${summary ? ` (${summary})` : ''}`,
    );
  }
  if (!lot.evaluations?.length) {
    throw new Error('Evaluation manquante');
  }

  console.log(
    `OK — ${lot.status} (score=${lot.evaluations.at(-1).score}, runs=${lot.agentRuns.length})`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
