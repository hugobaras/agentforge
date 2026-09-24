import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { io } from 'socket.io-client';

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'demo', 'last-run');

const API_URL = (process.env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL ?? 'http://localhost:5173').replace(
  /\/$/,
  '',
);
const WS_URL = (process.env.PUBLIC_WS_URL ?? API_URL)
  .replace(/^ws:/, 'http:')
  .replace(/^wss:/, 'https:')
  .replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.DEMO_TIMEOUT_MS ?? 180_000);

const TOPICS = [
  'lot.submitted',
  'agent.implemented',
  'evaluation.scored',
  'lot.rework',
  'verification.approved',
  'verification.rejected',
  'git.pr.opened',
  'agentforge.dlq',
];

const DEMO_SPEC = {
  title: `Démo AgentForge — GET /ping`,
  spec: {
    title: 'Spec ping HTTP',
    body: [
      '# Objectif',
      'Exposer GET /ping qui répond 200 avec `{"pong":true}`.',
      '',
      '# Contraintes',
      '- JSON, sans authentification',
      '- Temps de réponse < 100 ms en local',
    ].join('\n'),
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, label, budgetMs = 20_000) {
  const started = Date.now();
  let lastError = 'aucune réponse';
  while (Date.now() - started < budgetMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
      lastError = `${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1000);
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

async function capture(cmd, args) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: root,
      timeout: 20_000,
      maxBuffer: 2_000_000,
    });
    return (stdout + (stderr ? `\n${stderr}` : '')).trim();
  } catch (error) {
    const extra = error.stdout || error.stderr || error.message;
    return `(capture impossible) ${String(extra).trim()}`;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  console.log('Démo AgentForge — soumission → chaîne Kafka → décision');
  console.log(`API ${API_URL}  dashboard ${FRONTEND_URL}`);

  await waitFor(`${API_URL}/health`, 'API', 30_000);
  let frontendOk = false;
  try {
    await waitFor(FRONTEND_URL, 'Frontend', 8_000);
    frontendOk = true;
  } catch {
    console.warn('Frontend hors ligne — le lien dashboard sera quand même affiché.');
  }

  const tenants = await json(`${API_URL}/tenants`);
  if (!tenants[0]?.id) {
    throw new Error('Aucun tenant. Lancez npm run db:seed (ou le conteneur api).');
  }

  const wsEvents = [];
  const socket = io(WS_URL, { transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket timeout')), 10_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  socket.on('lot.event', (message) => {
    wsEvents.push({ at: new Date().toISOString(), ...message });
    console.log(`  WS ${message.eventType} → ${message.status}`);
  });

  const created = await json(`${API_URL}/lots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: tenants[0].id,
      title: `${DEMO_SPEC.title} (${new Date().toISOString().slice(11, 19)})`,
      spec: DEMO_SPEC.spec,
    }),
  });

  socket.emit('join', { lotId: created.id });
  console.log(`Lot ${created.id} créé (${created.status})`);

  const timeline = [{ at: new Date().toISOString(), status: created.status }];
  const pollStart = Date.now();
  let lot = created;
  while (Date.now() - pollStart < TIMEOUT_MS) {
    lot = await json(`${API_URL}/lots/${created.id}`);
    if (timeline.at(-1)?.status !== lot.status) {
      timeline.push({ at: new Date().toISOString(), status: lot.status });
      console.log(`  statut ${lot.status}`);
    }
    if (lot.status === 'APPROVED' || lot.status === 'REJECTED') {
      break;
    }
    await sleep(1000);
  }

  if (lot.status !== 'APPROVED' && lot.status !== 'REJECTED') {
    throw new Error(`Timeout: lot resté en ${lot.status}`);
  }

  const decisionType = lot.status === 'APPROVED' ? 'APPROVE' : 'REJECT';
  const decision = await json(`${API_URL}/lots/${created.id}/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: decisionType,
      comment: `Décision démo — revue humaine après ${lot.status}.`,
    }),
  });
  lot = await json(`${API_URL}/lots/${created.id}`);
  console.log(`Décision ${decision.type} enregistrée`);

  socket.disconnect();

  const kafkaTopics = await capture('docker', [
    'compose',
    'exec',
    '-T',
    'kafka',
    'kafka-topics',
    '--bootstrap-server',
    'localhost:9092',
    '--list',
  ]);
  const kafkaDumps = {};
  for (const topic of TOPICS) {
    kafkaDumps[topic] = await capture('docker', [
      'compose',
      'exec',
      '-T',
      'kafka',
      'kafka-console-consumer',
      '--bootstrap-server',
      'localhost:9092',
      '--topic',
      topic,
      '--from-beginning',
      '--timeout-ms',
      '2500',
    ]);
  }

  const processedEvents = await capture('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'agentforge',
    '-d',
    'agentforge',
    '-c',
    'SELECT "eventId", topic, "consumerGroup", "processedAt" FROM processed_events ORDER BY "processedAt" DESC LIMIT 40;',
  ]);

  const apiLogs = await capture('docker', [
    'compose',
    'logs',
    '--tail=80',
    'api',
  ]);

  const dashboardUrl = `${FRONTEND_URL}/?lot=${created.id}`;
  const evaluation = lot.evaluations?.at(-1);
  const summary = [
    '# Démo AgentForge — dernier run',
    '',
    `- Lot : ${lot.id}`,
    `- Titre : ${lot.title}`,
    `- Statut final : ${lot.status}`,
    `- Score : ${evaluation?.score ?? 'n/a'}`,
    `- Décision : ${decision.type} (${decision.comment})`,
    `- Événements WS : ${wsEvents.length}`,
    `- Timeline : ${timeline.map((step) => step.status).join(' → ')}`,
    `- Dashboard : ${dashboardUrl}`,
    frontendOk ? '- Frontend : joignable' : '- Frontend : hors ligne au lancement',
    '',
    'Ouvrir le dashboard, vérifier spec vs livrable et le journal de décisions.',
    'Les dumps Kafka / processed_events sont dans demo/last-run/.',
    '',
  ].join('\n');

  await writeFile(join(outDir, 'SUMMARY.md'), summary);
  await writeFile(join(outDir, 'lot.json'), JSON.stringify(lot, null, 2));
  await writeFile(join(outDir, 'ws-events.json'), JSON.stringify(wsEvents, null, 2));
  await writeFile(join(outDir, 'timeline.json'), JSON.stringify(timeline, null, 2));
  await writeFile(join(outDir, 'decision.json'), JSON.stringify(decision, null, 2));
  await writeFile(join(outDir, 'kafka-topics.txt'), kafkaTopics);
  await writeFile(join(outDir, 'processed-events.txt'), processedEvents);
  await writeFile(join(outDir, 'api-logs.txt'), apiLogs);
  for (const [topic, dump] of Object.entries(kafkaDumps)) {
    await writeFile(join(outDir, `kafka-${topic}.txt`), dump);
  }

  console.log('');
  console.log(summary);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
