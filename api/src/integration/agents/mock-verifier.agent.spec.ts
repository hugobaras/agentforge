import { MockVerifierAgent } from './mock-verifier.agent';

describe('MockVerifierAgent', () => {
  const agent = new MockVerifierAgent();
  const spec = { title: 'Ping HTTP', body: 'GET /ping doit répondre pong' };

  it('approuve un livrable matérialisé avec tests Node exécutés', async () => {
    const result = await agent.verify({
      lotId: 'lot-1',
      title: 'Ping',
      spec,
      deliverable: JSON.stringify({
        summary: 'Ping HTTP GET /ping pong',
        files: [
          {
            path: 'src/ping.mjs',
            content: [
              '// Ping HTTP GET /ping pong',
              'export function ping() { return { pong: true }; }',
              '',
            ].join('\n'),
          },
          {
            path: 'src/ping.test.mjs',
            content: [
              "import { test } from 'node:test';",
              "import assert from 'node:assert/strict';",
              "import { ping } from './ping.mjs';",
              "test('pong', () => {",
              '  assert.deepEqual(ping(), { pong: true });',
              '});',
              '',
            ].join('\n'),
          },
        ],
      }),
    });

    expect(result.approved).toBe(true);
    expect(result.checks).toEqual({
      standards: true,
      tests: true,
      fidelity: true,
      lint: true,
      analysis: true,
    });
    expect(result.reports?.tests?.ok).toBe(true);
    expect(result.reports?.tests?.exitCode).toBe(0);
    expect(result.provider).toBe('mock');
  });

  it('rejette un livrable sans tests exécutables', async () => {
    const result = await agent.verify({
      lotId: 'lot-1',
      title: 'Ping',
      spec,
      deliverable: JSON.stringify({
        summary: 'Ping HTTP GET /ping pong',
        files: [
          {
            path: 'src/ping.mjs',
            content: 'export function ping() { return { pong: true }; }\n',
          },
        ],
      }),
    });

    expect(result.approved).toBe(false);
    expect(result.checks.tests).toBe(false);
    expect(result.reports?.tests?.stderr).toMatch(/Aucun fichier de test/i);
  });

  it('rejette un livrable non structuré', async () => {
    const result = await agent.verify({
      lotId: 'lot-1',
      title: 'Ping',
      spec,
      deliverable: 'juste du texte',
    });

    expect(result.approved).toBe(false);
    expect(result.checks.standards).toBe(false);
  });
});
