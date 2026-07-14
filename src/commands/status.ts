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
    console.log(`Active: ${active ? `yes (${active.id}, ${active.status})` : "no"}`);
    console.log("");
    if (!run) {
      console.log("No agent runs in ledger yet.");
    } else {
      console.log("Latest run:");
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
  } finally {
    ctx.ledger.close();
  }
}
