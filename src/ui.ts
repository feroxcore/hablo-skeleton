const MOCK_INPUT = {
  sessionId: "sess-003",
  turnId: "turn-003",
  userId: "user-789",
  input: {
    text: "2 PM"
  },
  context: {
    previousIntent: "book_appointment",
    date: "tomorrow",
    step: "ask_time"
  }
};

const MOCK_INPUT_PRETTY = JSON.stringify(MOCK_INPUT, null, 2);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderUiHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Skeleton AI API Tester</title>
    <style>
      :root {
        --bg: #f3eee6;
        --ink: #1f2c3a;
        --muted: #4f6577;
        --panel: #fffaf2;
        --panel-2: #f7e9d8;
        --accent: #0d7488;
        --accent-2: #cc6a2f;
        --ok: #0b7a49;
        --err: #a52828;
        --border: #d5c2ac;
        --shadow: 0 12px 28px rgba(42, 42, 52, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Space Grotesk", "Segoe UI Variable", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 8% 8%, #f7c9a8 0%, transparent 35%),
          radial-gradient(circle at 86% 12%, #b8d8dc 0%, transparent 38%),
          linear-gradient(160deg, #f4efe8 0%, #e9dfd3 50%, #f7f2ec 100%);
      }

      .shell {
        width: min(1100px, 92vw);
        margin: 2.2rem auto;
      }

      .header {
        margin-bottom: 1rem;
      }

      .kicker {
        display: inline-block;
        font-size: 0.8rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--accent);
      }

      h1 {
        margin: 0.3rem 0 0.5rem;
        font-size: clamp(1.5rem, 2.5vw, 2.3rem);
        line-height: 1.12;
      }

      .subtitle {
        margin: 0;
        color: var(--muted);
      }

      .layout {
        display: grid;
        grid-template-columns: 1.1fr 1fr;
        gap: 1rem;
        margin-top: 1.2rem;
      }

      .panel {
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--panel);
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      .panel h2 {
        margin: 0;
        padding: 0.9rem 1rem;
        font-size: 1rem;
        border-bottom: 1px solid var(--border);
        background: var(--panel-2);
      }

      .body {
        padding: 1rem;
      }

      textarea {
        width: 100%;
        min-height: 320px;
        resize: vertical;
        border: 1px solid #c7b39d;
        border-radius: 12px;
        background: #fff;
        padding: 0.8rem;
        font-family: "JetBrains Mono", "Fira Code", monospace;
        font-size: 0.85rem;
        line-height: 1.5;
        color: #1a2735;
      }

      .actions {
        display: flex;
        gap: 0.6rem;
        margin-top: 0.8rem;
        flex-wrap: wrap;
      }

      button {
        border: none;
        border-radius: 999px;
        padding: 0.56rem 1rem;
        cursor: pointer;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .primary {
        background: var(--accent);
        color: #fff;
      }

      .secondary {
        background: #ead7c2;
        color: #203344;
      }

      .status {
        margin-top: 0.8rem;
        font-size: 0.92rem;
      }

      .status.ok {
        color: var(--ok);
      }

      .status.err {
        color: var(--err);
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.6rem;
        margin-bottom: 0.8rem;
      }

      .metric {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0.6rem;
      }

      .metric .label {
        font-size: 0.73rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #5c7182;
      }

      .metric .value {
        margin-top: 0.25rem;
        font-weight: 700;
        word-break: break-word;
      }

      pre {
        margin: 0;
        max-height: 420px;
        overflow: auto;
        padding: 0.8rem;
        border: 1px solid #cab9a7;
        border-radius: 12px;
        background: #fff;
        font-family: "JetBrains Mono", "Fira Code", monospace;
        font-size: 0.79rem;
        line-height: 1.45;
      }

      .hint {
        font-size: 0.85rem;
        color: #5c7182;
      }

      @media (max-width: 900px) {
        .layout {
          grid-template-columns: 1fr;
        }

        textarea {
          min-height: 280px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="header">
        <span class="kicker">Skeleton AI API</span>
        <h1>Turn API Tester UI</h1>
        <p class="subtitle">Submit input JSON, call <code>POST /v1/turn</code>, and inspect output/lifecycle in one screen.</p>
      </header>

      <section class="layout">
        <article class="panel">
          <h2>Input JSON</h2>
          <div class="body">
            <textarea id="requestBody">${escapeHtml(MOCK_INPUT_PRETTY)}</textarea>
            <div class="actions">
              <button class="primary" id="runBtn">Run Turn</button>
              <button class="secondary" id="mockBtn">Load Mock</button>
              <button class="secondary" id="formatBtn">Format JSON</button>
            </div>
            <div id="statusLine" class="status"></div>
            <p class="hint">Tip: keep <code>sessionId</code> stable to query session history later.</p>
          </div>
        </article>

        <article class="panel">
          <h2>Output</h2>
          <div class="body">
            <div class="metric-grid">
              <div class="metric">
                <div class="label">Turn ID</div>
                <div class="value" id="turnIdValue">-</div>
              </div>
              <div class="metric">
                <div class="label">Intent</div>
                <div class="value" id="intentValue">-</div>
              </div>
              <div class="metric">
                <div class="label">Confidence</div>
                <div class="value" id="confidenceValue">-</div>
              </div>
            </div>
            <pre id="responseJson">{ "output": "Run a turn to see response" }</pre>
          </div>
        </article>
      </section>
    </main>

    <script>
      const mockInput = ${JSON.stringify(MOCK_INPUT)};
      const requestBody = document.getElementById("requestBody");
      const runBtn = document.getElementById("runBtn");
      const mockBtn = document.getElementById("mockBtn");
      const formatBtn = document.getElementById("formatBtn");
      const statusLine = document.getElementById("statusLine");
      const responseJson = document.getElementById("responseJson");
      const turnIdValue = document.getElementById("turnIdValue");
      const intentValue = document.getElementById("intentValue");
      const confidenceValue = document.getElementById("confidenceValue");

      function setStatus(message, isError = false) {
        statusLine.textContent = message;
        statusLine.className = isError ? "status err" : "status ok";
      }

      function formatEditorJson() {
        try {
          const parsed = JSON.parse(requestBody.value);
          requestBody.value = JSON.stringify(parsed, null, 2);
          setStatus("Input formatted.");
        } catch (error) {
          setStatus("Input JSON is invalid: " + error.message, true);
        }
      }

      mockBtn.addEventListener("click", () => {
        requestBody.value = JSON.stringify(mockInput, null, 2);
        setStatus("Loaded mock data.");
      });

      formatBtn.addEventListener("click", formatEditorJson);

      runBtn.addEventListener("click", async () => {
        let payload;
        let timeoutHandle = null;
        try {
          payload = JSON.parse(requestBody.value);
        } catch (error) {
          setStatus("Input JSON is invalid: " + error.message, true);
          return;
        }

        runBtn.disabled = true;
        runBtn.textContent = "Running...";
        setStatus("Sending request...");

        try {
          const controller = new AbortController();
          timeoutHandle = setTimeout(() => {
            controller.abort();
          }, 30000);

          const response = await fetch("/v1/turn", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          const text = await response.text();
          let data = null;
          try {
            data = JSON.parse(text);
          } catch {
            data = { raw: text };
          }

          responseJson.textContent = JSON.stringify(data, null, 2);

          if (response.ok) {
            turnIdValue.textContent = data.turnId ?? "-";
            intentValue.textContent = data.intent?.name ?? "-";
            confidenceValue.textContent =
              typeof data.intent?.confidence === "number"
                ? data.intent.confidence.toFixed(2)
                : "-";
            setStatus("Success: received output data.");
          } else {
            turnIdValue.textContent = data?.error?.turnId ?? "-";
            intentValue.textContent = "-";
            confidenceValue.textContent = "-";
            const message = data?.error?.message ?? "Request failed";
            setStatus("Error: " + message, true);
          }
        } catch (error) {
          if (error && error.name === "AbortError") {
            setStatus(
              "Request timed out after 30s. Check OPENROUTER_API_KEY and network access.",
              true
            );
          } else {
            setStatus("Network error: " + error.message, true);
          }
        } finally {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          runBtn.disabled = false;
          runBtn.textContent = "Run Turn";
        }
      });
    </script>
  </body>
</html>`;
}
