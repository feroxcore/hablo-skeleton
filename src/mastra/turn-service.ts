import {
  assistantOutputSchema,
  buildAgents,
  intentSchema
} from "./agents";
import { createLifecycleTracker } from "../turn-lifecycle";
import type { TurnRequest, TurnResponse } from "../types";

const FALLBACK_MODEL = "openai/gpt-4o-mini";

function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function parseUsage(usage: unknown) {
  const record = (usage ?? {}) as Record<string, unknown>;

  return {
    inputTokens: readNumber(record.inputTokens ?? record.promptTokens),
    outputTokens: readNumber(record.outputTokens ?? record.completionTokens),
    totalTokens: readNumber(record.totalTokens)
  };
}

export interface RuntimeEnv {
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  TURN_STATE?: KVNamespace;
}

export async function runTurn(
  env: RuntimeEnv,
  turnRequest: TurnRequest
): Promise<TurnResponse> {
  const lifecycle = createLifecycleTracker();
  const turnId = turnRequest.turnId ?? crypto.randomUUID();

  lifecycle.push("received", {
    sessionId: turnRequest.sessionId,
    turnId
  });

  const { intentAgent, responseAgent } = buildAgents({
    openRouterApiKey: env.OPENROUTER_API_KEY,
    modelId: env.OPENROUTER_MODEL ?? FALLBACK_MODEL
  });

  try {
    const intentResult = await intentAgent.generate(turnRequest.input.text, {
      modelSettings: {
        temperature: 0
      },
      structuredOutput: {
        schema: intentSchema
      }
    });

    const intent =
      intentResult.object ??
      ({
        name: "other",
        confidence: 0.25,
        reason: "Intent classification schema fallback"
      } as const);

    lifecycle.push("intent_classified", {
      intent: intent.name,
      confidence: intent.confidence
    });

    const prompt = [
      `User message: ${turnRequest.input.text}`,
      `Detected intent: ${intent.name} (confidence ${intent.confidence})`,
      `Intent reason: ${intent.reason}`,
      `Context JSON: ${JSON.stringify(turnRequest.context ?? {})}`
    ].join("\n");

    const responseResult = await responseAgent.generate(prompt, {
      structuredOutput: {
        schema: assistantOutputSchema
      }
    });

    const output = responseResult.object
      ? {
          text: responseResult.object.text,
          followUpQuestions: responseResult.object.followUpQuestions ?? []
        }
      : {
          text: responseResult.text,
          followUpQuestions: []
        };

    lifecycle.push("response_generated", {
      finishReason: responseResult.finishReason
    });
    lifecycle.push("completed");

    return {
      sessionId: turnRequest.sessionId,
      turnId,
      intent,
      output,
      usage: parseUsage(responseResult.usage),
      lifecycle: lifecycle.getEvents()
    };
  } catch (error) {
    lifecycle.push("error", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    throw Object.assign(
      new Error(
        error instanceof Error ? error.message : "Failed to process turn"
      ),
      {
        sessionId: turnRequest.sessionId,
        turnId,
        lifecycle: lifecycle.getEvents()
      }
    );
  }
}
