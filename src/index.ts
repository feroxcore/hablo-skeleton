import { turnRequestSchema, type TurnRequest } from "./types";
import { renderUiHtml } from "./ui";
import {
  getTurnRecord,
  listSessionTurnRecords,
  parseTurnsLimit,
  persistTurnRecord
} from "./turn-store";

interface RuntimeEnv {
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  TURN_STATE?: KVNamespace;
}

const TURN_TIMEOUT_MS = 25_000;

class TurnTimeoutError extends Error {
  code = "turn_timeout";
  constructor(message: string) {
    super(message);
    this.name = "TurnTimeoutError";
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new TurnTimeoutError(
          `Turn processing timed out after ${timeoutMs}ms.`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "text/html; charset=utf-8"
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type, authorization"
  };
}

function readProcessEnv(key: string): string | undefined {
  try {
    const processLike = (
      globalThis as unknown as {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process;
    return processLike?.env?.[key];
  } catch {
    return undefined;
  }
}

function normalizeSecret(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function resolveOpenRouterApiKey(env: RuntimeEnv): string | undefined {
  return normalizeSecret(
    env.OPENROUTER_API_KEY ?? readProcessEnv("OPENROUTER_API_KEY")
  );
}

export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "GET" && pathname === "/health") {
      const openRouterApiKey = resolveOpenRouterApiKey(env);
      return jsonResponse({
        ok: true,
        service: "skeleton-ai-api",
        openRouterApiKeyConfigured: Boolean(openRouterApiKey),
        storage: env.TURN_STATE ? "kv" : "memory",
        timestamp: new Date().toISOString()
      });
    }

    if (request.method === "GET" && (pathname === "/" || pathname === "/ui")) {
      return htmlResponse(renderUiHtml());
    }

    if (request.method === "GET" && pathname.startsWith("/v1/turn/")) {
      const turnId = decodeURIComponent(pathname.replace("/v1/turn/", ""));
      if (!turnId) {
        return jsonResponse(
          {
            error: {
              code: "invalid_request",
              message: "turnId path parameter is required"
            }
          },
          400
        );
      }

      const record = await getTurnRecord(env, turnId);
      if (!record) {
        return jsonResponse(
          {
            error: {
              code: "not_found",
              message: `Turn ${turnId} was not found`
            }
          },
          404
        );
      }

      return jsonResponse(record);
    }

    const sessionTurnsMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/turns$/);
    if (request.method === "GET" && sessionTurnsMatch) {
      const sessionId = decodeURIComponent(sessionTurnsMatch[1]);
      const limit = parseTurnsLimit(url.searchParams);
      const turns = await listSessionTurnRecords(env, sessionId, limit);

      return jsonResponse({
        sessionId,
        count: turns.length,
        turns
      });
    }

    if (request.method === "POST" && pathname === "/v1/turn") {
      const openRouterApiKey = resolveOpenRouterApiKey(env);

      if (!openRouterApiKey) {
        return jsonResponse(
          {
            error: {
              code: "missing_env",
              message:
                "OPENROUTER_API_KEY is not configured. Set it in .dev.vars for local dev."
            }
          },
          500
        );
      }

      let parsedData: TurnRequest | null = null;

      try {
        const body = (await request.json()) as unknown;
        const parsed = turnRequestSchema.safeParse(body);

        if (!parsed.success) {
          return jsonResponse(
            {
              error: {
                code: "invalid_request",
                message: "Request validation failed",
                details: parsed.error.flatten()
              }
            },
            400
          );
        }

        parsedData = parsed.data;
        const { runTurn } = await import("./mastra/turn-service");
        const result = await withTimeout(
          runTurn(
            {
              ...env,
              OPENROUTER_API_KEY: openRouterApiKey
            },
            parsedData
          ),
          TURN_TIMEOUT_MS
        );
        await persistTurnRecord(env, {
          sessionId: result.sessionId,
          turnId: result.turnId,
          userId: parsedData.userId,
          createdAt:
            result.lifecycle.find((item) => item.stage === "completed")?.at ??
            new Date().toISOString(),
          status: "completed",
          request: parsedData,
          response: result,
          lifecycle: result.lifecycle
        });

        return jsonResponse(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to process request";
        const isTimeout = error instanceof TurnTimeoutError;

        const lifecycle =
          typeof error === "object" && error !== null && "lifecycle" in error
            ? (error.lifecycle as unknown)
            : undefined;

        const turnId =
          typeof error === "object" && error !== null && "turnId" in error
            ? String(error.turnId)
            : crypto.randomUUID();

        if (parsedData) {
          await persistTurnRecord(env, {
            sessionId: parsedData.sessionId,
            turnId,
            userId: parsedData.userId,
            createdAt: new Date().toISOString(),
            status: "error",
            request: parsedData,
            error: {
              code: isTimeout ? "turn_timeout" : "turn_failed",
              message
            },
            lifecycle: Array.isArray(lifecycle) ? lifecycle : []
          });
        }

        return jsonResponse(
          {
            error: {
              code: isTimeout ? "turn_timeout" : "turn_failed",
              message,
              turnId
            },
            lifecycle
          },
          isTimeout ? 504 : 500
        );
      }
    }

    return jsonResponse(
      {
        error: {
          code: "not_found",
          message: `No route for ${request.method} ${pathname}`
        }
      },
      404
    );
  }
};
