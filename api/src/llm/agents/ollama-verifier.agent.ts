import { Injectable } from '@nestjs/common';
import {
  VerifierAgent,
  VerifierInput,
  VerifierResult,
} from '../../integration/agents/verifier-agent';
import { runExecutableVerification } from '../../integration/workspace/executable-verification';
import { OllamaClient } from '../ollama.client';

@Injectable()
export class OllamaVerifierAgent implements VerifierAgent {
  constructor(private readonly ollama: OllamaClient) {}

  async verify(input: VerifierInput): Promise<VerifierResult> {
    const executed = await runExecutableVerification(input);

    try {
      const parsed = await this.ollama.chatJson<{ reason?: string }>(
        [
          'Tu es un vérificateur indépendant. N’invente pas de nouveaux checks.',
          'On t’a déjà exécuté lint, analyse et tests. Résume le verdict.',
          'JSON uniquement : {"reason": string}.',
        ].join(' '),
        [
          `Lot: ${input.title}`,
          `Spec: ${input.spec.title}`,
          input.spec.body,
          `Approuvé: ${executed.approved}`,
          `Checks: ${JSON.stringify(executed.checks)}`,
          `Rapports: ${JSON.stringify(summarizeReports(executed.reports))}`,
        ].join('\n\n'),
      );
      const reason = parsed.reason?.trim();
      return {
        ...executed,
        reason: reason || executed.reason,
        provider: this.ollama.providerName(),
      };
    } catch {
      return { ...executed, provider: this.ollama.providerName() };
    }
  }
}

function summarizeReports(
  reports: VerifierResult['reports'],
): Record<string, { ok: boolean; command?: string; exitCode?: number | null }> {
  if (!reports) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(reports).map(([key, report]) => [
      key,
      {
        ok: Boolean(report?.ok),
        command: report?.command,
        exitCode: report?.exitCode,
      },
    ]),
  );
}
