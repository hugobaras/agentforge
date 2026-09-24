import { Injectable } from '@nestjs/common';
import {
  EvaluatorAgent,
  EvaluatorInput,
  EvaluatorResult,
} from './evaluator-agent';

const STOP_WORDS = new Set([
  'avec',
  'dans',
  'doit',
  'pour',
  'une',
  'des',
  'les',
  'the',
  'and',
  'that',
]);

@Injectable()
export class MockEvaluatorAgent implements EvaluatorAgent {
  async evaluate(input: EvaluatorInput): Promise<EvaluatorResult> {
    if (!input.deliverable.trim()) {
      return {
        score: 0,
        feedback: 'Livrable vide : aucun élément à comparer à la spec.',
        provider: 'mock',
      };
    }

    const specTerms = extractTerms(`${input.spec.title}\n${input.spec.body}`);
    const haystack = input.deliverable.toLowerCase();
    const matched = specTerms.filter((term) => haystack.includes(term));
    const coverage =
      specTerms.length === 0 ? 0.6 : matched.length / specTerms.length;

    let score = Math.round(coverage * 80);
    if (looksStructured(input.deliverable)) {
      score += 20;
    }
    score = Math.min(100, Math.max(0, score));

    const missing = specTerms.filter((term) => !haystack.includes(term)).slice(0, 5);
    const feedback = [
      `Couverture spec/livrable : ${matched.length}/${specTerms.length || 0} termes.`,
      looksStructured(input.deliverable)
        ? 'Livrable structuré (JSON / fichiers) détecté (+20).'
        : 'Livrable peu structuré.',
      missing.length > 0 ? `Termes peu couverts : ${missing.join(', ')}.` : 'Spec bien reflétée.',
    ].join(' ');

    return { score, feedback, provider: 'mock' };
  }
}

function extractTerms(text: string): string[] {
  const terms = text
    .toLowerCase()
    .split(/[^a-z0-9àâäéèêëïîôùûüç]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 3 && !STOP_WORDS.has(token));
  return [...new Set(terms)];
}

function looksStructured(deliverable: string): boolean {
  try {
    const parsed: unknown = JSON.parse(deliverable);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      ('files' in parsed || 'summary' in parsed)
    );
  } catch {
    return deliverable.includes('export function') || deliverable.includes('```');
  }
}
