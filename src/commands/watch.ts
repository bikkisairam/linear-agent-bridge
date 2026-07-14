import { openContext } from "./take.js";
import { parsePrNumber, watchCloudAgent } from "../cursor.js";

export async function cmdWatch(
  issueId: string,
  cwd = process.cwd(),
): Promise<void> {
  const ctx = openContext(cwd);
  const identifier = issueId.toUpperCase();

  try {
    const run = ctx.ledger.getLatestRun(identifier);
    if (!run?.cursor_agent_id) {
      console.error(`No Cursor agent id in ledger for ${identifier}.`);
      console.error(`Run lab take ${identifier} first.`);
      process.exitCode = 1;
      return;
    }

    const issue = await ctx.linear.getIssueByIdentifier(identifier);

    console.log(`Watching ${identifier}`);
    console.log(`  agent: ${run.cursor_agent_id}`);
    console.log(`  run:   ${run.cursor_run_id ?? "n/a"}`);

    if (run.status === "succeeded" || run.status === "failed") {
      console.log(`Run already finished with status=${run.status}`);
      const pr = ctx.ledger.getLatestPullRequest(identifier);
      if (pr) console.log(`PR: ${pr.url}`);
      return;
    }

    ctx.ledger.updateRun(run.id, { status: "running" });

    const finish = await watchCloudAgent({
      apiKey: ctx.env.cursorApiKey,
      agentId: run.cursor_agent_id,
      runId: run.cursor_run_id ?? undefined,
      onStatus: (line) => console.log(`  · ${line}`),
    });

    if (finish.prUrl) {
      const existing = ctx.ledger.getLatestPullRequest(identifier);
      if (!existing || existing.url !== finish.prUrl) {
        ctx.ledger.linkPullRequest({
          issueIdentifier: identifier,
          url: finish.prUrl,
          number: parsePrNumber(finish.prUrl),
          state: "open",
        });
        await ctx.linear.comment(
          issue.id,
          `🔗 **PR opened** (via \`lab watch\`)\n- ${finish.prUrl}`,
        );
      }
    }

    if (finish.status === "error" || finish.error) {
      ctx.ledger.finishRun(run.id, "failed", finish.error ?? finish.status);
      await ctx.linear.comment(
        issue.id,
        `❌ **Agent run failed** (via \`lab watch\`)\n- ${finish.error ?? finish.status}`,
      );
      process.exitCode = 2;
      return;
    }

    if (finish.status !== "unknown") {
      ctx.ledger.finishRun(run.id, "succeeded");
      await ctx.linear.comment(
        issue.id,
        `✅ **Agent run finished** (via \`lab watch\`)\n- status: \`${finish.status}\`${finish.prUrl ? `\n- PR: ${finish.prUrl}` : ""}`,
      );
    }

    console.log(`Watch complete. status=${finish.status}`);
    if (finish.prUrl) console.log(`PR: ${finish.prUrl}`);
  } finally {
    ctx.ledger.close();
  }
}
