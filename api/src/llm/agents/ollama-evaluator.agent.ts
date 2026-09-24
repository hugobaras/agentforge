import { Injectable } from '@nestjs/common';
import {
  EvaluatorAgent,
  EvaluatorInput,
  EvaluatorResult,
} from '../../evaluation/agents/evaluator-agent';
import { OllamaClient } from '../ollama.client';

@Injectable()
export class OllamaEvaluatorAgent implements EvaluatorAgent {
  constructor(private readonly ollama: OllamaClient) {}

  async evaluate(input: EvaluatorInput): Promise<EvaluatorResult> {
    const parsed = await this.ollama.chatJson<{
      score?: number;
      feedback?: string;
    }>(
      [
        'Tu es un agent évaluateur. Compare spec et livrable.',
        'Réponds uniquement en JSON : {"score": number 0-100, "feedback": string}.',
        'Sois strict : un livrable hors-sujet doit scorer bas.',
      ].join(' '),
      [
        `Lot: ${input.title}`,
        `Spec: ${input.spec.title}`,
        input.spec.body,
        'Livrable:',
        input.deliverable,
      ].join('\n\n'),
    );

    const score = Math.min(100, Math.max(0, Math.round(Number(parsed.score) || 0)));
    return {
      score,
      feedback: parsed.feedback?.trim() || 'Évaluation Ollama sans feedback.',
      provider: this.ollama.providerName(),
    };
  }
}
