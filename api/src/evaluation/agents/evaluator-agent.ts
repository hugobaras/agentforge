export const EVALUATOR_AGENT = 'EVALUATOR_AGENT';

export interface EvaluatorInput {
  lotId: string;
  title: string;
  spec: {
    title: string;
    body: string;
  };
  deliverable: string;
}

export interface EvaluatorResult {
  score: number;
  feedback: string;
  provider: string;
}

export interface EvaluatorAgent {
  evaluate(input: EvaluatorInput): Promise<EvaluatorResult>;
}
