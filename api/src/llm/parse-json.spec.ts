import { parseJsonContent } from './parse-json';

describe('parseJsonContent', () => {
  it('parse un objet JSON brut', () => {
    expect(parseJsonContent<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('extrait un bloc markdown', () => {
    expect(parseJsonContent<{ ok: boolean }>('prefix\n```json\n{"ok":true}\n```')).toEqual({
      ok: true,
    });
  });

  it('répare des retours à la ligne bruts dans une chaîne', () => {
    const broken = '{"files":[{"content":"export const ping = true\n"}]}';
    expect(parseJsonContent<{ files: Array<{ content: string }> }>(broken)).toEqual({
      files: [{ content: 'export const ping = true\n' }],
    });
  });

  it('rejette une réponse sans objet', () => {
    expect(() => parseJsonContent('pas de json')).toThrow(/JSON/);
  });
});
