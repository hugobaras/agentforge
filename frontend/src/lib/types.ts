export type LotStatus =
	| 'DRAFT'
	| 'SUBMITTED'
	| 'IMPLEMENTING'
	| 'EVALUATING'
	| 'VERIFYING'
	| 'APPROVED'
	| 'REJECTED';

export type AgentRunType = 'IMPLEMENTER' | 'EVALUATOR' | 'VERIFIER';

export type DecisionType = 'APPROVE' | 'REJECT' | 'ARBITRATE';

export interface Tenant {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
}

export interface Spec {
	id: string;
	lotId: string;
	title: string;
	body: string;
	createdAt: string;
	updatedAt: string;
}

export interface AgentRun {
	id: string;
	lotId: string;
	type: AgentRunType;
	deliverable: string | null;
	startedAt: string;
	finishedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface Evaluation {
	id: string;
	lotId: string;
	agentRunId: string;
	score: number;
	feedback: string;
	createdAt: string;
}

export interface Decision {
	id: string;
	lotId: string;
	type: DecisionType;
	comment: string | null;
	createdAt: string;
}

export interface PullRequest {
	id: string;
	lotId: string;
	number: number;
	url: string;
	branch: string;
	headSha: string | null;
	createdAt: string;
}

export interface Lot {
	id: string;
	tenantId: string;
	title: string;
	status: LotStatus;
	repoUrl: string | null;
	baseBranch: string;
	createdAt: string;
	updatedAt: string;
	spec: Spec | null;
	pullRequest?: PullRequest | null;
}

export interface LotDetail extends Lot {
	agentRuns: AgentRun[];
	evaluations: Evaluation[];
	decisions: Decision[];
	pullRequest: PullRequest | null;
}

export interface LotRealtimeMessage {
	lotId: string;
	status: string;
	eventType: string;
	payload: unknown;
}

export interface CreateLotInput {
	tenantId: string;
	title: string;
	spec: {
		title: string;
		body: string;
	};
	repoUrl?: string;
	baseBranch?: string;
}

export interface CreateDecisionInput {
	type: DecisionType;
	comment?: string;
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

export type CheckName = keyof VerificationChecks;

export interface VerifierResult {
	approved: boolean;
	reason: string;
	checks: VerificationChecks;
	reports?: Partial<Record<CheckName, CheckReport>>;
	provider: string;
}
