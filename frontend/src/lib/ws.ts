import { io, type Socket } from 'socket.io-client';
import { getWsHttpUrl } from './env';
import type { LotRealtimeMessage } from './types';

type WsHandlers = {
	onEvent: (message: LotRealtimeMessage) => void;
	onConnection?: (connected: boolean) => void;
};

let socket: Socket | null = null;
const rooms = new Set<string>();

export function connectWs(handlers: WsHandlers): void {
	if (socket) {
		return;
	}

	socket = io(getWsHttpUrl(), {
		transports: ['websocket'],
		autoConnect: true,
	});

	socket.on('connect', () => {
		handlers.onConnection?.(true);
		for (const lotId of rooms) {
			socket?.emit('join', { lotId });
		}
	});
	socket.on('disconnect', () => handlers.onConnection?.(false));
	socket.on('connect_error', () => handlers.onConnection?.(false));
	socket.on('lot.event', (message: LotRealtimeMessage) => {
		handlers.onEvent(message);
	});
}

export function joinLot(lotId: string): void {
	rooms.add(lotId);
	if (socket?.connected) {
		socket.emit('join', { lotId });
	}
}

export function disconnectWs(): void {
	socket?.removeAllListeners();
	socket?.disconnect();
	socket = null;
	rooms.clear();
}
