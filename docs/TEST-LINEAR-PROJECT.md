# Test: Linear project + markdown brain

Linear project: [Agent Bridge Memory POC](https://linear.app/national-datacare/project/agent-bridge-memory-poc-556fcc17f4cc)  
Label: `agent-approved` (Engineering Enablement)

## Checklist

### A. Demo GitHub repo (target)

- [ ] Create `hello-agent-demo` (or similar) with 1–2 intentional bugs
- [ ] Clone it next to this bridge
- [ ] Set in `agent-bridge.yaml`:

  ```yaml
  project:
    repo: "https://github.com/<you>/hello-agent-demo"
    defaultBranch: main
    localPath: "../hello-agent-demo"
    memoryDir: memory
  ```

- [ ] Run `npm run lab -- init-memory`
- [ ] Commit + push `memory/` on the demo repo

### B. Env

- [ ] `.env` with `CURSOR_API_KEY` and `LINEAR_API_KEY`

### C. Linear

- [ ] Create 1–2 small issues in **Agent Bridge Memory POC**
- [ ] Clear acceptance criteria in the description
- [ ] Add label **`agent-approved`** only when you want the agent to run

### D. Run

```bash
npm run lab -- take ENG-XX
npm run lab -- status ENG-XX
```

### E. What success looks like

- [ ] Linear comments: started → PR → finished
- [ ] GitHub PR opened (no merge)
- [ ] PR includes or follows with updates under `memory/issues/ENG-XX.md`
- [ ] Second `lab take` while active is refused
- [ ] Next issue’s agent can read prior `memory/` notes

## Notes

- SQLite ledger = bookkeeping only  
- **Markdown `memory/` = the project brain**  
- Do not load hundreds of issue files into one prompt — selective read only  
