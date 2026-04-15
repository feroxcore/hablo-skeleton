import { createOpenAI } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";

export const intentSchema = z.object({
  name: z.enum(["greeting", "question", "task", "chitchat", "other"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1)
});

export const assistantOutputSchema = z.object({
  text: z.string().min(1),
  followUpQuestions: z.array(z.string()).max(3).default([])
});

export interface AgentConfig {
  openRouterApiKey: string;
  modelId: string;
}

export function buildAgents(config: AgentConfig) {
  const openrouter = createOpenAI({
    apiKey: config.openRouterApiKey,
    baseURL: "https://openrouter.ai/api/v1"
  });

  const model = openrouter(config.modelId);

  const intentAgent = new Agent({
    id: "intent-classifier",
    name: "Intent Classifier",
    instructions:
      "Classify a single user message intent. Keep confidence realistic and add a short reason.",
    model
  });

  const responseAgent = new Agent({
    id: "turn-responder",
    name: "Turn Responder",
    instructions: [
      "You are an assistant API for a product chat flow.",
      "Use the detected intent and optional context to produce a concise, practical response.",
      "If user intent is unclear, ask one clarification question."
    ].join(" "),
    model
  });

  return {
    intentAgent,
    responseAgent
  };
}

