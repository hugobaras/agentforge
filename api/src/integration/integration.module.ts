import { Module } from '@nestjs/common';
import { GitModule } from '../git/git.module';
import { OllamaVerifierAgent } from '../llm/agents/ollama-verifier.agent';
import { llmAgentProvider } from '../llm/llm-agent.provider';
import { MockVerifierAgent } from './agents/mock-verifier.agent';
import {
  VERIFICATION_OPTIONS,
  VERIFIER_AGENT,
} from './agents/verifier-agent';
import { EvaluationScoredConsumer } from './evaluation-scored.consumer';
import { IntegrationService } from './integration.service';

@Module({
  imports: [GitModule],
  providers: [
    IntegrationService,
    EvaluationScoredConsumer,
    MockVerifierAgent,
    llmAgentProvider(VERIFIER_AGENT, OllamaVerifierAgent, MockVerifierAgent),
    {
      provide: VERIFICATION_OPTIONS,
      useFactory: () => {
        const threshold = Number(
          process.env.EVALUATION_APPROVAL_THRESHOLD ?? 70,
        );
        const maxIterations = Number(
          process.env.MAX_IMPLEMENT_ITERATIONS ?? 3,
        );
        return {
          approvalThreshold: Number.isFinite(threshold) ? threshold : 70,
          maxImplementIterations:
            Number.isFinite(maxIterations) && maxIterations >= 1
              ? Math.floor(maxIterations)
              : 3,
        };
      },
    },
  ],
  exports: [IntegrationService],
})
export class IntegrationModule {}
