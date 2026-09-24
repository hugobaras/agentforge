import { MockImplementerAgent } from '../../execution/agents/mock-implementer.agent';
import { MockEvaluatorAgent } from './mock-evaluator.agent';

describe('MockEvaluatorAgent', () => {
  const agent = new MockEvaluatorAgent();

  it('donne 0 si le livrable est vide', async () => {
    const result = await agent.evaluate({
      lotId: 'lot-1',
      title: 'Ping',
      spec: { title: 'Ping HTTP', body: 'GET /ping doit répondre pong' },
      deliverable: '   ',
    });

    expect(result.score).toBe(0);
    expect(result.feedback).toMatch(/vide/i);
  });

  it('score plus haut quand la spec est reflétée dans un livrable structuré', async () => {
    const high = await agent.evaluate({
      lotId: 'lot-1',
      title: 'Ping',
      spec: { title: 'Ping HTTP', body: 'GET /ping doit répondre pong' },
      deliverable: JSON.stringify({
        summary: 'Ping HTTP GET /ping pong',
        files: [{ path: 'src/ping.ts', content: 'export function ping() {}' }],
      }),
    });
    const low = await agent.evaluate({
      lotId: 'lot-1',
      title: 'Ping',
      spec: { title: 'Ping HTTP', body: 'GET /ping doit répondre pong' },
      deliverable: 'hello world',
    });

    expect(high.score).toBeGreaterThan(low.score);
    expect(high.score).toBeGreaterThanOrEqual(0);
    expect(high.score).toBeLessThanOrEqual(100);
    expect(high.provider).toBe('mock');
  });

  it('passe sous le seuil à la 1ʳᵉ passe mock, au-dessus après rework', async () => {
    const implementer = new MockImplementerAgent();
    const spec = {
      lotId: 'lot-1',
      title: 'Lot ping',
      spec: { title: 'Ping HTTP', body: 'GET /ping doit répondre pong' },
    };

    const first = await implementer.implement(spec);
    const firstScore = await agent.evaluate({
      ...spec,
      deliverable: JSON.stringify(first),
    });
    const second = await implementer.implement({
      ...spec,
      feedback: firstScore.feedback,
      previousDeliverable: JSON.stringify(first),
      iteration: 2,
    });
    const secondScore = await agent.evaluate({
      ...spec,
      deliverable: JSON.stringify(second),
    });

    expect(firstScore.score).toBeLessThan(70);
    expect(secondScore.score).toBeGreaterThanOrEqual(70);
  });
});
