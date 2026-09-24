export interface LotRealtimeMessage {
  lotId: string;
  status: string;
  eventType: string;
  payload: unknown;
}
