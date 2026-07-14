# linear-agent-bridge

Personal POC CLI: **approved Linear issue → Cursor cloud agent → PR**, with a SQLite run ledger and hooks for a **project brain** (`memory/` markdown in the target repo).

Tied to [ENG-123](https://linear.app/national-datacare/issue/ENG-123/build-linear-agent-bridge-mvp-cli-lab-takestatuswatch).

## What it does

```text
lab take ENG-XX
  → require label agent-approved
  → refuse if a run is already active
  → start Cursor cloud agent (your CURSOR_API_KEY)
  → comment on Linear (started / PR / done)
  → store issue ↔ run ↔ PR in SQLite
  → prompt agent to read/write memory/ (project brain)
```

## Setup (under 10 steps)

1. Clone this repo and `cd` into it.
2. `npm install`
3. Copy `.env.example` → `.env` and set:
   - `CURSOR_API_KEY` — [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations)
   - `LINEAR_API_KEY` — Linear personal API key
4. Edit `agent-bridge.yaml`:
   - `project.repo` → your demo GitHub repo URL
   - `project.defaultBranch` (usually `main`)
5. (Optional) Set `project.localPath` to a local checkout of that repo so bootstrap can inject `memory/` excerpts.
6. Create Linear label `agent-approved`.
7. Create a small demo issue; add the label only when ready.
8. Run: `npm run lab -- take ENG-XX`
9. Check Linear comments + GitHub PR.
10. Run: `npm run lab -- status ENG-XX`

## Commands

| Command | Purpose |
|---|---|
| `lab take <ISSUE>` | Start cloud agent for an approved issue |
| `lab status <ISSUE>` | Show ledger: runs + PR |
| `lab watch <ISSUE>` | Resume/poll an in-flight run; post milestones to Linear |

Via npm scripts:

```bash
npm run lab -- take ENG-12
npm run lab -- status ENG-12
npm run lab -- watch ENG-12
```

After `npm run build`, you can also `npx lab take ENG-12`.

## Memory model

| Layer | Where | Role |
|---|---|---|
| **Run ledger** | `data/run-ledger.db` (SQLite) | Orchestration IDs + active-run guard |
| **Project brain** | `memory/` in the **target** repo | Shared case history — becomes the project's brain over time |

See `LINEAR-AGENT-BRIDGE-STARTER.md` §7 and [ENG-122](https://linear.app/national-datacare/issue/ENG-122/define-project-brain-memory-for-linear-agent-bridge-poc).

## Guardrails

- Cursor `apiKey` is always passed explicitly from env
- Never merges PRs
- Never commits `.env`
- Only labeled issues
- Human reviews and merges

## Docs

- [`docs/DEMO.md`](docs/DEMO.md) — 5-minute manager demo script
- [`LINEAR-AGENT-BRIDGE-STARTER.md`](LINEAR-AGENT-BRIDGE-STARTER.md) — full plan

## Companion demo repo

Create `hello-agent-demo` with 2–3 intentional bugs and a starter `memory/INDEX.md`. Point `agent-bridge.yaml` at it.
