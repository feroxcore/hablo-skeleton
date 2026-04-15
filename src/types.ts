import { z } from "zod";

export const turnRequestSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  turnId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  input: z.object({
    text: z.string().min(1, "input.text is required")
  }),
  context: z.record(z.unknown()).optional()
});

export type TurnRequest = z.infer<typeof turnRequestSchema>;

export type TurnLifecycleStage =
  | "received"
  | "intent_classified"
  | "response_generated"
  | "completed"
  | "error";

export interface TurnLifecycleEvent {
  stage: TurnLifecycleStage;
  at: string;
  metadata?: Record<string, unknown>;
}

export interface TurnResponse {
  sessionId: string;
  turnId: string;
  intent: {
    name: string;
    confidence: number;
    reason: string;
  };
  output: {
    text: string;
    followUpQuestions: string[];
  };
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  lifecycle: TurnLifecycleEvent[];
}

export type StoredTurnStatus = "completed" | "error";

export interface StoredTurnRecord {
  sessionId: string;
  turnId: string;
  userId?: string;
  createdAt: string;
  status: StoredTurnStatus;
  request: TurnRequest;
  response?: TurnResponse;
  error?: {
    code: string;
    message: string;
  };
  lifecycle: TurnLifecycleEvent[];
}
