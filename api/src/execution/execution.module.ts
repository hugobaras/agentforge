import { Module } from '@nestjs/common';
import { OllamaImplementerAgent } from '../llm/agents/ollama-implementer.agent';
import { llmAgentProvider } from '../llm/llm-agent.provider';
import { IMPLEMENTER_AGENT } from './agents/implementer-agent';
import { MockImplementerAgent } from './agents/mock-implementer.agent';
import { ExecutionService } from './execution.service';
import { LotReworkConsumer } from './lot-rework.consumer';
import { LotSubmittedConsumer } from './lot-submitted.consumer';

@Module({
  providers: [
    ExecutionService,
    LotSubmittedConsumer,
    LotReworkConsumer,
    MockImplementerAgent,
    llmAgentProvider(
      IMPLEMENTER_AGENT,
      OllamaImplementerAgent,
      MockImplementerAgent,
    ),
  ],
  exports: [ExecutionService],
})
export class ExecutionModule {}
