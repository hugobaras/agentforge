import { MockImplementerAgent } from './mock-implementer.agent';

describe('MockImplementerAgent', () => {
  const agent = new MockImplementerAgent();

  it('produit un livrable incomplet à la première passe', async () => {
    const result = await agent.implement({
      lotId: 'lot-1',
      title: 'Endpoint ping',
      spec: { title: 'Ping HTTP', body: 'GET /ping → {pong:true}' },
    });

    expect(result.provider).toBe('mock');
    expect(result.summary).toContain('Endpoint ping');
    expect(result.summary).toMatch(/incomplète/);
    expect(result.files[0]?.content).toContain('lot-1');
    expect(result.files[0]?.content).not.toContain('Ping HTTP');
    expect(result.files[0]?.path).toMatch(/\.ts$/);
  });

  it('réinjecte spec et feedback à la passe suivante', async () => {
    const result = await agent.implement({
      lotId: 'lot-1',
      title: 'Endpoint ping',
      spec: { title: 'Ping HTTP', body: 'GET /ping → {pong:true}' },
      previousDeliverable: '{"summary":"draft"}',
      feedback: 'Couverture insuffisante : ping, pong.',
      iteration: 2,
    });

    expect(result.summary).toContain('Ping HTTP');
    expect(result.files[0]?.content).toContain('Ping HTTP');
    expect(result.files[0]?.content).toContain('pong');
    expect(result.files[0]?.content).toContain('Couverture insuffisante');
    expect(result.files.some((file) => file.path.endsWith('.test.mjs'))).toBe(
      true,
    );
    expect(result.files.map((file) => file.content).join('\n')).toMatch(
      /node:test/,
    );
  });
});
