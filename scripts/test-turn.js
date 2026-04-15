#!/usr/bin/env node

import { readFile, access } from "node:fs/promises";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "http://127.0.0.1:8788/v1/turn";
const DEFAULT_TIMEOUT_MS = 30000;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_BUNDLE = resolve(PROJECT_ROOT, ".tmp-run", "index.external.mjs");

const defaultPayload = {
  sessionId: "sess-1001",
  turnId: "turn-0001",
  userId: "user-42",
  input: {
    text: "I want to cancel my subscription"
  },
  context: {
    source: "web",
    locale: "en-US",
    previousIntent: "manage_subscription",
    step: "confirm_cancellation"
  }
};

function formatBodyForPrint(parsed) {
  return typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
}

function printHelp() {
  console.log(`Usage:
  node scripts/test-turn.js [--file <json-file>] [--url <endpoint>] [--timeout <ms>] [--local] [--no-fallback-local]

Examples:
  node scripts/test-turn.js
  node scripts/test-turn.js --file ./test-data.json
  node scripts/test-turn.js --url http://127.0.0.1:8790/v1/turn
  node scripts/test-turn.js --file ./test-data.json --local
  node scripts/test-turn.js --file ./test-data.json --no-fallback-local
`);
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    file: undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    fallbackLocal: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--file") {
      options.file = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--url") {
      options.url = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--timeout") {
      options.timeoutMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === "--local") {
      options.local = true;
      continue;
    }

    if (arg === "--no-fallback-local") {
      options.fallbackLocal = false;
    }
  }

  return options;
}

async function loadPayload(filePath) {
  if (!filePath) {
    return defaultPayload;
  }

  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function normalizePayloads(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return [payload];
}

async function loadDevVars() {
  const devVarsPath = resolve(PROJECT_ROOT, ".dev.vars");
  const raw = await readFile(devVarsPath, "utf8");

  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

async function loadLocalWorker() {
  try {
    await build({
      entryPoints: [resolve(PROJECT_ROOT, "src", "index.ts")],
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      outfile: LOCAL_BUNDLE,
      logLevel: "silent"
    });
  } catch {
    await access(LOCAL_BUNDLE);
  }

  const mod = await import(`${pathToFileURL(LOCAL_BUNDLE).href}?t=${Date.now()}`);
  return mod.default;
}

async function postOne({ url, payload, timeoutMs, localRuntime }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    if (localRuntime) {
      const request = new Request(url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      response = await localRuntime.worker.fetch(request, localRuntime.env);
    } else {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    }

    const raw = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }

    return {
      ok: response.ok,
      status: response.status,
      body: parsed
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        kind: "timeout",
        error: `Request timed out after ${timeoutMs}ms. Is the dev server running?`
      };
    }

    const cause = /** @type {{ code?: string } | undefined} */ (error?.cause);
    if (cause?.code === "ECONNREFUSED") {
      return {
        ok: false,
        kind: "connection_refused",
        error: `Connection refused at ${url}. Start the API first with: npm run dev, or run with --local`
      };
    }

    return {
      ok: false,
      kind: "request_failed",
      error: `Request failed: ${error instanceof Error ? error.message : String(error)}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    console.error("Invalid timeout value. Use a positive number of milliseconds.");
    process.exit(1);
  }

  const payload = await loadPayload(options.file);
  const payloads = normalizePayloads(payload);
  let localRuntime = options.local
    ? {
        worker: await loadLocalWorker(),
        env: await loadDevVars()
      }
    : null;

  console.log("=== Request URL ===");
  if (options.local) {
    console.log(`${options.url} (local runtime mode)`);
  } else {
    console.log(options.url);
  }

  if (payloads.length === 1) {
    console.log("\n=== Request Body ===");
    console.log(JSON.stringify(payloads[0], null, 2));
  } else {
    console.log(`\n=== Batch Mode ===\nTotal payloads: ${payloads.length}`);
    console.log("First payload preview:");
    console.log(JSON.stringify(payloads[0], null, 2));
  }

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < payloads.length; i += 1) {
    const requestPayload = payloads[i];
    const label = payloads.length === 1 ? "" : ` [${i + 1}/${payloads.length}]`;

    console.log(`\n=== Request${label} ===`);
    let result = await postOne({
      url: options.url,
      payload: requestPayload,
      timeoutMs: options.timeoutMs,
      localRuntime
    });

    if (
      !result.ok &&
      !localRuntime &&
      options.fallbackLocal &&
      (result.kind === "connection_refused" || result.kind === "timeout")
    ) {
      try {
        localRuntime = {
          worker: await loadLocalWorker(),
          env: await loadDevVars()
        };
        console.log(
          "Primary URL unavailable. Switching to local runtime fallback for this and remaining requests."
        );
        result = await postOne({
          url: options.url,
          payload: requestPayload,
          timeoutMs: options.timeoutMs,
          localRuntime
        });
      } catch (fallbackError) {
        result = {
          ok: false,
          kind: "local_fallback_failed",
          error:
            "Could not start local fallback runtime. Start API with `npm run dev` and retry. Details: " +
            (fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError))
        };
      }
    }

    if (result.ok) {
      successCount += 1;
      console.log("=== Response Status ===");
      console.log(result.status);
      console.log("=== Response Body ===");
      console.log(formatBodyForPrint(result.body));
    } else {
      failureCount += 1;
      console.log("=== Response Error ===");
      console.log(result.error);
      if (result.status) {
        console.log("Status:", result.status);
      }
      if (result.body !== undefined) {
        console.log(formatBodyForPrint(result.body));
      }

      if (
        typeof result.error === "string" &&
        result.error.includes("Connection refused") &&
        !options.fallbackLocal
      ) {
        const remaining = payloads.length - (i + 1);
        if (remaining > 0) {
          console.log(
            `Stopping early because server is not reachable. Remaining skipped: ${remaining}`
          );
          failureCount += remaining;
        }
        break;
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failureCount}`);

  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
