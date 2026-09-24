export interface DomainEvent<T = unknown> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  lotId?: string;
  payload: T;
}

export interface LotSubmittedPayload {
  lotId: string;
  tenantId: string;
  title: string;
  spec: {
    title: string;
    body: string;
  };
}

export interface AgentImplementedPayload {
  lotId: string;
  agentRunId: string;
  deliverable: string;
}

export interface EvaluationScoredPayload {
  lotId: string;
  evaluationId: string;
  agentRunId: string;
  score: number;
  feedback: string;
}

export interface LotReworkPayload {
  lotId: string;
  evaluationId: string;
  score: number;
  feedback: string;
  previousDeliverable: string;
  iteration: number;
  maxIterations: number;
}

export interface CheckReport {
  ok: boolean;
  skipped?: boolean;
  command?: string;
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface VerificationChecks {
  standards: boolean;
  tests: boolean;
  fidelity: boolean;
  lint?: boolean;
  analysis?: boolean;
}

export interface VerificationReports {
  standards?: CheckReport;
  tests?: CheckReport;
  fidelity?: CheckReport;
  lint?: CheckReport;
  analysis?: CheckReport;
}

export interface VerificationPayload {
  lotId: string;
  agentRunId?: string;
  approved: boolean;
  reason: string;
  checks?: VerificationChecks;
  reports?: VerificationReports;
  evaluationScore: number;
  threshold: number;
}

export interface GitPrOpenedPayload {
  lotId: string;
  number: number;
  url: string;
  branch: string;
}

export interface KafkaOptions {
  enabled: boolean;
  brokers: string[];
  clientId: string;
  dlqTopic: string;
  maxAttempts: number;
  retryBaseMs: number;
  consumerGroupPrefix?: string;
}

export type MessageHandler = (event: DomainEvent) => Promise<void>;

export interface ConsumerRegistration {
  topic: string;
  groupId: string;
  handler: MessageHandler;
}
