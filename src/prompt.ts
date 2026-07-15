import type { AgentBridgeConfig } from "./config.js";
import { resolveSkillContents } from "./config.js";
import {
  loadProjectBrainExcerpts,
  projectBrainInstructions,
} from "./brain.js";
import type { LinearIssueDetails } from "./linear.js";
import type { AgentRunRow, PullRequestRow } from "./memory.js";

export function buildBootstrapPrompt(input: {
  config: AgentBridgeConfig;
  issue: LinearIssueDetails;
  priorRuns: AgentRunRow[];
  priorPr?: PullRequestRow;
  cwd?: string;
}): string {
  const { config, issue, priorRuns, priorPr, cwd = process.cwd() } = input;
  const skills = resolveSkillContents(config, cwd);
  const brainExcerpts = loadProjectBrainExcerpts(config, issue.identifier, [
    issue.title,
    issue.description ?? "",
  ]);

  const priorMemoryLines: string[] = [];
  if (priorRuns.length > 0) {
    priorMemoryLines.push("### Prior agent runs (run ledger)");
    for (const run of priorRuns.slice(0, 5)) {
      priorMemoryLines.push(
        `- ${run.started_at} status=${run.status} agent=${run.cursor_agent_id ?? "n/a"} run=${run.cursor_run_id ?? "n/a"}${run.error ? ` error=${run.error}` : ""}`,
      );
    }
  }
  if (priorPr) {
    priorMemoryLines.push(
      `### Prior PR\n- ${priorPr.url} (state=${priorPr.state}${priorPr.number != null ? `, #${priorPr.number}` : ""})`,
    );
  }

  return [
    config.prompt.bootstrap.trim(),
    "",
    "## Linear issue",
    `- Identifier: ${issue.identifier}`,
    `- Title: ${issue.title}`,
    `- URL: ${issue.url}`,
    `- State: ${issue.stateName ?? "unknown"}`,
    `- Labels: ${issue.labels.join(", ") || "(none)"}`,
    "",
    "### Description",
    issue.description?.trim() || "(no description)",
    "",
    "## Hard rules for this run",
    `- Branch from \`${config.project.defaultBranch}\`.`,
    "- Open a PR. Do **not** merge.",
    "- Do not commit secrets or `.env`.",
    "- Keep the change small and reviewable.",
    `- Target repo: ${config.project.repo}`,
    "",
    projectBrainInstructions(config, issue.identifier),
    "",
    priorMemoryLines.length > 0
      ? `## Related memory from previous runs\n${priorMemoryLines.join("\n")}`
      : "## Related memory from previous runs\n(none yet — you are writing the first chapter)",
    "",
    brainExcerpts
      ? `## Project brain excerpts (local checkout)\n${brainExcerpts}`
      : "## Project brain excerpts\n(no localPath configured — read `memory/` inside the cloned repo)",
    "",
    skills.length > 0
      ? `## Skills\n${skills.map((s, i) => `### Skill ${i + 1}\n${s.trim()}`).join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
