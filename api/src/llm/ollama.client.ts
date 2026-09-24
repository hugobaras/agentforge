import { Inject, Injectable } from '@nestjs/common';
import { OLLAMA_OPTIONS, type OllamaOptions } from './ollama.options';
import { parseJsonContent } from './parse-json';

interface OllamaChatResponse {
  message?: { content?: string };
}

@Injectable()
export class OllamaClient {
  constructor(
    @Inject(OLLAMA_OPTIONS) private readonly options: OllamaOptions,
  ) {}

  async chatJson<T>(system: string, user: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(`${this.options.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.1,
            num_ctx: 4096,
            num_predict: 2048,
          },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama HTTP ${response.status}: ${body}`);
      }
      const payload = (await response.json()) as OllamaChatResponse;
      const content = payload.message?.content;
      if (!content) {
        throw new Error('Ollama : message.content vide');
      }
      return parseJsonContent<T>(content);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama timeout après ${this.options.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  providerName(): string {
    return `ollama:${this.options.model}`;
  }
}
