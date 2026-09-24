export const IMPLEMENTER_AGENT = 'IMPLEMENTER_AGENT';

export interface ImplementerInput {
  lotId: string;
  title: string;
  spec: {
    title: string;
    body: string;
  };
  previousDeliverable?: string;
  feedback?: string;
  iteration?: number;
}

export interface ImplementerResult {
  summary: string;
  files: Array<{ path: string; content: string }>;
  provider: string;
}

export interface ImplementerAgent {
  implement(input: ImplementerInput): Promise<ImplementerResult>;
}
