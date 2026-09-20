export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type NoulQuestion = {
  type: "noul";
  instructions: string | Record<string, Json>;
  criteria?: { true: string; false: string };
};
export type ChoiceQuestion = {
  type: "choice";
  instructions: string | Record<string, Json>;
  criteria: Record<string, string | null>;
};
export type ScoreQuestion = {
  type: "score";
  instructions: string | Record<string, Json>;
  criteria: string[];
};
export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type Questions = Record<string, Question>;
export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  probabilities: Record<string, number>;
  confidence: number;
  legend: Record<string, string>;
};
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;
export type Answers = Record<string, Answer>;
export type JevRequest = { state: unknown; questions: Questions; cache?: boolean; tag?: string };
export type JevResponse = {
  model: string;
  answers: Answers;
  usage: { input_tokens: number; output_tokens: number };
  meta: {
    requestId: string;
    providerMs: number;
    totalMs: number;
    cached: boolean;
    questionCount: number;
    at: string;
  };
};
export type GenerationProvider = "openai" | "anthropic";
export type GenerationTask = "workflow" | "report" | "discussion" | "code-query" | "context-task";
export type GenerateRequest = {
  provider: GenerationProvider;
  task: GenerationTask;
  prompt: string;
  context?: unknown;
};
export type GenerateResponse = {
  text: string;
  provider: GenerationProvider;
  model: string;
  durationMs: number;
  usage: { input_tokens: number; output_tokens: number };
};
export type Health = {
  jev: { configured: boolean; model: string };
  openai: { configured: boolean; model: string };
  anthropic: { configured: boolean; model: string };
};
