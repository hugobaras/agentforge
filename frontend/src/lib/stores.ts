import { get, writable } from 'svelte/store';
import { api } from './api';
import { applyLotEvent } from './lot-events';
import type { CreateDecisionInput, Lot, LotDetail, LotRealtimeMessage, Tenant } from './types';
import { connectWs, disconnectWs, joinLot } from './ws';

export const tenants = writable<Tenant[]>([]);
export const selectedTenantId = writable<string | null>(null);
export const lots = writable<Lot[]>([]);
export const selectedLot = writable<LotDetail | null>(null);
export const lastEvent = writable<LotRealtimeMessage | null>(null);
export const loadError = writable<string | null>(null);
export const wsConnected = writable(false);
export const loading = writable(false);

export async function bootstrap(options?: { lotId?: string }): Promise<void> {
	loadError.set(null);
	loading.set(true);
	try {
		const list = await api.listTenants();
		tenants.set(list);
		const current = get(selectedTenantId);
		const demo =
			list.find((tenant) => tenant.id === current) ??
			list.find((tenant) => tenant.name === 'Tenant Démo') ??
			list[0];
		if (demo) {
			selectedTenantId.set(demo.id);
			await loadLots(demo.id);
		}
		connectWs({
			onEvent: handleRealtime,
			onConnection: (connected) => wsConnected.set(connected),
		});
		if (options?.lotId) {
			await selectLot(options.lotId);
		}
	} catch (error) {
		loadError.set(error instanceof Error ? error.message : String(error));
	} finally {
		loading.set(false);
	}
}

export async function loadLots(tenantId: string): Promise<void> {
	const list = await api.listLots(tenantId);
	lots.set(list);
	for (const lot of list) {
		joinLot(lot.id);
	}
}

export async function setTenant(tenantId: string): Promise<void> {
	selectedTenantId.set(tenantId);
	selectedLot.set(null);
	lastEvent.set(null);
	await loadLots(tenantId);
}

export async function selectLot(lotId: string): Promise<void> {
	joinLot(lotId);
	const detail = await api.getLot(lotId);
	selectedLot.set(detail);
	lots.update((items) =>
		items.map((lot) =>
			lot.id === detail.id ? { ...lot, status: detail.status, spec: detail.spec } : lot,
		),
	);
}

export async function refreshSelectedLot(): Promise<void> {
	const current = get(selectedLot);
	if (current) {
		await selectLot(current.id);
	} else {
		const tenantId = get(selectedTenantId);
		if (tenantId) {
			await loadLots(tenantId);
		}
	}
}

export async function submitLot(input: {
	title: string;
	specTitle: string;
	specBody: string;
	repoUrl?: string;
	baseBranch?: string;
}): Promise<Lot> {
	const tenantId = get(selectedTenantId);
	if (!tenantId) {
		throw new Error('Aucun tenant sélectionné');
	}
	const created = await api.createLot({
		tenantId,
		title: input.title,
		spec: { title: input.specTitle, body: input.specBody },
		repoUrl: input.repoUrl || undefined,
		baseBranch: input.baseBranch || undefined,
	});
	lots.update((items) => [created, ...items.filter((lot) => lot.id !== created.id)]);
	joinLot(created.id);
	await selectLot(created.id);
	return created;
}

export async function createDecision(input: CreateDecisionInput): Promise<void> {
	const current = get(selectedLot);
	if (!current) {
		throw new Error('Aucun lot sélectionné');
	}
	await api.createDecision(current.id, input);
	await selectLot(current.id);
}

export function teardown(): void {
	disconnectWs();
	wsConnected.set(false);
}

function handleRealtime(event: LotRealtimeMessage): void {
	lastEvent.set(event);
	lots.update((items) => applyLotEvent(items, event));
	const current = get(selectedLot);
	if (current?.id === event.lotId) {
		void selectLot(event.lotId);
	}
}
