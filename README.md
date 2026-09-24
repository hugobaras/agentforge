# AgentForge

Plateforme de pilotage de lots de développement assistés par IA, orchestrés en event-driven via Kafka.

## Prérequis

- Node.js 20+
- npm 10+
- Docker et Docker Compose

Postgres est exposé sur le **port 5433** (évite le conflit avec un PostgreSQL local sur 5432).

## Phase 0 — Démarrage

```bash
cp .env.example .env
npm install
docker compose up -d
```

Vérifier l’infra :

```bash
docker compose ps
docker compose exec postgres pg_isready -U agentforge
docker compose exec kafka kafka-topics --bootstrap-server localhost:9092 --list
```

Lancer les apps (hors Docker pour l’instant) :

```bash
npm run dev:api
npm run dev:frontend
```

- API : [http://localhost:3000/health](http://localhost:3000/health)
- Frontend : [http://localhost:5173](http://localhost:5173)

## Phase 1 — Base de données

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

Vérifier le seed :

```bash
docker compose exec postgres psql -U agentforge -d agentforge -c \
  "SELECT t.name, l.title, l.status, s.title AS spec FROM tenants t JOIN lots l ON l.\"tenantId\" = t.id JOIN specs s ON s.\"lotId\" = l.id;"
```

## Phase 2 — Submission (CRUD lots)

Le lot est créé en `SUBMITTED` avec sa spec. Phase 3 publie ensuite `lot.submitted`.

```bash
# récupérer l'id du tenant de démo
TENANT_ID=$(docker compose exec -T postgres psql -U agentforge -d agentforge -tAc \
  "SELECT id FROM tenants WHERE name = 'Tenant Démo';")

curl -sS -X POST http://localhost:3000/lots \
  -H 'Content-Type: application/json' \
  -d "{\"tenantId\":\"$TENANT_ID\",\"title\":\"Lot API\",\"spec\":{\"title\":\"Ping\",\"body\":\"GET /ping → {\\\"pong\\\":true}\"}}"

curl -sS http://localhost:3000/lots?tenantId=$TENANT_ID
```

Tests e2e :

```bash
npm run test:e2e --workspace=api
```

## Phase 3 — Kafka

Après `POST /lots`, l’API publie `lot.submitted`. Un consumer de log accuse réception (idempotence via `processed_events`).

```bash
docker compose up -d postgres zookeeper kafka
npm run db:migrate
npm run dev:api
```

Puis le `curl` POST ci-dessus. Dans les logs API :

```
Publié lot.submitted topic=lot.submitted eventId=...
Reçu lot.submitted eventId=... lotId=...
```

Vérifier l’idempotence :

```bash
docker compose exec postgres psql -U agentforge -d agentforge -c \
  "SELECT \"eventId\", topic, \"consumerGroup\" FROM processed_events;"
```

Topics : `lot.submitted`, `agent.implemented`, `evaluation.scored`, `lot.rework`, `verification.approved` / `verification.rejected`, DLQ `agentforge.dlq` (retry 3×, backoff 200/400/800 ms).

## Phase 4 — Agent implémenteur

Consumer `lot.submitted` (groupe `agentforge-execution-implementer`) → mock LLM → `AgentRun` (IMPLEMENTER) → `agent.implemented`. Le lot passe en `IMPLEMENTING`.

Pour brancher un vrai LLM plus tard : implémenter `ImplementerAgent` et remplacer le provider `IMPLEMENTER_AGENT` dans `execution.module.ts`.

Vérifier après un `POST /lots` :

```bash
docker compose exec postgres psql -U agentforge -d agentforge -c \
  "SELECT l.title, l.status, r.type, left(r.deliverable, 80) FROM lots l JOIN agent_runs r ON r.\"lotId\" = l.id ORDER BY r.\"createdAt\" DESC LIMIT 5;"
```

## Phase 5 — Agent évaluateur

Consumer `agent.implemented` → compare spec vs livrable (mock) → `Evaluation` (score 0–100 + feedback) → `evaluation.scored`. Le lot passe en `EVALUATING`.

```bash
docker compose exec postgres psql -U agentforge -d agentforge -c \
  "SELECT l.title, l.status, e.score, left(e.feedback, 80) FROM lots l JOIN evaluations e ON e.\"lotId\" = l.id ORDER BY e.\"createdAt\" DESC LIMIT 5;"
```

## Phase 6 — Agent vérificateur

Consumer `evaluation.scored` :

- si score ≥ `EVALUATION_APPROVAL_THRESHOLD` (défaut 70) → vérificateur **indépendant** (phase 13 : workspace + lint / analyse / tests + fidélité, sans réutiliser le score) → `verification.approved` ou `verification.rejected`
- si score < seuil et qu’il reste des itérations (`MAX_IMPLEMENT_ITERATIONS`, défaut 3) → `lot.rework` (phase 12)
- si score < seuil au plafond d’itérations → `verification.rejected`, lot `REJECTED` (pas d’appel vérificateur)

```bash
docker compose exec postgres psql -U agentforge -d agentforge -c \
  "SELECT title, status FROM lots ORDER BY \"updatedAt\" DESC LIMIT 5;"
```

## Phase 7 — WebSocket

Gateway Socket.IO sur le même port que l’API (`ws://localhost:3000`).

```js
const socket = io('http://localhost:3000');
socket.emit('join', { lotId: '<id>' });
socket.on('lot.event', (msg) => {
  // { lotId, status, eventType, payload }
});
```

Chaque consumer Kafka, après un traitement réussi, pousse ce message dans la room `lot:{lotId}`.

## Phase 8 — Frontend fragments

Fragments : `SpecForm`, `LotDashboard`, `SpecVsDeliverable`, `DecisionJournal`.
Clients : `lib/api`, `lib/ws`, `lib/stores`.

```bash
docker compose up -d postgres zookeeper kafka
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:frontend
```

Ouvrir [http://localhost:5173](http://localhost:5173) : soumettre une spec, suivre le statut du lot en temps réel, comparer spec et livrable.

## Phase 9 — Journal de décisions

`POST /lots/:lotId/decisions` — `{ type: APPROVE | REJECT | ARBITRATE, comment? }`.

- `APPROVE` → lot `APPROVED`
- `REJECT` → lot `REJECTED` (commentaire obligatoire)
- `ARBITRATE` → commentaire obligatoire, statut inchangé
- Les boutons sont dans **Spec vs livrable** ; l’historique s’affiche dans le journal

```bash
TENANT_ID=$(docker compose exec -T postgres psql -U agentforge -d agentforge -tAc \
  "SELECT id FROM tenants WHERE name = 'Tenant Démo';")
LOT_ID=$(curl -sS "http://localhost:3000/lots?tenantId=$TENANT_ID" | python3 -c \
  "import json,sys; print(json.load(sys.stdin)[0]['id'])")

curl -sS -X POST http://localhost:3000/lots/$LOT_ID/decisions \
  -H 'Content-Type: application/json' \
  -d '{"type":"APPROVE","comment":"Validé à la main"}'
```

Sur [http://localhost:5173](http://localhost:5173) : sélectionner un lot, commenter, cliquer Approuver / Rejeter / Arbitrage.

```bash
npm test --workspace=frontend
npm run check --workspace=frontend
npm test --workspace=api
npm run test:e2e --workspace=api
```

## Phase 10 — Compose complet + CI

`api` et `frontend` sont dans `docker-compose.yml`. GitHub Actions (`.github/workflows/ci.yml`) lance les tests unitaires, les e2e Kafka, puis une stack Compose et `scripts/e2e-chain.mjs` (POST /lots → statut `APPROVED` ou `REJECTED`).

Stack complète (libre le port 3000 / 5173 si tu as `dev:api` / `dev:frontend`) :

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
curl -sS http://localhost:3000/health
node scripts/e2e-chain.mjs
```

Infra seule, apps en local (comme avant) :

```bash
docker compose up -d postgres zookeeper kafka
npm run dev:api
npm run dev:frontend
```

## Phase 11 — Démo bout en bout

Soumet un lot fictif, suit la chaîne jusqu’à `APPROVED` / `REJECTED`, enregistre une décision humaine, et écrit les captures dans `demo/last-run/` (topics Kafka, `processed_events`, événements WebSocket, lien dashboard).

```bash
docker compose up -d postgres zookeeper kafka
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:frontend
```

Dans un autre terminal :

```bash
npm run demo
```

Le script affiche l’URL du dashboard (`http://localhost:5173/?lot=<id>`) : spec vs livrable + journal. Relire les dumps :

```bash
ls demo/last-run
cat demo/last-run/SUMMARY.md
```

Stack Docker à la place des apps locales : `docker compose up -d --build` puis `npm run demo` (libérer les ports 3000 / 5173).

## Phase 12 — Boucle implémenteur ↔ évaluateur

Si le score d’évaluation est sous le seuil et qu’il reste des tentatives, l’intégrateur publie `lot.rework` au lieu de rejeter. L’implémenteur relance une passe avec le livrable précédent et le feedback, puis l’évaluateur rescore. Le vérificateur ne tourne que lorsque le score atteint le seuil, ou le lot est rejeté au plafond (`MAX_IMPLEMENT_ITERATIONS`, défaut 3).

Le dashboard affiche l’historique des scores et un badge « Tentative N ».

```bash
# dans .env
MAX_IMPLEMENT_ITERATIONS=3
```

Après un `POST /lots` (mock) :

```bash
docker compose exec postgres psql -U agentforge -d agentforge -c \
  "SELECT l.title, l.status, r.type, e.score FROM lots l LEFT JOIN agent_runs r ON r.\"lotId\" = l.id LEFT JOIN evaluations e ON e.\"lotId\" = l.id ORDER BY l.\"updatedAt\" DESC, r.\"createdAt\" LIMIT 20;"
```

On doit voir au moins deux runs `IMPLEMENTER` et deux `Evaluation` avant `APPROVED` / `REJECTED`.

## Phase 13 — Vérificateur exécutable

Le vérificateur n’est plus uniquement heuristique. Il écrit les `files[]` du livrable dans un workspace temporaire, puis :

- **standards** — JSON valide, chemins sûrs, fichiers écrits ;
- **lint** — ESLint si présent dans le livrable, sinon règles intégrées (fichiers vides, `eval`, accolades) ;
- **analyse** — `tsc --noEmit` si `tsconfig.json` + TypeScript, sinon transpile syntaxique ;
- **tests** — `node --test` sur `*.test.mjs` / `*.spec.js` (Jest/pytest si le workspace les fournit) ;
- **fidélité** — overlap spec ↔ livrable (≥ 40 %), indépendant du score d’évaluation.

Chaque check produit un rapport (`stdout`, `stderr`, `exitCode`). Le dashboard les affiche sous Spec vs livrable. Timeout : `VERIFIER_COMMAND_TIMEOUT_MS` (défaut 15 s).

Le mock implémenteur, dès la 2ᵉ passe, émet un module `.mjs` + un `*.test.mjs` pour que la CI exécute vraiment les tests.

```bash
# dans .env
VERIFIER_COMMAND_TIMEOUT_MS=15000
```

## Phase 14 — PR GitHub automatique

À la création du lot, on peut lier un dépôt (`repoUrl` = `owner/repo` ou URL `github.com`, `baseBranch` défaut `main`). Quand le lot passe en `APPROVED` (vérificateur ou décision humaine), AgentForge :

1. lit le dernier livrable IMPLEMENTER ;
2. crée une branche `agentforge/lot-<id>` ;
3. commit les `files[]` ;
4. ouvre une pull request via Octokit.

Jeton : `GITHUB_TOKEN` ou `tenants.githubToken` (jamais exposé par `GET /tenants`). Sans jeton ou sans `repoUrl`, la PR est ignorée (`git.pr.skipped`). L’événement `git.pr.opened` est poussé en Kafka et WebSocket ; le dashboard affiche le lien.

```bash
# dans .env
GITHUB_TOKEN=ghp_...
```

```bash
curl -sS -X POST http://localhost:3000/lots \
  -H 'Content-Type: application/json' \
  -d "{\"tenantId\":\"$TENANT_ID\",\"title\":\"Lot API\",\"repoUrl\":\"acme/api\",\"baseBranch\":\"main\",\"spec\":{\"title\":\"Ping\",\"body\":\"GET /ping\"}}"
```

Appliquer la migration : `npm run db:migrate` (ou `db:migrate:deploy`).

## LLM — Ollama (local, hors Docker)

Ollama reste sur la machine hôte (`127.0.0.1:11434`). Pas de service Ollama dans Compose.

```bash
ollama pull llama3.2
```

Dans `.env` (déjà le cas si tu as activé ollama) :

```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

`npm run dev:api` appelle ce daemon. Relancer l’API après un changement de `.env`.

Si l’API tourne **dans** Docker, Compose utilise `http://host.docker.internal:11434` (ne pas interpoler `127.0.0.1`, ça pointerait dans le conteneur). Sur Mac, Ollama doit accepter les connexions Docker Desktop (souvent le cas avec l’app officielle).
