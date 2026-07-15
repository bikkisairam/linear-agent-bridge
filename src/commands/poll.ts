import fs from "node:fs";
import path from "node:path";
import { openContext, takeIssue } from "./take.js";
import { commentRequestsTake } from "../trigger.js";

type PollState = {
  seenCommentIds: string[];
};

/**
 * Local alternative to webhooks: poll approved issues for @lab / @cursor comments.
 * No public URL / ngrok required.
 */
export async function cmdPoll(options: {
  team?: string;
  cwd?: string;
  once?: boolean;
} = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const ctx = openContext(cwd);
  const triggers = ctx.config.linear.commentTriggers ?? ["@lab", "@cursor"];
  const intervalMs = (ctx.config.linear.pollSeconds ?? 15) * 1000;
  const teamKey = options.team ?? "ENG";
  const statePath = path.join(cwd, "data", "poll-state.json");
  const state = loadState(statePath);

  console.log(`lab poll — team=${teamKey} every ${intervalMs / 1000}s`);
  console.log(`Triggers: ${triggers.join(", ")}`);
  console.log(`Label gate: ${ctx.config.linear.triggerLabel}`);
  console.log("Comment `@lab` or `@cursor` on an approved issue to start.\n");

  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const issueIds = await ctx.linear.listApprovedIssueIds(
        teamKey,
        ctx.config.linear.triggerLabel,
        30,
      );

      for (const issueId of issueIds) {
        const comments = await ctx.linear.listRecentComments(issueId, 15);
        const newestFirst = [...comments].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );

        for (const comment of newestFirst) {
          if (state.seenCommentIds.includes(comment.id)) continue;
          // Mark seen even if not a trigger so we don't re-scan forever
          state.seenCommentIds.push(comment.id);
          if (state.seenCommentIds.length > 500) {
            state.seenCommentIds = state.seenCommentIds.slice(-400);
          }
          saveState(statePath, state);

          if (!commentRequestsTake(comment.body, triggers)) continue;

          const issue = await ctx.linear.getIssueById(issueId);
          console.log(
            `Detected trigger on ${issue.identifier}: ${comment.body.slice(0, 60)}`,
          );
          const result = await takeIssue(issue.identifier, {
            ctx,
            closeLedger: false,
            source: "lab poll",
          });
          console.log(
            result.ok
              ? `Take ok: ${result.identifier}`
              : `Take skipped/failed: ${result.message}`,
          );
          break; // one take per tick
        }
      }
    } catch (err) {
      console.error("Poll error:", err instanceof Error ? err.message : err);
    } finally {
      busy = false;
    }
  };

  await tick();
  if (options.once) {
    ctx.ledger.close();
    return;
  }

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  const shutdown = () => {
    clearInterval(timer);
    ctx.ledger.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function loadState(file: string): PollState {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8")) as PollState;
    }
  } catch {
    // ignore
  }
  return { seenCommentIds: [] };
}

function saveState(file: string, state: PollState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}
