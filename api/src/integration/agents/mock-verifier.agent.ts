import { Injectable } from '@nestjs/common';
import { runExecutableVerification } from '../workspace/executable-verification';
import { VerifierAgent, VerifierInput, VerifierResult } from './verifier-agent';

@Injectable()
export class MockVerifierAgent implements VerifierAgent {
  async verify(input: VerifierInput): Promise<VerifierResult> {
    const result = await runExecutableVerification(input);
    return { ...result, provider: 'mock' };
  }
}
