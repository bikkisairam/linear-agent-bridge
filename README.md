# linear-agent-bridge

Personal POC: **approved Linear issue → Cursor cloud agent → PR**, plus a **markdown project brain** (`memory/`) so the next agent isn’t amnesiac.

Linear project: [Agent Bridge Memory POC](https://linear.app/national-datacare/project/agent-bridge-memory-poc-556fcc17f4cc) · Issue [ENG-123](https://linear.app/national-datacare/issue/ENG-123/build-linear-agent-bridge-mvp-cli-lab-takestatuswatch)

**GitHub (personal, not NDC org):**
- Bridge: https://github.com/bikkisairam/linear-agent-bridge
- Demo target: https://github.com/bikkisairam/hello-agent-demo
- PR: https://github.com/bikkisairam/linear-agent-bridge/pull/1

> Official Linear ↔ Cursor (`@Cursor`) already does issue → agent → PR.  
> **This bridge adds:** approval gate, your prompts/skills, SQLite run ledger, and **markdown memory** in the target repo.

## Test flow (markdown brain)

```text
Linear project issues
  → add label agent-approved
  → lab take ENG-XX
  → Cursor cloud agent opens PR
  → agent reads/writes memory/*.md
  → lab status shows ledger + brain paths
```

## Setup

1. `npm install`
2. Copy `.env.example` → `.env` (`CURSOR_API_KEY`, `LINEAR_API_KEY`)
3. Create/clone a tiny demo GitHub repo (target for the agent)
4. Point `agent-bridge.yaml` → that repo URL; set `project.localPath` to the local checkout
5. Scaffold brain:

   ```bash
   npm run lab -- init-memory
   ```

6. Commit `memory/` in the **demo** repo and push
7. Create issues in Linear project **Agent Bridge Memory POC**
8. Add label `agent-approved` when ready
9. Run:

   ```bash
   npm run lab -- take ENG-XX
   npm run lab -- status ENG-XX
   ```

## Commands

| Command | Purpose |
|---|---|
| `lab init-memory` | Create `memory/` markdown brain in target checkout |
| `lab take <ISSUE>` | Start cloud agent (requires `agent-approved`) |
| `lab status <ISSUE>` | Ledger + brain file paths |
| `lab watch <ISSUE>` | Follow an in-flight run |

## Memory model

| Layer | Store | Role |
|---|---|---|
| **Project brain** | `memory/**/*.md` in target repo | History agents should learn from |
| **Run ledger** | SQLite `data/run-ledger.db` | Issue ↔ agent ↔ PR; block double-take |

At scale we still only load **INDEX + this issue + 1–2 patterns** — never the whole tree.

## Guardrails

- Pass Cursor `apiKey` explicitly from env  
- Never merge PRs  
- Never commit `.env`  
- Only `agent-approved` issues  
- Human reviews and merges  

See `docs/DEMO.md` and `docs/TEST-LINEAR-PROJECT.md`.
