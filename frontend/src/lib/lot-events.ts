import type {
	DecisionType,
	Lot,
	LotRealtimeMessage,
	LotStatus,
	VerifierResult,
} from './types';

export const LOT_STATUSES: LotStatus[] = [
	'DRAFT',
	'SUBMITTED',
	'IMPLEMENTING',
	'EVALUATING',
	'VERIFYING',
	'APPROVED',
	'REJECTED',
];

export const DECISION_LABELS: Record<DecisionType, string> = {
	APPROVE: 'Approuver',
	REJECT: 'Rejeter',
	ARBITRATE: 'Arbitrage',
};

export const LOT_STATUS_LABELS: Record<LotStatus, string> = {
	DRAFT: 'Brouillon',
	SUBMITTED: 'Soumis',
	IMPLEMENTING: 'Implémentation',
	EVALUATING: 'Évaluation',
	VERIFYING: 'Vérification',
	APPROVED: 'Approuvé',
	REJECTED: 'Rejeté',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
	'lot.submitted': 'Lot soumis',
	'agent.implemented': 'Livrable produit',
	'evaluation.scored': 'Évaluation',
	'lot.rework': 'Nouvelle itération',
	'verification.approved': 'Vérification approuvée',
	'verification.rejected': 'Vérification rejetée',
	'git.pr.opened': 'Pull request ouverte',
	'git.pr.failed': 'Échec pull request',
	'git.pr.skipped': 'PR ignorée',
};

export function eventTypeLabel(eventType: string): string {
	return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

export function isLotStatus(value: string): value is LotStatus {
	return LOT_STATUSES.includes(value as LotStatus);
}

export function applyLotEvent(lots: Lot[], event: LotRealtimeMessage): Lot[] {
	const status = event.status;
	if (!isLotStatus(status)) {
		return lots;
	}
	return lots.map((lot) => (lot.id === event.lotId ? { ...lot, status } : lot));
}

export function latestImplementerDeliverable(
	runs: { type: string; deliverable: string | null }[],
): string | null {
	return (
		[...runs]
			.reverse()
			.find((run) => run.type === 'IMPLEMENTER' && run.deliverable)?.deliverable ??
		null
	);
}

export function implementerAttemptCount(runs: { type: string }[]): number {
	return runs.filter((run) => run.type === 'IMPLEMENTER').length;
}

export const CHECK_LABELS: Record<string, string> = {
	standards: 'Standards',
	lint: 'Lint',
	analysis: 'Analyse',
	tests: 'Tests',
	fidelity: 'Fidélité',
};

export function latestVerifierResult(
	runs: { type: string; deliverable: string | null }[],
): VerifierResult | null {
	const raw = [...runs]
		.reverse()
		.find((run) => run.type === 'VERIFIER' && run.deliverable)?.deliverable;
	if (!raw) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as VerifierResult;
		if (!parsed || typeof parsed !== 'object' || !parsed.checks) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}
