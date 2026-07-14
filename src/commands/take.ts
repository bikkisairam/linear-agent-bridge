import path from "node:path";
import {
  loadConfig,
  loadEnv,
  type AgentBridgeConfig,
  type EnvKeys,
} from "../config.js";
import { LinearBridge } from "../linear.js";
import { RunLedger, defaultDbPath } from "../memory.js";
import { buildBootstrapPrompt } from "../prompt.js";
import { parsePrNumber, runCloudAgent } from "../cursor.js";

export type CliContext = {
  cwd: string;
  config: AgentBridgeConfig;
  env: EnvKeys;
  ledger: RunLedger;
  linear: LinearBridge;
};

export function openContext(cwd = process.cwd()): CliContext {
  const config = loadConfig(cwd);
  const env = loadEnv(cwd);
  const ledger = new RunLedger(defaultDbPath(cwd));
  const linear = new LinearBridge(env.linearApiKey);
  return { cwd, config, env, ledger, linear };
}

export async function cmdTake(issueId: string, cwd = process.cwd()): Promise<void> {
  const ctx = openContext(cwd);
  const identifier = issueId.toUpperCase();

  try {
    const issue = await ctx.linear.getIssueByIdentifier(identifier);
    ctx.linear.assertApproved(issue, ctx.config.linear.triggerLabel);

    const active = ctx.ledger.getActiveRun(issue.identifier);
    if (active) {
      console.error(
        `Refusing: active run already in progress for ${issue.identifier}.`,
      );
      console.error(`  run id: ${active.id}`);
      console.error(`  status: ${active.status}`);
      console.error(`  agent:  ${active.cursor_agent_id ?? "n/a"}`);
      console.error(`Run: lab status ${issue.identifier}`);
      process.exitCode = 1;
      return;
    }

    ctx.ledger.upsertIssue({
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      updated_at: new Date().toISOString(),
    });

    const latest = ctx.ledger.getLatestRun(issue.identifier);
    const priorRuns = latest ? [latest] : [];
    const priorPr = ctx.ledger.getLatestPullRequest(issue.identifier);

    const prompt = buildBootstrapPrompt({
      config: ctx.config,
      issue,
      priorRuns,
      priorPr,
      cwd: ctx.cwd,
    });

    const runRow = ctx.ledger.startRun({
      issueIdentifier: issue.identifier,
      status: "starting",
    });

    console.log(`Starting agent for ${issue.identifier}: ${issue.title}`);
    console.log(`Repo: ${ctx.config.project.repo}`);

    try {
      const finish = await runCloudAgent({
        apiKey: ctx.env.cursorApiKey,
        config: ctx.config,
        prompt,
        onStarted: async ({ agentId, runId }) => {
          ctx.ledger.updateRun(runRow.id, {
            cursor_agent_id: agentId,
            cursor_run_id: runId,
            status: "running",
          });
          await ctx.linear.comment(
            issue.id,
            [
              `🤖 **Agent started** via \`lab take\``,
              `- Cursor agent: \`${agentId}\``,
              `- Run: \`${runId}\``,
              `- Model: \`${ctx.config.cursor.model}\``,
            ].join("\n"),
          );
        },
        onStatus: (line) => console.log(`  · ${line}`),
      });

      if (finish.prUrl) {
        ctx.ledger.linkPullRequest({
          issueIdentifier: issue.identifier,
          url: finish.prUrl,
          number: parsePrNumber(finish.prUrl),
          state: "open",
        });
        await ctx.linear.comment(
          issue.id,
          [
            `🔗 **PR opened**`,
            `- ${finish.prUrl}`,
            finish.branchName ? `- Branch: \`${finish.branchName}\`` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }

      if (finish.status === "error" || finish.error) {
        ctx.ledger.finishRun(runRow.id, "failed", finish.error ?? finish.status);
        await ctx.linear.comment(
          issue.id,
          [
            `❌ **Agent run failed**`,
            finish.error ? `- ${finish.error}` : `- status: ${finish.status}`,
            finish.prUrl ? `- PR (if any): ${finish.prUrl}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        process.exitCode = 2;
        return;
      }

      ctx.ledger.finishRun(runRow.id, "succeeded");
      await ctx.linear.comment(
        issue.id,
        [
          `✅ **Agent run finished**`,
          `- status: \`${finish.status}\``,
          finish.prUrl ? `- PR: ${finish.prUrl}` : `- No PR URL returned (check Cursor dashboard)`,
          ``,
          `_Please review the PR. Do not auto-merge._`,
        ].join("\n"),
      );

      console.log(`Done. Status: ${finish.status}`);
      if (finish.prUrl) console.log(`PR: ${finish.prUrl}`);
      console.log(`Ledger: ${path.relative(ctx.cwd, defaultDbPath(ctx.cwd))}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.ledger.finishRun(runRow.id, "failed", message);
      try {
        await ctx.linear.comment(
          issue.id,
          `❌ **Agent run failed to complete**\n- ${message}`,
        );
      } catch {
        // ignore comment failures on hard errors
      }
      throw err;
    }
  } finally {
    ctx.ledger.close();
  }
}
