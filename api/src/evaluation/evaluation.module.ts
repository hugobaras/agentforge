import { Module } from '@nestjs/common';
import { OllamaEvaluatorAgent } from '../llm/agents/ollama-evaluator.agent';
import { llmAgentProvider } from '../llm/llm-agent.provider';
import { AgentImplementedConsumer } from './agent-implemented.consumer';
import { EVALUATOR_AGENT } from './agents/evaluator-agent';
import { MockEvaluatorAgent } from './agents/mock-evaluator.agent';
import { EvaluationService } from './evaluation.service';

@Module({
  providers: [
    EvaluationService,
    AgentImplementedConsumer,
    MockEvaluatorAgent,
    llmAgentProvider(
      EVALUATOR_AGENT,
      OllamaEvaluatorAgent,
      MockEvaluatorAgent,
    ),
  ],
  exports: [EvaluationService],
})
export class EvaluationModule {}
