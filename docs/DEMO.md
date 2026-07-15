# Five-minute demo

## Prepare once

1. Repo `hello-agent-demo` exists with a tiny intentional bug.
2. `memory/INDEX.md` exists in that repo (can be almost empty).
3. Linear label `agent-approved` exists.
4. Linear issue written with clear acceptance criteria (no label yet).
5. `.env` has `CURSOR_API_KEY` + `LINEAR_API_KEY`.
6. `agent-bridge.yaml` points at the demo repo.

## Live script

1. Show Linear issue in backlog (**not** approved yet).
2. Add label `agent-approved`.
3. Run:

   ```bash
   npm run lab -- take ENG-XX
   ```

4. Show Linear comment: agent started (agent id + run id).
5. Show GitHub PR opening on `hello-agent-demo`.
6. Run:

   ```bash
   npm run lab -- status ENG-XX
   ```

   Point at SQLite run ledger links (issue ↔ run ↔ PR).
7. (Stretch) Open `memory/` in the PR / demo repo — “this becomes the project brain.”
8. Closing line:

   > Personal proof of concept. Config + personal Cursor key. Over time `memory/` is the shared brain so the next agent isn’t starting from zero. Chat-Bot can be the first real pilot — we don’t change Chat-Bot until we decide to.

## Failure drills worth knowing

- Missing label → `lab take` refuses with a clear message.
- Second `lab take` while status is active → refuses; points to `lab status`.
- Bad API key → Cursor/Linear error surfaced; run marked failed in ledger.
