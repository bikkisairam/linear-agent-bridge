# Trigger agent from Linear comments (`@lab` / `@cursor`)

Same idea as Linear's native `@Cursor`, but routed through **this bridge**
(so you keep the approval label, SQLite ledger, and markdown project brain).

## Two ways to listen

| Mode | Command | Needs |
|---|---|---|
| **Poll (easiest local)** | `npm run lab -- poll` | API keys only |
| **Webhook** | `npm run lab -- serve` + public URL | Keys + webhook secret + ngrok/admin |

Both still require label **`agent-approved`**, then a comment containing **`@lab`** or **`@cursor`**.

```text
Human adds agent-approved
Human comments: @lab please fix this
lab poll/serve sees it
→ same as lab take (agent + PR + memory)
```

## Quick start (poll — recommended for demo)

1. Keys in `.env` (`CURSOR_API_KEY`, `LINEAR_API_KEY`)
2. Start listener:

   ```powershell
   npm run lab -- poll
   ```

3. In Linear, open an issue → add `agent-approved` → comment:

   ```text
   @lab
   ```

   or

   ```text
   @cursor go
   ```

4. Watch the terminal + Linear comments + GitHub PR.

Stop with Ctrl+C.

## Webhook mode (closer to production)

1. Run:

   ```powershell
   npm run lab -- serve
   ```

   Default: `http://127.0.0.1:8787/webhooks/linear`

2. Expose it (example):

   ```powershell
   ngrok http 8787
   ```

3. In Linear (admin): **Settings → Administration → API → Webhooks**
   - URL: `https://<ngrok>/webhooks/linear`
   - Resource: **Comment**
   - Team: Engineering Enablement (or yours)
   - Copy signing secret → `.env` as `LINEAR_WEBHOOK_SECRET=`

4. Comment `@lab` on an approved issue.

## Safety

- Missing `agent-approved` → reply explaining refuse (no agent)
- Active run already → refuse + point to `lab status`
- Bot's own status comments are ignored (no loops)

## Config (`agent-bridge.yaml`)

```yaml
linear:
  triggerLabel: "agent-approved"
  commentTriggers:
    - "@lab"
    - "@cursor"
  webhook:
    port: 8787
    path: /webhooks/linear
  pollSeconds: 15
```

## Note vs native Linear ↔ Cursor

Native `@Cursor` (assignee / Linear integration) does **not** use this CLI.
This feature is **our** comment listener that calls the same path as `lab take`.
