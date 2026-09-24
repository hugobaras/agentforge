export const KAFKA_OPTIONS = 'KAFKA_OPTIONS';

export const TOPICS = {
  LOT_SUBMITTED: 'lot.submitted',
  AGENT_IMPLEMENTED: 'agent.implemented',
  EVALUATION_SCORED: 'evaluation.scored',
  LOT_REWORK: 'lot.rework',
  VERIFICATION_APPROVED: 'verification.approved',
  VERIFICATION_REJECTED: 'verification.rejected',
  GIT_PR_OPENED: 'git.pr.opened',
  DLQ: 'agentforge.dlq',
} as const;

export const CONSUMER_GROUPS = {
  LOT_SUBMITTED_LOGGER: 'agentforge-lot-submitted-logger',
  EXECUTION_IMPLEMENTER: 'agentforge-execution-implementer',
  EXECUTION_REWORK: 'agentforge-execution-rework',
  EVALUATION_EVALUATOR: 'agentforge-evaluation-evaluator',
  INTEGRATION_VERIFIER: 'agentforge-integration-verifier',
} as const;
