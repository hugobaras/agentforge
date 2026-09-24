import { Injectable } from '@nestjs/common';
import {
  ImplementerAgent,
  ImplementerInput,
  ImplementerResult,
} from '../../execution/agents/implementer-agent';
import { OllamaClient } from '../ollama.client';

@Injectable()
export class OllamaImplementerAgent implements ImplementerAgent {
  constructor(private readonly ollama: OllamaClient) {}

  async implement(input: ImplementerInput): Promise<ImplementerResult> {
    const parsed = await this.ollama.chatJson<{
      summary?: string;
      files?: Array<{ path?: string; content?: string; lines?: string[] }>;
    }>(
      [
        'Tu es un agent implémenteur. Réponds uniquement en JSON valide, sans markdown.',
        'Schéma exact : {"summary":"texte","files":[{"path":"fichier.mjs","content":"code"}]}',
        'content est UNE chaîne : échappe les guillemets (\\") et encode les sauts de ligne en \\n.',
        'N’utilise pas de tableau lines. Inclus le code et un *.test.mjs (node:test + node:assert/strict).',
        'Un à trois petits fichiers suffisent.',
      ].join(' '),
      [
        `Lot: ${input.title}`,
        `Spec: ${input.spec.title}`,
        input.spec.body,
        `lotId: ${input.lotId}`,
        input.iteration != null ? `Itération: ${input.iteration}` : '',
        input.feedback
          ? `Feedback évaluateur à prendre en compte:\n${input.feedback}`
          : '',
        input.previousDeliverable
          ? `Livrable précédent:\n${input.previousDeliverable}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );

    const files = (parsed.files ?? [])
      .map((file) => ({
        path: file.path ? String(file.path) : '',
        content:
          file.content != null
            ? String(file.content)
            : Array.isArray(file.lines)
              ? file.lines.map((line) => String(line)).join('\n')
              : '',
      }))
      .filter((file) => file.path && file.content);

    if (files.length === 0) {
      throw new Error('Ollama implémenteur : aucun fichier dans la réponse');
    }

    return {
      summary: parsed.summary?.trim() || `Livrable Ollama pour « ${input.title} »`,
      files,
      provider: this.ollama.providerName(),
    };
  }
}
