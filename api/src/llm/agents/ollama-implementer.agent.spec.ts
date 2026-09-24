import { OllamaClient } from '../ollama.client';
import { OllamaImplementerAgent } from './ollama-implementer.agent';

describe('OllamaImplementerAgent', () => {
  it('mappe summary + files et pose le provider', async () => {
    const ollama = {
      chatJson: jest.fn().mockResolvedValue({
        summary: 'Ping OK',
        files: [{ path: 'src/ping.ts', content: 'export const ping = true' }],
      }),
      providerName: () => 'ollama:llama3.2',
    };
    const agent = new OllamaImplementerAgent(ollama as unknown as OllamaClient);

    const result = await agent.implement({
      lotId: 'lot-1',
      title: 'Ping',
      spec: { title: 'HTTP', body: 'GET /ping' },
    });

    expect(result.provider).toBe('ollama:llama3.2');
    expect(result.summary).toBe('Ping OK');
    expect(result.files).toHaveLength(1);
  });

  it('inclut feedback et livrable précédent dans le prompt', async () => {
    const ollama = {
      chatJson: jest.fn().mockResolvedValue({
        summary: 'Révisé',
        files: [{ path: 'src/ping.ts', content: 'export const ping = true' }],
      }),
      providerName: () => 'ollama:llama3.2',
    };
    const agent = new OllamaImplementerAgent(ollama as unknown as OllamaClient);

    await agent.implement({
      lotId: 'lot-1',
      title: 'Ping',
      spec: { title: 'HTTP', body: 'GET /ping' },
      feedback: 'Ajoute pong',
      previousDeliverable: '{"summary":"v1"}',
      iteration: 2,
    });

    const userPrompt = ollama.chatJson.mock.calls[0][1] as string;
    expect(userPrompt).toContain('Itération: 2');
    expect(userPrompt).toContain('Ajoute pong');
    expect(userPrompt).toContain('{"summary":"v1"}');
  });

  it('accepte files[].lines à la place de content', async () => {
    const ollama = {
      chatJson: jest.fn().mockResolvedValue({
        summary: 'Ping',
        files: [{ path: 'src/ping.ts', lines: ['export const ping = true'] }],
      }),
      providerName: () => 'ollama:llama3.2',
    };
    const agent = new OllamaImplementerAgent(ollama as unknown as OllamaClient);

    const result = await agent.implement({
      lotId: 'lot-1',
      title: 'Ping',
      spec: { title: 'HTTP', body: 'GET /ping' },
    });

    expect(result.files).toEqual([
      { path: 'src/ping.ts', content: 'export const ping = true' },
    ]);
  });

  it('rejette une réponse sans fichiers', async () => {
    const ollama = {
      chatJson: jest.fn().mockResolvedValue({ summary: 'vide', files: [] }),
      providerName: () => 'ollama:x',
    };
    const agent = new OllamaImplementerAgent(ollama as unknown as OllamaClient);

    await expect(
      agent.implement({
        lotId: 'l',
        title: 't',
        spec: { title: 's', body: 'b' },
      }),
    ).rejects.toThrow(/aucun fichier/);
  });
});
