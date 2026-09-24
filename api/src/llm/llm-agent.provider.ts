import { Provider, Type } from '@nestjs/common';
import { isOllamaEnabled } from './ollama.options';

export function llmAgentProvider(
  token: string,
  ollamaClass: Type,
  mockClass: Type,
): Provider {
  return {
    provide: token,
    inject: [ollamaClass, mockClass],
    useFactory: (ollamaAgent: unknown, mockAgent: unknown) =>
      isOllamaEnabled() ? ollamaAgent : mockAgent,
  };
}
