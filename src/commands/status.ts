import path from "node:path";
import fs from "node:fs";
import { openContext } from "./take.js";

export async function cmdStatus(
  issueId: string,
  cwd = process.cwd(),
): Promise<void> {
  const ctx = openContext(cwd);
  const identifier = issueId.toUpperCase();

  try {
    let issueTitle = "(not cached)";
    let issueUrl = "(unknown)";
    try {
      const live = await ctx.linear.getIssueByIdentifier(identifier);
      issueTitle = live.title;
      issueUrl = live.url;
      ctx.ledger.upsertIssue({
        identifier: live.identifier,
        title: live.title,
        url: live.url,
        updated_at: new Date().toISOString(),
      });
    } catch {
      const cached = ctx.ledger.getIssue(identifier);
      if (cached) {
        issueTitle = cached.title;
        issueUrl = cached.url;
      }
    }

    const run = ctx.ledger.getLatestRun(identifier);
    const pr = ctx.ledger.getLatestPullRequest(identifier);
    const active = ctx.ledger.getActiveRun(identifier);

    console.log(`Issue:  ${identifier} — ${issueTitle}`);
    console.log(`Linear: ${issueUrl}`);
    console.log(
      `Active: ${active ? `yes (${active.id}, ${active.status})` : "no"}`,
    );
    console.log("");
    if (!run) {
      console.log("No agent runs in ledger yet.");
    } else {
      console.log("Latest run (SQLite ledger):");
      console.log(`  id:         ${run.id}`);
      console.log(`  status:     ${run.status}`);
      console.log(`  agent:      ${run.cursor_agent_id ?? "n/a"}`);
      console.log(`  run:        ${run.cursor_run_id ?? "n/a"}`);
      console.log(`  started:    ${run.started_at}`);
      console.log(`  finished:   ${run.finished_at ?? "—"}`);
      if (run.error) console.log(`  error:      ${run.error}`);
    }
    console.log("");
    if (!pr) {
      console.log("No linked PRs in ledger yet.");
    } else {
      console.log("Latest PR:");
      console.log(`  url:        ${pr.url}`);
      console.log(`  number:     ${pr.number ?? "n/a"}`);
      console.log(`  state:      ${pr.state}`);
      console.log(`  created:    ${pr.created_at}`);
    }

    console.log("");
    console.log("Project brain (markdown):");
    const localPath = ctx.config.project.localPath;
    const memoryName = ctx.config.project.memoryDir ?? "memory";
    if (!localPath) {
      console.log(
        `  localPath not set — cloud agent will read ${memoryName}/ inside the GitHub repo.`,
      );
      console.log(
        "  Tip: set project.localPath in agent-bridge.yaml, then run: lab init-memory",
      );
    } else {
      const issueBrain = path.join(
        path.resolve(localPath),
        memoryName,
        "issues",
        `${identifier}.md`,
      );
      const indexBrain = path.join(
        path.resolve(localPath),
        memoryName,
        "INDEX.md",
      );
      console.log(
        `  INDEX:  ${fs.existsSync(indexBrain) ? indexBrain : "(missing — run lab init-memory)"}`,
      );
      console.log(
        `  issue:  ${fs.existsSync(issueBrain) ? issueBrain : `(none yet for ${identifier})`}`,
      );
    }
  } finally {
    ctx.ledger.close();
  }
}
