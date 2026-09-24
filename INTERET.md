# AgentForge — Intérêt du projet

## En une phrase

**AgentForge** est une plateforme de pilotage de lots de développement assistés par IA : on soumet une spécification, des agents spécialisés implémentent et évaluent le livrable, un humain tranche en dernier recours — le tout orchestré de façon fiable et observable via Kafka.

---

## Le problème adressé

L’usage des LLM pour produire du code pose trois défis récurrents :

1. **Manque de traçabilité** — difficile de savoir qui (ou quoi) a produit quoi, sur quelle base, et pourquoi une décision a été prise.
2. **Absence de garde-fous** — un seul agent qui génère et se juge lui-même ne garantit ni la qualité ni la conformité à la spec.
3. **Pas de boucle de gouvernance** — entre « prompt jeté dans un chat » et « livrable en production », il manque un workflow structuré avec statuts, relecture humaine et historique.

AgentForge propose une réponse **industrielle** à ces limites : un pipeline event-driven, multi-agents, avec séparation des rôles et intervention humaine explicite.

---

## Ce que fait concrètement la plateforme

| Étape             | Acteur                           | Résultat                                                                                |
| ----------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Soumission     | Utilisateur                      | Création d’un **lot** avec sa **spec** (statut `SUBMITTED`)                             |
| 2. Implémentation | Agent implémenteur               | Production d’un **livrable** à partir de la spec (`IMPLEMENTING` → `agent.implemented`) |
| 3. Évaluation     | Agent évaluateur                 | **Score** 0–100 + feedback ; si sous le seuil, `lot.rework` jusqu’à N itérations        |
| 4. Vérification   | Agent vérificateur (indépendant) | Workspace temporaire + lint / analyse / tests exécutés + fidélité (`VERIFYING`)         |
| 5. Décision       | Humain (optionnel)               | Approbation, rejet ou arbitrage via le **journal de décisions**                         |
| 6. Livraison Git  | AgentForge → GitHub              | Branche + commit du livrable + **PR** si le lot est `APPROVED` et lié à un dépôt        |

Chaque transition est un **événement Kafka** (`lot.submitted`, `agent.implemented`, `evaluation.scored`, `lot.rework`, `verification.approved` / `verification.rejected`, `git.pr.opened`), consommé de manière **idempotente** et relayé en **temps réel** au frontend via WebSocket.

---

## Intérêt technique

### Architecture event-driven

- **Découplage** : chaque agent est un consumer Kafka autonome ; on peut scaler, remplacer ou désactiver un maillon sans toucher aux autres.
- **Résilience** : retry avec backoff (3 tentatives), DLQ (`agentforge.dlq`), table `processed_events` pour l’idempotence.
- **Observabilité** : chaîne d’événements reconstituable en base et en temps réel dans l’UI.

### Séparation des rôles (multi-agents)

Plutôt qu’un LLM monolithique « fait tout », le projet modélise trois rôles distincts :

- **Implémenteur** — transforme la spec en livrable.
- **Évaluateur** — mesure l’adéquation spec ↔ livrable (score + feedback).
- **Vérificateur** — contrôle indépendant : matérialise les fichiers, lance lint / analyse / tests, mesure la fidélité (seuil d’entrée configurable, défaut 70/100).

Cette séparation limite les biais de l’auto-évaluation et rapproche le flux d’une revue de code structurée.

### Gouvernance humaine

Le **journal de décisions** (`APPROVE`, `REJECT`, `ARBITRATE`) permet de :

- valider ou corriger une décision automatique ;
- documenter le pourquoi (commentaires obligatoires pour rejet et arbitrage) ;
- conserver un audit trail par lot.

### Stack moderne et extensible

| Couche     | Technologie                                          |
| ---------- | ---------------------------------------------------- |
| API        | NestJS, Prisma, PostgreSQL                           |
| Messaging  | Kafka (Zookeeper)                                    |
| Temps réel | Socket.IO                                            |
| Frontend   | SvelteKit (fragments modulaires)                     |
| LLM        | Mock (CI/tests) ou **Ollama** local (llama3.2, etc.) |
| Infra      | Docker Compose, CI GitHub Actions                    |

Les agents sont injectés via des interfaces (`ImplementerAgent`, `EvaluatorAgent`, `VerifierAgent`) : brancher un autre provider LLM (OpenAI, Anthropic…) ne demande qu’un nouvel adapter, sans refondre le pipeline.

### Multi-tenant

Le modèle `Tenant` → `Lot` prépare une utilisation par équipe, client ou projet, avec isolation logique des lots.

---

## Intérêt métier / produit

### Pour une équipe de développement

- **Industrialiser** l’usage des agents IA : spec formalisée, pipeline reproductible, résultat traçable.
- **Réduire le risque** de livrer du code non conforme grâce à l’évaluation + vérification + validation humaine.
- **Suivre l’avancement** en direct (dashboard, spec vs livrable, statuts).

### Pour l’expérimentation et la R&D

- **Bac à sable** pour tester des prompts, modèles et stratégies d’évaluation sur des lots fictifs.
- **Démo bout en bout** (`npm run demo`) avec captures dans `demo/last-run/` (Kafka, WebSocket, résumé).
- **CI complète** : tests unitaires, e2e Kafka, chaîne POST `/lots` → statut final `APPROVED` ou `REJECTED`.

### Pour l’apprentissage

Le projet illustre un pattern réel et pédagogique :

> spec → événement → agent → événement → … → décision humaine

C’est un excellent support pour comprendre comment orchestrer des agents IA **en production**, au-delà d’un simple appel API à un chatbot.

---

## Schéma du flux

```
Utilisateur                Kafka                         Agents
    │                        │                              │
    ├─ POST /lots ──────────►│ lot.submitted ──────────────►│ Implémenteur
    │                        │                              │
    │                        │◄──── agent.implemented ──────┤
    │                        │                              │
    │                        │ agent.implemented ──────────►│ Évaluateur
    │                        │                              │
    │                        │◄──── evaluation.scored ──────┤
    │                        │                              │
    │                        │ lot.rework (si score < seuil)│
    │                        │─────────────────────────────►│ Implémenteur
    │                        │                              │
    │                        │ evaluation.scored ──────────►│ Vérificateur
    │                        │                              │
    │                        │◄ verification.approved/rejected
    │                        │                              │
    │                        │ git.pr.opened (si repo lié)  │
    ├─ WebSocket ◄───────────┤ (push lot.event)             │
    ├─ POST /decisions ──────┤ (override humain)            │
    └─ Dashboard ────────────┴ spec vs livrable, journal    │
```

---

## Ce qui distingue AgentForge d’un assistant de chat IDE

| Critère     | Chat IA classique  | AgentForge                                         |
| ----------- | ------------------ | -------------------------------------------------- |
| Entrée      | Prompt libre       | **Spec structurée** liée à un lot                  |
| Workflow    | Ad hoc             | **Pipeline à statuts** explicites                  |
| Qualité     | Auto-déclarée      | **Évaluation + vérification** séparées             |
| Traçabilité | Historique de chat | **Events Kafka + base + journal**                  |
| Humain      | Optionnel          | **Décision formalisée** (approve/reject/arbitrate) |
| Intégration | IDE                | **API + WebSocket + UI dédiée**                    |

AgentForge ne remplace pas un assistant dans l’IDE : il **encadre** et **gouverne** des cycles de développement assistés par IA à l’échelle d’une équipe ou d’un produit.

---

## État actuel et perspectives

**Aujourd’hui**, le projet couvre un cycle complet fonctionnel (phases 0 à 14) : infra Docker, CRUD lots, pipeline Kafka, agents mock ou Ollama, boucle implémenteur ↔ évaluateur, vérificateur exécutable, PR GitHub automatique à l’approbation, frontend temps réel, décisions humaines, CI et script de démo.

**Perspectives naturelles** :

- ajouter authentification et quotas par tenant ;
- déployer en cloud (Kafka managé, workers LLM dédiés).

---

## Conclusion

L’intérêt d’**AgentForge** est de transformer l’usage des LLM en développement d’**un flux maîtrisé, auditable et gouverné** : soumission de specs, agents spécialisés en chaîne, décision humaine explicite, observabilité de bout en bout. C’est à la fois un **prototype produit** crédible pour des équipes qui veulent industrialiser l’IA générative, et une **base technique** solide (NestJS + Kafka + Prisma) pour expérimenter des architectures multi-agents en conditions proches de la production.
