import { llmAgentProvider } from './llm-agent.provider';

class Ollama {}
class Mock {}

describe('llmAgentProvider', () => {
  const original = process.env.LLM_PROVIDER;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = original;
    }
  });

  it('choisit le mock par défaut', () => {
    delete process.env.LLM_PROVIDER;
    const provider = llmAgentProvider('T', Ollama, Mock);
    const factory = (provider as { useFactory: (a: unknown, b: unknown) => unknown })
      .useFactory;
    expect(factory('ollama', 'mock')).toBe('mock');
  });

  it('choisit Ollama si LLM_PROVIDER=ollama', () => {
    process.env.LLM_PROVIDER = 'ollama';
    const provider = llmAgentProvider('T', Ollama, Mock);
    const factory = (provider as { useFactory: (a: unknown, b: unknown) => unknown })
      .useFactory;
    expect(factory('ollama', 'mock')).toBe('ollama');
  });
});
