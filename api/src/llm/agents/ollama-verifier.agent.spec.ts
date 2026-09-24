import { OllamaClient } from '../ollama.client';
import { OllamaVerifierAgent } from './ollama-verifier.agent';

const spec = { title: 'Ping HTTP', body: 'GET /ping doit répondre pong' };
const deliverable = JSON.stringify({
  summary: 'Ping HTTP pong',
  files: [
    {
      path: 'src/ping.mjs',
      content:
        '// Ping HTTP GET /ping pong\nexport function ping() { return { pong: true }; }\n',
    },
    {
      path: 'src/ping.test.mjs',
      content: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { ping } from './ping.mjs';",
        "test('pong', () => assert.deepEqual(ping(), { pong: true }));",
        '',
      ].join('\n'),
    },
  ],
});

describe('OllamaVerifierAgent', () => {
  it('garde les checks exécutés et enrichit le reason', async () => {
    const ollama = {
      chatJson: jest.fn().mockResolvedValue({ reason: 'Livrable solide.' }),
      providerName: () => 'ollama:llama3.2',
    };
    const agent = new OllamaVerifierAgent(ollama as unknown as OllamaClient);

    const result = await agent.verify({
      lotId: 'lot-ollama-v',
      title: 'Ping',
      spec,
      deliverable,
    });

    expect(result.approved).toBe(true);
    expect(result.checks.tests).toBe(true);
    expect(result.reason).toBe('Livrable solide.');
    expect(result.provider).toBe('ollama:llama3.2');
    expect(ollama.chatJson).toHaveBeenCalled();
  });

  it('conserve le reason d’exécution si Ollama échoue', async () => {
    const ollama = {
      chatJson: jest.fn().mockRejectedValue(new Error('timeout')),
      providerName: () => 'ollama:llama3.2',
    };
    const agent = new OllamaVerifierAgent(ollama as unknown as OllamaClient);

    const result = await agent.verify({
      lotId: 'lot-ollama-v2',
      title: 'Ping',
      spec,
      deliverable,
    });

    expect(result.approved).toBe(true);
    expect(result.reason).toMatch(/Vérification exécutable OK/);
  });
});
