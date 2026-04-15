# Skeleton AI API

Cloudflare Worker + Mastra skeleton API using OpenRouter.

## Linear Ticket Review (NOVA-1)

From the ticket notes:

- Setup:
  - Mastra
  - Cloudflare Worker
  - OpenRouter
- Provide example input/output
- Include intent handling
- Include turn lifecycles

This implementation covers each point directly:

1. `Mastra`: Agents are created with `@mastra/core/agent`.
2. `Cloudflare Worker`: API entrypoint is `src/index.ts` and deploy config is `wrangler.toml`.
3. `OpenRouter`: Model traffic goes through OpenRouter using `@ai-sdk/openai` with `baseURL=https://openrouter.ai/api/v1`.
4. `Intent`: every turn runs intent classification with structured output.
5. `Turn lifecycle`: each turn emits lifecycle events (`received`, `intent_classified`, `response_generated`, `completed`, `error`).

## Endpoints

- `GET /health`
- `GET /` (UI tester)
- `GET /ui` (UI tester)
- `POST /v1/turn`
- `GET /v1/turn/:turnId`
- `GET /v1/sessions/:sessionId/turns?limit=20`

## Request Example

```json
{
  "sessionId": "sess_123",
  "userId": "user_42",
  "input": {
    "text": "Can you summarize this support ticket for my manager?"
  },
  "context": {
    "channel": "web",
    "locale": "en-US"
  }
}
```

## Response Example

```json
{
  "sessionId": "sess_123",
  "turnId": "f43ef6ef-5eea-4bf2-913e-bcdac50f43f9",
  "intent": {
    "name": "task",
    "confidence": 0.91,
    "reason": "The user asks for a specific action."
  },
  "output": {
    "text": "Sure. Share the ticket text and I will produce a short manager-ready summary.",
    "followUpQuestions": [
      "Do you want a one-paragraph or bullet-point summary?"
    ]
  },
  "usage": {
    "inputTokens": 124,
    "outputTokens": 39,
    "totalTokens": 163
  },
  "lifecycle": [
    {
      "stage": "received",
      "at": "2026-04-14T10:00:00.000Z",
      "metadata": {
        "sessionId": "sess_123",
        "turnId": "f43ef6ef-5eea-4bf2-913e-bcdac50f43f9"
      }
    },
    {
      "stage": "intent_classified",
      "at": "2026-04-14T10:00:00.200Z",
      "metadata": {
        "intent": "task",
        "confidence": 0.91
      }
    },
    {
      "stage": "response_generated",
      "at": "2026-04-14T10:00:00.600Z",
      "metadata": {
        "finishReason": "stop"
      }
    },
    {
      "stage": "completed",
      "at": "2026-04-14T10:00:00.610Z"
    }
  ]
}
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create local secrets file:

```bash
cp .dev.vars.example .dev.vars
```

3. Add your OpenRouter key to `.dev.vars`:

```env
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openai/gpt-4o-mini
```

4. Run dev server:

```bash
npm run dev
```

5. Open UI tester:

```text
http://127.0.0.1:8788/ui
```

The page includes prefilled mock input JSON and renders output data, intent, confidence, and full lifecycle response.
If the model call does not return, the API now fails fast with `504 turn_timeout` (about 25 seconds) instead of loading forever.
Use `GET /health` to confirm key loading: `openRouterApiKeyConfigured` should be `true`.

6. Test endpoint:

```bash
curl -X POST "http://127.0.0.1:8788/v1/turn" \
  -H "content-type: application/json" \
  -d "{\"sessionId\":\"sess_123\",\"input\":{\"text\":\"hello\"}}"
```

7. Fetch a single stored turn:

```bash
curl "http://127.0.0.1:8788/v1/turn/<turnId>"
```

8. Fetch recent turns for one session:

```bash
curl "http://127.0.0.1:8788/v1/sessions/sess_123/turns?limit=10"
```

9. Run test script (Node):

```bash
npm run test:turn
```

Use custom test data from a file:

```bash
node scripts/test-turn.js --file ./test-data.json
```

`test-turn.js` supports both:
- a single JSON object payload
- an array of payload objects (batch mode; sends one request per item)

If the API is not running, the script stops early with:
`Connection refused ... Start the API first with: npm run dev`
By default it will also try a local runtime fallback automatically.

## Optional KV Persistence

By default, local/dev can use in-memory storage if no KV binding is configured.
For durable storage, bind a Cloudflare KV namespace as `TURN_STATE`.

Create namespace:

```bash
npx wrangler kv namespace create TURN_STATE
```

Then add the generated IDs to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "TURN_STATE"
id = "your_production_namespace_id"
preview_id = "your_preview_namespace_id"
```

## Deploy

```bash
npm run deploy
```

## Troubleshooting

If `npm run dev` starts but requests keep loading:

1. Verify you are calling this project's port (`http://127.0.0.1:8788/health` by default).
2. Check `OPENROUTER_API_KEY` in `.dev.vars`.
   Also verify `GET /health` reports `openRouterApiKeyConfigured: true`.
3. Try a clean port:

```bash
npx wrangler dev --ip 127.0.0.1 --port 8790
```

4. If you get `turn_timeout`, network/API key/model provider access failed for the upstream model call.
