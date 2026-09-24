export const OLLAMA_OPTIONS = 'OLLAMA_OPTIONS';

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export function loadOllamaOptions(): OllamaOptions {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(
      /\/$/,
      '',
    ),
    model: process.env.OLLAMA_MODEL ?? 'llama3.2',
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 180_000),
  };
}

export function isOllamaEnabled(): boolean {
  return (process.env.LLM_PROVIDER ?? 'mock').toLowerCase() === 'ollama';
}
