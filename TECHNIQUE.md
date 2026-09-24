# AgentForge — Stack et aspect technique

Document de référence sur l’architecture, les technologies et les mécanismes d’implémentation. Pour la vision produit et l’intérêt métier, voir [`INTERET.md`](INTERET.md).

---

## Vue d’ensemble

AgentForge est un **monorepo npm** (workspaces `api` + `frontend`) qui orchestre un pipeline de développement assisté par IA :

> spec → événement Kafka → agent → événement → … → vérification → décision humaine → PR GitHub

Le cœur métier vit dans l’**API NestJS** : soumission de lots, consumers Kafka, agents LLM (mock ou Ollama), vérification exécutable, gouvernance humaine et intégration GitHub. Le **frontend SvelteKit** expose un dashboard temps réel. L’**infra locale** est fournie par **Docker Compose** (PostgreSQL, Zookeeper, Kafka, API, frontend).

---

## Stack technique

| Couche | Technologie | Version / remarque |
|--------|-------------|-------------------|
| Runtime | Node.js | 20+ |
| Monorepo | npm workspaces | `api`, `frontend` |
| API | NestJS | 11.x |
| ORM | Prisma | 6.x → PostgreSQL 16 |
| Messaging | KafkaJS + Confluent Kafka | 7.6.1 (Zookeeper) |
| Temps réel | Socket.IO | Gateway NestJS + client Svelte |
| Frontend | SvelteKit 2 + Svelte 5 | Vite 8, adapter-node |
| LLM | Mock / Ollama | `LLM_PROVIDER=mock\|ollama` |
| Git | Octokit (`@octokit/rest`) | PR automatique à l’approbation |
| Conteneurs | Docker Compose | Postgres **5433**, Kafka **9092**, API **3000**, UI **5173** |
| CI | GitHub Actions | Tests unitaires, e2e Kafka, stack Compose |

---

## Structure du dépôt

```
agent_force/
├── api/                    # Backend NestJS + Prisma
│   ├── prisma/             # Schéma, migrations, seed
│   ├── src/
│   │   ├── submission/     # CRUD lots, tenants
│   │   ├── execution/      # Agent implémenteur + consumer lot.submitted / lot.rework
│   │   ├── evaluation/     # Agent évaluateur + consumer agent.implemented
│   │   ├── integration/    # Orchestration vérification + workspace exécutable
│   │   ├── decision/         # Journal de décisions humaines
│   │   ├── git/            # Ouverture de PR GitHub (Octokit)
│   │   ├── kafka/          # Producer, consumers, idempotence, retry, DLQ
│   │   ├── llm/            # Client Ollama + adapters agents
│   │   ├── realtime/       # Gateway Socket.IO
│   │   └── prisma/         # PrismaService
│   └── test/               # E2E Kafka (Jest)
├── frontend/               # SvelteKit — dashboard fragments
│   └── src/lib/
│       ├── api.ts          # Client REST
│       ├── ws.ts           # Client Socket.IO
│       ├── stores.ts       # État global (lots, tenant, WS)
│       └── fragments/      # SpecForm, LotDashboard, SpecVsDeliverable, DecisionJournal
├── docker/                 # Dockerfiles + entrypoint API
├── scripts/                # demo.mjs, e2e-chain.mjs
├── demo/last-run/          # Captures de la dernière démo
├── docker-compose.yml
├── .env.example
├── INTERET.md              # Vision produit
└── TECHNIQUE.md            # Ce document
```

---

## Architecture backend (NestJS)

L’`AppModule` assemble des modules à responsabilité unique :

| Module | Rôle |
|--------|------|
| `SubmissionModule` | `POST /lots`, CRUD, publication `lot.submitted` |
| `ExecutionModule` | Consumer `lot.submitted` + `lot.rework` → implémenteur |
| `EvaluationModule` | Consumer `agent.implemented` → évaluateur |
| `IntegrationModule` | Consumer `evaluation.scored` → rework ou vérificateur |
| `DecisionModule` | `POST /lots/:id/decisions` — override humain |
| `GitModule` | PR GitHub après `APPROVED` |
| `KafkaModule` | Producer, consumer framework, `processed_events` |
| `LlmModule` | Client Ollama, agents Ollama (implémenteur, évaluateur, vérificateur) |
| `RealtimeModule` | Push WebSocket après chaque traitement Kafka réussi |
| `PrismaModule` | Accès PostgreSQL |

Chaque **agent** est une interface injectée (`ImplementerAgent`, `EvaluatorAgent`, `VerifierAgent`) avec une implémentation **mock** (CI, tests) et une implémentation **Ollama** (développement local). Le choix se fait via `llmAgentProvider()` et `LLM_PROVIDER`.

---

## Modèle de données (Prisma)

### Entités principales

- **Tenant** — isolation logique multi-équipe ; `githubToken` optionnel (jamais exposé par `GET /tenants`).
- **Lot** — unité de travail ; statut (`LotStatus`), `repoUrl` / `baseBranch` pour la PR.
- **Spec** — titre + corps texte lié 1:1 au lot.
- **AgentRun** — trace d’exécution par rôle (`IMPLEMENTER`, `EVALUATOR`, `VERIFIER`) ; le livrable est un JSON sérialisé (`summary`, `files[]`, `provider`).
- **Evaluation** — score 0–100 + feedback, liée au run **implémenteur** évalué.
- **Decision** — `APPROVE`, `REJECT`, `ARBITRATE` + commentaire.
- **PullRequest** — numéro, URL, branche, `headSha` après ouverture GitHub.
- **ProcessedEvent** — idempotence Kafka (`eventId` + `consumerGroup` unique).

### Cycle de vie d’un lot (`LotStatus`)

```
SUBMITTED → IMPLEMENTING → EVALUATING → VERIFYING → APPROVED | REJECTED
                              ↑              │
                              └── lot.rework ┘ (si score < seuil et itérations restantes)
```

Pas de statut dédié au rework : le lot repasse en `IMPLEMENTING` sans changer l’énumération Prisma.

---

## Messaging Kafka

### Topics

| Topic | Producteur | Consommateur(s) |
|-------|------------|-----------------|
| `lot.submitted` | SubmissionService | Implémenteur, logger |
| `agent.implemented` | ExecutionService | Évaluateur |
| `evaluation.scored` | EvaluationService | Intégrateur (vérification / rework) |
| `lot.rework` | IntegrationService | Implémenteur (2ᵉ passe+) |
| `verification.approved` | IntegrationService | — (finalisation + WS) |
| `verification.rejected` | IntegrationService | — (finalisation + WS) |
| `git.pr.opened` | GitService | — (WS) |
| `agentforge.dlq` | KafkaConsumerService | Dead letter après échecs |

### Groupes de consumers

```
agentforge-lot-submitted-logger     → lot.submitted
agentforge-execution-implementer    → lot.submitted
agentforge-execution-rework       → lot.rework
agentforge-evaluation-evaluator     → agent.implemented
agentforge-integration-verifier     → evaluation.scored
```

### Enveloppe d’événement

Tous les messages suivent `DomainEvent<T>` :

```ts
{
  eventId: string;      // UUID — clé d'idempotence
  eventType: string;    // nom du topic
  occurredAt: string;   // ISO 8601
  lotId?: string;
  payload: T;
}
```

### Résilience

- **Idempotence** : avant traitement, `ProcessedEventService.wasProcessed(eventId, consumerGroup)` ; après succès, `mark()`.
- **Retry** : backoff exponentiel (`KAFKA_RETRY_BASE_MS` × 2^n), `KAFKA_MAX_RETRIES` (défaut 3).
- **DLQ** : message republié sur `agentforge.dlq` après épuisement des tentatives.
- **Heartbeat** : pulse toutes les 5 s pendant le traitement long (appels Ollama).

`KAFKA_ENABLED=false` désactive producers et consumers (tests unitaires isolés).

---

## Pipeline multi-agents

### 1. Implémenteur

- **Entrée** : spec (`title`, `body`), éventuellement feedback + livrable précédent (rework).
- **Sortie** : JSON `{ summary, files: [{ path, content }], provider }`.
- **Mock** : 1ʳᵉ passe volontairement incomplète ; 2ᵉ passe avec `.mjs` + `*.test.mjs`.
- **Ollama** : prompt JSON strict ; `format: 'json'` ; parsing tolérant (`parseJsonContent`).

### 2. Évaluateur

- **Entrée** : spec + livrable implémenteur.
- **Sortie** : `{ score: 0–100, feedback, provider }`.
- **Idempotence** : une évaluation par `agentRunId` implémenteur.

### 3. Orchestrateur (`IntegrationService`)

Sur `evaluation.scored` :

1. Si `score >= EVALUATION_APPROVAL_THRESHOLD` (défaut **70**) → vérificateur.
2. Sinon, si `runs IMPLEMENTER < MAX_IMPLEMENT_ITERATIONS` (défaut **3**) → `lot.rework`.
3. Sinon → `verification.rejected` sans appeler le vérificateur.

### 4. Vérificateur exécutable

Module `integration/workspace/` :

| Check | Mécanisme |
|-------|-----------|
| **standards** | JSON valide, chemins sûrs, fichiers écrits |
| **lint** | ESLint si présent, sinon règles intégrées |
| **analyse** | `tsc --noEmit` ou transpile syntaxique |
| **tests** | `node --test` sur `*.test.mjs` / `*.spec.js` |
| **fidélité** | overlap spec ↔ livrable (seuil **40 %**) |

Les fichiers du livrable sont matérialisés dans `/tmp/agentforge-verify-<lotId>-*/`, les commandes sont limitées par `VERIFIER_COMMAND_TIMEOUT_MS` (défaut 15 s), puis le workspace est supprimé.

Le résultat est stocké dans un `AgentRun` de type `VERIFIER` et publié sur `verification.approved` ou `verification.rejected`.

---

## Couche LLM

| Variable | Rôle |
|----------|------|
| `LLM_PROVIDER` | `mock` (défaut CI) ou `ollama` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` (hôte) ; `http://host.docker.internal:11434` (API Docker) |
| `OLLAMA_MODEL` | ex. `llama3.2`, `qwen2.5:14b` |
| `OLLAMA_TIMEOUT_MS` | défaut 180 000 ms |

Ollama **n’est pas dans Compose** : daemon sur la machine hôte. L’API en conteneur y accède via `host.docker.internal`.

Pour brancher OpenAI, Anthropic, etc. : implémenter les trois interfaces agent et enregistrer un provider dans les modules `execution`, `evaluation`, `integration`.

---

## API REST

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/health` | Santé API |
| `GET` | `/tenants` | Liste des tenants (sans `githubToken`) |
| `POST` | `/lots` | Créer lot + spec → `lot.submitted` |
| `GET` | `/lots` | Liste (`?tenantId=`) |
| `GET` | `/lots/:id` | Détail (spec, runs, evaluations, decisions, PR) |
| `PATCH` | `/lots/:id` | Mise à jour (dont `repoUrl`, `baseBranch`) |
| `DELETE` | `/lots/:id` | Suppression |
| `POST` | `/lots/:id/decisions` | Décision humaine |
| `GET` | `/lots/:id/decisions` | Historique des décisions |

Validation des DTO via `class-validator`. Les lots liés à GitHub acceptent `owner/repo` ou URL `github.com`.

---

## Temps réel (WebSocket)

- **Gateway** : Socket.IO sur le même port que l’API (`ws://localhost:3000`).
- **Rooms** : `lot:{lotId}` — le client émet `join` / `leave` avec `{ lotId }`.
- **Événement** : `lot.event` → `{ lotId, status, eventType, payload }`.
- Émis après chaque consumer Kafka réussi (`LotRealtimeService`).

Le frontend (`lib/ws.ts`, `lib/stores.ts`) rejoint automatiquement la room du lot sélectionné et rafraîchit l’état.

---

## Frontend (SvelteKit)

Architecture par **fragments** (pas de routing complexe — page unique `+page.svelte`) :

| Fragment | Rôle |
|----------|------|
| `SpecForm` | Soumission lot + spec + dépôt GitHub optionnel |
| `LotDashboard` | Liste des lots, statuts, dernier événement WS |
| `SpecVsDeliverable` | Spec vs livrable, scores, vérification, boutons décision, lien PR |
| `DecisionJournal` | Historique APPROVE / REJECT / ARBITRATE |

Variables publiques : `PUBLIC_API_URL`, `PUBLIC_WS_URL` (injectées au build Docker).

---

## Intégration GitHub (phase 14)

Déclenchée quand un lot passe en **`APPROVED`** (vérificateur ou décision humaine `APPROVE`) :

1. Dernier livrable `IMPLEMENTER` avec `files[]`.
2. Branche `agentforge/lot-<id>` depuis `baseBranch`.
3. Commit Git (blobs + tree + commit via API Git).
4. Ouverture PR Octokit.
5. Enregistrement `PullRequest` + événement `git.pr.opened`.

**Jeton** : `GITHUB_TOKEN` (env) ou `tenants.githubToken`. Sans jeton ou sans `repoUrl` → skip (`git.pr.skipped` en WebSocket).

---

## Docker Compose

| Service | Image / build | Ports |
|---------|---------------|-------|
| `postgres` | postgres:16-alpine | **5433** → 5432 |
| `zookeeper` | confluent 7.6.1 | 2181 |
| `kafka` | confluent 7.6.1 | **9092** (hôte), 29092 (réseau interne) |
| `api` | `docker/api.Dockerfile` | **3000** |
| `frontend` | `docker/frontend.Dockerfile` | **5173** |

L’entrypoint API applique `prisma migrate deploy` au démarrage.

**Deux modes de dev** :

- **Infra seule** : `docker compose up -d postgres zookeeper kafka` + `npm run dev:api` + `npm run dev:frontend`.
- **Stack complète** : `docker compose up -d --build`.

---

## Variables d’environnement (résumé)

Voir [`.env.example`](.env.example) pour la liste complète.

| Groupe | Variables clés |
|--------|----------------|
| Postgres | `DATABASE_URL`, `POSTGRES_PORT` (5433) |
| Kafka | `KAFKA_ENABLED`, `KAFKA_BROKERS`, `KAFKA_MAX_RETRIES`, `KAFKA_RETRY_BASE_MS` |
| Pipeline | `EVALUATION_APPROVAL_THRESHOLD`, `MAX_IMPLEMENT_ITERATIONS`, `VERIFIER_COMMAND_TIMEOUT_MS` |
| LLM | `LLM_PROVIDER`, `OLLAMA_*` |
| GitHub | `GITHUB_TOKEN` |
| Frontend | `PUBLIC_API_URL`, `PUBLIC_WS_URL` |

---

## Tests et CI

### Local

```bash
npm test --workspace=api          # Jest — specs unitaires
npm run test:e2e --workspace=api  # E2E Kafka (infra requise)
npm test --workspace=frontend     # Vitest
npm run check --workspace=frontend
npm run e2e:chain                 # POST /lots → APPROVED|REJECTED
npm run demo                      # Démo + captures demo/last-run/
```

### GitHub Actions (`.github/workflows/ci.yml`)

1. **Job `test`** : frontend + API unitaires → infra Docker → migrations → e2e Kafka (`LLM_PROVIDER=mock`).
2. **Job `compose`** : `docker compose up --build` → `scripts/e2e-chain.mjs`.

---

## Schéma d’architecture

```
┌─────────────┐     REST      ┌──────────────────────────────────────────┐
│  SvelteKit  │◄────────────►│              API NestJS                     │
│  :5173      │     WS       │  submission │ execution │ evaluation │ git  │
└─────────────┘◄────────────►│  integration │ decision │ kafka │ llm       │
                              └───────┬──────────────────────┬───────────────┘
                                      │                      │
                              ┌───────▼───────┐      ┌───────▼───────┐
                              │  PostgreSQL   │      │     Kafka     │
                              │  (Prisma)     │      │  + Zookeeper  │
                              └───────────────┘      └───────────────┘
                                                             │
                              ┌──────────────────────────────┘
                              │  consumers (même process API)
                              ▼
                    implémenteur → évaluateur → vérificateur
                              │
                    ┌─────────▼─────────┐
                    │ Ollama (hôte)     │  mock en CI
                    │ :11434            │
                    └───────────────────┘
```

---

## État actuel et limites connues

**Couvert (phases 0–14)** : infra, CRUD, pipeline Kafka complet, boucle rework, vérificateur exécutable, PR GitHub, UI temps réel, décisions humaines, CI.

**Non couvert / perspectives techniques** :

- Authentification et quotas par tenant.
- Kafka managé et workers LLM dédiés (cloud).
- Provider LLM cloud (OpenAI, Anthropic) — interfaces prêtes, adapters à ajouter.
- Auth sur WebSocket et API (actuellement ouvert en local).

---

## Liens utiles

- Démarrage : [`README.md`](README.md)
- Vision produit : [`INTERET.md`](INTERET.md)
- Démo : `npm run demo` → `demo/last-run/SUMMARY.md`
