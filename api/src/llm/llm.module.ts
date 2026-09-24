import { Global, Module } from '@nestjs/common';
import { OllamaEvaluatorAgent } from './agents/ollama-evaluator.agent';
import { OllamaImplementerAgent } from './agents/ollama-implementer.agent';
import { OllamaVerifierAgent } from './agents/ollama-verifier.agent';
import { OllamaClient } from './ollama.client';
import { OLLAMA_OPTIONS, loadOllamaOptions } from './ollama.options';

@Global()
@Module({
  providers: [
    { provide: OLLAMA_OPTIONS, useFactory: loadOllamaOptions },
    OllamaClient,
    OllamaImplementerAgent,
    OllamaEvaluatorAgent,
    OllamaVerifierAgent,
  ],
  exports: [
    OllamaClient,
    OllamaImplementerAgent,
    OllamaEvaluatorAgent,
    OllamaVerifierAgent,
  ],
})
export class LlmModule {}
