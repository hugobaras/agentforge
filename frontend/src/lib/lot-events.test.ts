import { describe, expect, it } from 'vitest';
import {
	applyLotEvent,
	eventTypeLabel,
	implementerAttemptCount,
	latestImplementerDeliverable,
	latestVerifierResult,
} from './lot-events';
import type { Lot } from './types';

const lot = (id: string, status: Lot['status'] = 'SUBMITTED'): Lot => ({
	id,
	tenantId: 't1',
	title: `Lot ${id}`,
	status,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	spec: null,
	repoUrl: null,
	baseBranch: 'main',
});

describe('applyLotEvent', () => {
	it('met à jour le statut du lot ciblé', () => {
		const next = applyLotEvent([lot('a'), lot('b')], {
			lotId: 'b',
			status: 'IMPLEMENTING',
			eventType: 'lot.submitted',
			payload: {},
		});
		expect(next[0].status).toBe('SUBMITTED');
		expect(next[1].status).toBe('IMPLEMENTING');
	});

	it('ignore un statut inconnu', () => {
		const lots = [lot('a')];
		expect(
			applyLotEvent(lots, {
				lotId: 'a',
				status: 'UNKNOWN',
				eventType: 'x',
				payload: {},
			}),
		).toEqual(lots);
	});
});

describe('latestImplementerDeliverable', () => {
	it('prend le dernier livrable IMPLEMENTER', () => {
		expect(
			latestImplementerDeliverable([
				{ type: 'IMPLEMENTER', deliverable: 'v1' },
				{ type: 'EVALUATOR', deliverable: null },
				{ type: 'IMPLEMENTER', deliverable: 'v2' },
			]),
		).toBe('v2');
	});

	it('ignore un run IMPLEMENTER sans livrable', () => {
		expect(
			latestImplementerDeliverable([
				{ type: 'IMPLEMENTER', deliverable: null },
				{ type: 'IMPLEMENTER', deliverable: 'ok' },
			]),
		).toBe('ok');
	});
});

describe('implementerAttemptCount', () => {
	it('compte les runs IMPLEMENTER', () => {
		expect(
			implementerAttemptCount([
				{ type: 'IMPLEMENTER' },
				{ type: 'EVALUATOR' },
				{ type: 'IMPLEMENTER' },
			]),
		).toBe(2);
	});
});

describe('eventTypeLabel', () => {
	it('traduit lot.rework', () => {
		expect(eventTypeLabel('lot.rework')).toBe('Nouvelle itération');
	});

	it('traduit git.pr.opened', () => {
		expect(eventTypeLabel('git.pr.opened')).toBe('Pull request ouverte');
	});

	it('laisse un type inconnu tel quel', () => {
		expect(eventTypeLabel('custom.event')).toBe('custom.event');
	});
});

describe('latestVerifierResult', () => {
	it('parse le dernier run VERIFIER', () => {
		expect(
			latestVerifierResult([
				{ type: 'IMPLEMENTER', deliverable: '{}' },
				{
					type: 'VERIFIER',
					deliverable: JSON.stringify({
						approved: true,
						reason: 'OK',
						checks: { standards: true, tests: true, fidelity: true },
						provider: 'mock',
					}),
				},
			])?.approved,
		).toBe(true);
	});

	it('ignore un JSON invalide', () => {
		expect(
			latestVerifierResult([{ type: 'VERIFIER', deliverable: 'nope' }]),
		).toBeNull();
	});
});
