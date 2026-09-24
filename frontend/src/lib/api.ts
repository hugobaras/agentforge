import { getApiUrl } from './env';
import type { CreateDecisionInput, CreateLotInput, Decision, Lot, LotDetail, Tenant } from './types';

async function parseError(response: Response): Promise<string> {
	const text = await response.text();
	try {
		const json = JSON.parse(text) as { message?: string | string[] };
		if (Array.isArray(json.message)) {
			return json.message.join(', ');
		}
		if (json.message) {
			return json.message;
		}
	} catch {
		/* ignore */
	}
	return text || `${response.status} ${response.statusText}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${getApiUrl()}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...init?.headers,
		},
	});
	if (!response.ok) {
		throw new Error(await parseError(response));
	}
	if (response.status === 204) {
		return undefined as T;
	}
	return (await response.json()) as T;
}

export const api = {
	listTenants: () => request<Tenant[]>('/tenants'),
	listLots: (tenantId?: string) =>
		request<Lot[]>(tenantId ? `/lots?tenantId=${encodeURIComponent(tenantId)}` : '/lots'),
	getLot: (id: string) => request<LotDetail>(`/lots/${id}`),
	createLot: (body: CreateLotInput) =>
		request<Lot>('/lots', {
			method: 'POST',
			body: JSON.stringify(body),
		}),
	listDecisions: (lotId: string) => request<Decision[]>(`/lots/${lotId}/decisions`),
	createDecision: (lotId: string, body: CreateDecisionInput) =>
		request<Decision>(`/lots/${lotId}/decisions`, {
			method: 'POST',
			body: JSON.stringify(body),
		}),
};
