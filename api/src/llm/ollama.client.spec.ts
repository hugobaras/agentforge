import { OllamaClient } from './ollama.client';

describe('OllamaClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('envoie /api/chat et parse le JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{"score":80}' } }),
    });
    const client = new OllamaClient({
      baseUrl: 'http://ollama:11434',
      model: 'llama3.2',
      timeoutMs: 5000,
    });

    await expect(client.chatJson('sys', 'user')).resolves.toEqual({ score: 80 });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://ollama:11434/api/chat',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(client.providerName()).toBe('ollama:llama3.2');
  });

  it('échoue si HTTP non OK', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'model not found',
    });
    const client = new OllamaClient({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'missing',
      timeoutMs: 5000,
    });

    await expect(client.chatJson('s', 'u')).rejects.toThrow('Ollama HTTP 404');
  });
});
