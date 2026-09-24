import { env } from '$env/dynamic/public';

export function getApiUrl(): string {
	return (env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function getWsHttpUrl(): string {
	const raw = env.PUBLIC_WS_URL ?? env.PUBLIC_API_URL ?? 'http://localhost:3000';
	return raw.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/$/, '');
}
