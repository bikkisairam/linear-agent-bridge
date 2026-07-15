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

export type TakeResult =
  | { ok: true; identifier: string; prUrl?: string; status: string }
  | {
      ok: false;
      identifier?: string;
      reason: "not_approved" | "active_run" | "failed" | "error";
      message: string;
    };

export function openContext(cwd = process.cwd()): CliContext {
  const config = loadConfig(cwd);
  const env = loadEnv(cwd);
  const ledger = new RunLedger(defaultDbPath(cwd));
  const linear = new LinearBridge(env.linearApiKey);
  return { cwd, config, env, ledger, linear };
}

export async function cmdTake(issueId: string, cwd = process.cwd()): Promise<void> {
  const result = await takeIssue(issueId, {
    cwd,
    source: "lab take",
    closeLedger: true,
  });
  if (!result.ok) {
    console.error(result.message);
    process.exitCode = result.reason === "failed" ? 2 : 1;
  }
}

/**
 * Core take flow. Used by CLI, webhook serve, and poll.
 */
export async function takeIssue(
  issueRef: string,
  options: {
    cwd?: string;
    source?: string;
    /** Existing context — if provided, ledger is NOT closed. */
    ctx?: CliContext;
    closeLedger?: boolean;
  } = {},
): Promise<TakeResult> {
  const cwd = options.cwd ?? process.cwd();
  const source = options.source ?? "lab take";
  const ownsCtx = !options.ctx;
  const ctx = options.ctx ?? openContext(cwd);
  const closeLedger = options.closeLedger ?? ownsCtx;

  try {
    const issue = looksLikeUuid(issueRef)
      ? await ctx.linear.getIssueById(issueRef)
      : await ctx.linear.getIssueByIdentifier(issueRef.toUpperCase());

    try {
      ctx.linear.assertApproved(issue, ctx.config.linear.triggerLabel);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.linear.comment(
        issue.id,
        [
          `Refusing: missing \`${ctx.config.linear.triggerLabel}\` label.`,
          `Add the label, then comment \`@lab\` (or run \`lab take ${issue.identifier}\`).`,
          `_via \`${source}\`_`,
        ].join("\n"),
      );
      return { ok: false, identifier: issue.identifier, reason: "not_approved", message };
    }

    const active = ctx.ledger.getActiveRun(issue.identifier);
    if (active) {
      const message = [
        `Refusing: active run already in progress for ${issue.identifier}.`,
        `- run id: ${active.id}`,
        `- status: ${active.status}`,
        `- agent: ${active.cursor_agent_id ?? "n/a"}`,
        `Run: lab status ${issue.identifier}`,
      ].join("\n");
      await ctx.linear.comment(
        issue.id,
        `${message}\n\n_via \`${source}\`_`,
      );
      console.error(message);
      return { ok: false, identifier: issue.identifier, reason: "active_run", message };
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
    console.log(`Source: ${source}`);

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
              `🤖 **Agent started** via \`${source}\``,
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
            `_via \`${source}\`_`,
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
            `_via \`${source}\`_`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        return {
          ok: false,
          identifier: issue.identifier,
          reason: "failed",
          message: finish.error ?? finish.status,
        };
      }

      ctx.ledger.finishRun(runRow.id, "succeeded");
      await ctx.linear.comment(
        issue.id,
        [
          `✅ **Agent run finished**`,
          `- status: \`${finish.status}\``,
          finish.prUrl
            ? `- PR: ${finish.prUrl}`
            : `- No PR URL returned (check Cursor dashboard)`,
          ``,
          `_Please review the PR. Do not auto-merge._`,
          `_via \`${source}\`_`,
        ].join("\n"),
      );

      console.log(`Done. Status: ${finish.status}`);
      if (finish.prUrl) console.log(`PR: ${finish.prUrl}`);
      console.log(`Ledger: ${path.relative(ctx.cwd, defaultDbPath(ctx.cwd))}`);

      return {
        ok: true,
        identifier: issue.identifier,
        prUrl: finish.prUrl,
        status: finish.status,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.ledger.finishRun(runRow.id, "failed", message);
      try {
        await ctx.linear.comment(
          issue.id,
          `❌ **Agent run failed to complete**\n- ${message}\n_via \`${source}\`_`,
        );
      } catch {
        // ignore
      }
      return { ok: false, identifier: issue.identifier, reason: "error", message };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "error", message };
  } finally {
    if (closeLedger) ctx.ledger.close();
  }
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}
