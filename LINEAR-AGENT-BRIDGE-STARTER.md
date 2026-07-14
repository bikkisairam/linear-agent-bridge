# Linear Agent Bridge — Personal POC Starter

**Purpose:** Build and demo this as a **separate personal project** before using it on Chat-Bot or any NDC work repo.  
**Audience:** You (builder) + manager (demo)  
**Status:** Ready to start in a new repo  
**Related:** [ENG-122](https://linear.app/national-datacare/issue/ENG-122/define-project-brain-memory-for-linear-agent-bridge-poc) (project-brain memory), `PROJECT-MEMORY-AGENT-PROPOSAL.md` (manager-facing proposal).

---

## 1. Intent

Prove one loop end-to-end on a throwaway project:

> Linear issue approved → `lab take ENG-XX` → Cursor agent works → PR opens → progress on Linear → memory stores the links

**North star:** over many runs, that memory becomes the **project brain** — a shared case history every future agent reads before acting (same idea as an email agent that remembers prior collaboration before replying again).

Do **not** change Chat-Bot until this demo works and leadership is interested.

---

## 2. Create these two repos

| Repo | Role |
|---|---|
| `linear-agent-bridge` | The CLI / orchestrator you are building |
| `hello-agent-demo` | Tiny target app the agent will fix (intentional bugs) |

Keep both personal/public or private under your account. Do not put NDC secrets or Chat-Bot code in them.

---

## 3. MVP scope (demo only)

### In scope

1. CLI commands: `lab take`, `lab status`, `lab watch`
2. Linear: read issue, check `agent-approved` label, post comments
3. Cursor SDK: cloud agent with **your** `CURSOR_API_KEY`
4. SQLite **run ledger**: issue ↔ agent run ↔ PR (orchestration only)
5. Config file: `agent-bridge.yaml`
6. One demo skill (optional but nice)

### Soon after first demo (project brain)

7. Markdown **case memory** in the *target* repo (`memory/`) — session notes the next agent reads first

### Out of scope for first demo

- Multi-user key storage
- Neo4j / embeddings / “full knowledge graph” product
- Webhooks / auto-trigger on label
- Packaging for many teams
- Chat-Bot or NDC-MCP integration
- Auto-merge

---

## 4. Suggested folder layout

```text
linear-agent-bridge/
  README.md
  package.json
  tsconfig.json
  .env.example
  agent-bridge.yaml
  docs/
    DEMO.md
  skills/
    small-fix.md
  src/
    cli.ts
    linear.ts
    cursor.ts
    memory.ts
    prompt.ts
    config.ts
  data/
    .gitkeep          # sqlite file lives here locally, gitignored
```

---

## 5. Environment variables

Create `.env` locally (never commit):

```bash
CURSOR_API_KEY=cursor_...
LINEAR_API_KEY=lin_api_...
```

`.env.example`:

```bash
CURSOR_API_KEY=
LINEAR_API_KEY=
```

---

## 6. Example `agent-bridge.yaml`

```yaml
project:
  name: "Hello Agent Demo"
  repo: "https://github.com/<your-user>/hello-agent-demo"
  defaultBranch: main

linear:
  triggerLabel: "agent-approved"

cursor:
  runtime: cloud
  model: composer-2.5
  autoCreatePR: true

skills:
  - path: skills/small-fix.md

prompt:
  bootstrap: |
    You are fixing a small approved Linear issue in this repo.
    Read the issue carefully. Make a minimal change.
    Open a PR. Do not merge. Do not commit secrets.
    Prefer small, reviewable diffs.
```

---

## 7. Two layers of memory

Do not confuse these. Only the run ledger is required for the first 5-minute demo.

| Layer | Where | Job |
|---|---|---|
| **Run ledger** | SQLite in `linear-agent-bridge` | IDs + status: issue ↔ agent ↔ PR; block duplicate active runs |
| **Project brain** | Markdown under `memory/` in the *target* repo (GitHub) | What happened, why, errors, decisions, open loops — grows over time |

### 7a. Run ledger schema (SQLite)

```sql
CREATE TABLE issues (
  identifier TEXT PRIMARY KEY,
  title TEXT,
  url TEXT,
  updated_at TEXT
);

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  issue_identifier TEXT,
  cursor_agent_id TEXT,
  cursor_run_id TEXT,
  status TEXT,
  started_at TEXT,
  finished_at TEXT,
  error TEXT
);

CREATE TABLE pull_requests (
  id TEXT PRIMARY KEY,
  issue_identifier TEXT,
  url TEXT,
  number INTEGER,
  state TEXT,
  created_at TEXT
);
```

Rules:

- One **active** agent run per issue
- If a run is already in progress, `lab take` should refuse and point to `lab status`

### 7b. Project brain (case memory in Git)

Same idea as an email collab agent: record each turn so the next reply has full context.

Lives in the **target** repo (e.g. `hello-agent-demo`), versioned with the code:

```text
memory/
  INDEX.md                 # short map: themes, hot spots, open risks
  issues/
    ENG-12.md              # rolling case file for that Linear issue
  sessions/
    2026-07-14-eng-12.md   # one session: what the agent did this run
  patterns/
    null-check-bug.md      # reusable “we’ve seen this before”
```

Each case/session note is short and structured:

- Goal (Linear id + one line)
- Timeline / what changed (paths, not full diffs)
- Errors hit and how they were fixed
- Commitments / decisions
- Open loops
- Pointers (PR URL, agent run id)

**How agents use it**

1. `lab take` → bootstrap prompt includes `memory/INDEX.md` + matching issue/pattern pages (cap: not the whole folder)
2. Agent works
3. After success/fail → append/update a session note + issue case file (ideally in the same PR or a follow-up memory commit)

**How it becomes the brain**

- Run 1: nearly empty — agent learns from the issue alone, then writes the first note
- Run N: agents share one evolving story of the project (multi-agent safe because they read/write the same case files)
- Code + git remain ground truth; the brain is a guide, not a second source of absolute truth

Skip Neo4j until case notes prove agents actually get smarter. Links in markdown *are* the graph.

---

## 8. CLI behavior

### `lab take <ISSUE_ID>`

1. Load config + env keys
2. Fetch Linear issue
3. Require label `agent-approved` (or configured label)
4. Check run ledger for an active run → stop if found
5. Build bootstrap prompt (issue + run ledger + project-brain excerpts + skills)
6. Start Cursor cloud agent (`apiKey` passed explicitly)
7. Save run to SQLite
8. Comment on Linear: agent started (+ agent/run ids)
9. Wait / watch until PR exists or failure
10. Comment on Linear: PR URL or failure
11. Save PR row in run ledger
12. (Project brain) prompt agent to update `memory/` case/session notes when ready

### `lab status <ISSUE_ID>`

Print issue, latest run, linked PR, and Linear URL.

### `lab watch <ISSUE_ID>`

Poll run status and print updates; post major milestones to Linear if not already posted.

---

## 9. Guardrails (non-negotiable)

- Pass `CURSOR_API_KEY` explicitly into the SDK (no silent ambient key in shared code)
- Never merge PRs
- Never commit `.env` or API keys
- Only approved labeled issues
- Small focused changes only
- Human reviews and merges

---

## 10. Bootstrap prompt for Cursor (paste into a new chat in `linear-agent-bridge`)

Copy everything below into Agent mode in the new empty repo:

```text
You are helping me build a standalone personal project called `linear-agent-bridge`.

## Product goal
A reusable CLI that:
1. Reads an approved Linear issue
2. Starts a Cursor cloud agent using MY Cursor API key
3. Opens a PR in a configured GitHub repo
4. Posts progress comments back to Linear
5. Stores a lightweight run ledger of issue ↔ agent run ↔ PR in SQLite
6. (After MVP loop works) Grows a project brain: markdown case memory in the target repo that later agents read first

This is a personal MVP demo for my manager. Keep it small, reliable, and demoable in 5 minutes.
Ship the take→PR→Linear loop first; add project-brain markdown second.

## Hard constraints
- Separate from any work project. Do not assume Chat-Bot or NDC code.
- Always pass Cursor apiKey explicitly (from env CURSOR_API_KEY).
- Always pass Linear API key from env LINEAR_API_KEY.
- Never commit secrets.
- Agent opens PRs only. Never merge.
- Only pick up issues that have label `agent-approved` (or config equivalent).
- One active agent run per issue (check memory first).
- Prefer TypeScript + Node.
- Use `@cursor/sdk` for Cursor agents.
- Use Linear GraphQL API (or official Linear SDK) for issues/comments.
- Use better-sqlite3 or similar for local memory.
- Cloud runtime for Cursor agents with autoCreatePR: true.

## MVP commands
- `lab take <ISSUE_ID>` — start agent for approved issue
- `lab status <ISSUE_ID>` — show memory + latest Linear/PR state
- `lab watch <ISSUE_ID>` — poll/print run progress and post key updates to Linear

## Config file: agent-bridge.yaml
Support:
- project name
- github repo URL + default branch
- linear team / project (optional)
- trigger label (default: agent-approved)
- model id
- bootstrap prompt text
- optional skill file paths

## Bootstrap prompt the agent should receive
Include:
- Linear issue title, description, acceptance criteria, URL
- Related memory (prior runs/PRs if any)
- Rules: branch from default branch, open PR, do not merge, no secrets, small focused change
- Any skills content inlined from skills/*.md

## Linear comments to post
1. Agent started (include Cursor agent id / run id)
2. PR opened (include URL)
3. Run finished / failed

## Run ledger (SQLite) + project brain (later)
Tables for orchestration:
- issues(identifier, title, url, updated_at)
- agent_runs(id, issue_identifier, cursor_agent_id, cursor_run_id, status, started_at, finished_at, error)
- pull_requests(id, issue_identifier, url, number, state, created_at)

Project brain (after loop works): `memory/` markdown in the target repo — INDEX, issues/, sessions/, patterns/. Read before work; write after work.

## Implementation plan (do in order)
1. Scaffold package.json, tsconfig, README, .env.example, agent-bridge.yaml example
2. Implement Linear client: get issue by identifier, add comment, list labels
3. Implement memory sqlite module
4. Implement Cursor SDK wrapper (cloud agent + wait + error handling)
5. Implement prompt builder
6. Implement CLI commands take/status/watch
7. Add docs/DEMO.md with exact demo script
8. Add instructions for a tiny companion demo target repo (hello-agent-demo) with 2–3 intentional issues

## Definition of done for MVP
- I can create a Linear issue, add label agent-approved
- Run: `lab take ENG-XX` (or whatever team key I use)
- See Linear comments for start + PR
- See rows in sqlite memory
- `lab status ENG-XX` shows linked PR and run status
- README explains setup in under 10 steps

Start by scaffolding the repo structure and README, then implement Linear + memory first, then Cursor take-over.
```

---

## 11. Setup checklist

- [ ] Create GitHub repo `linear-agent-bridge`
- [ ] Create GitHub repo `hello-agent-demo` with 2–3 easy intentional bugs
- [ ] Create Linear label `agent-approved`
- [ ] Create 2–3 Linear issues against the demo work (or personal Linear team)
- [ ] Get `CURSOR_API_KEY` (Cursor Dashboard → Integrations)
- [ ] Get `LINEAR_API_KEY`
- [ ] Clone `linear-agent-bridge`, open in Cursor
- [ ] Paste Section 10 prompt and build MVP
- [ ] Point `agent-bridge.yaml` at `hello-agent-demo`
- [ ] Run one successful `lab take` end-to-end
- [ ] Practice the 5-minute demo once before showing your manager

---

## 12. Target demo repo ideas (`hello-agent-demo`)

Keep it tiny. Examples:

1. README typo / wrong project name
2. Function returns wrong value in a unit test
3. Missing null check that causes a clear bug

Create matching Linear issues with clear acceptance criteria, then add `agent-approved` only when you are ready to demo.

---

## 13. Five-minute manager demo script

1. Show Linear issue in backlog (not approved yet)
2. Add label `agent-approved`
3. Run `lab take <ISSUE_ID>`
4. Show Linear comment: agent started
5. Show GitHub PR opened on `hello-agent-demo`
6. Run `lab status <ISSUE_ID>` and show run-ledger links
7. (Optional stretch) Open `memory/` in the demo repo and show the case note the next agent would read
8. Closing line:

> This is a personal proof of concept. Same package can point at any repo via config. Each person uses their own Cursor API key. Over time the repo gets a project brain — shared memory of what agents already did — so the next run isn’t starting from zero. If this looks useful, Chat-Bot can be the first real pilot — without changing Chat-Bot until we decide to.

---

## 14. What success looks like

You can demo without excuses when:

1. One approved Linear issue becomes a real PR via `lab take`
2. Linear has a visible trail (started → PR → done/failed)
3. SQLite run ledger shows issue ↔ run ↔ PR
4. A second `lab take` on the same active issue is blocked
5. You can explain reuse: config + personal API key, no Chat-Bot dependency
6. (Next milestone) A second issue’s agent reads prior `memory/` notes and avoids repeating a known mistake

---

## 15. After a successful demo

Only then discuss with your manager:

1. Whether to pilot on Chat-Bot
2. Who approves tickets (Agent Ready)
3. Whether to invest in webhooks / shared packaging
4. Whether project-brain case memory is worth deepening (still markdown first — not Neo4j)

Until then, keep all implementation in this personal project.

---

## 16. One-line reminder

**Personal POC first. Chat-Bot later. Human approves. Agent opens PR. Run ledger tracks. Project brain remembers.**
