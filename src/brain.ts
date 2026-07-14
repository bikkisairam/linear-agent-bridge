import fs from "node:fs";
import path from "node:path";
import type { AgentBridgeConfig } from "./config.js";

const MAX_EXCERPT_CHARS = 6_000;

/**
 * Reads project-brain markdown from a local checkout of the target repo.
 * Cloud agents should also read memory/ inside the cloned repo; this
 * injects excerpts into the bootstrap prompt when localPath is configured.
 */
export function loadProjectBrainExcerpts(
  config: AgentBridgeConfig,
  issueIdentifier: string,
): string | null {
  const localPath = config.project.localPath;
  if (!localPath) {
    return null;
  }

  const root = path.resolve(localPath);
  const memoryDir = path.join(root, config.project.memoryDir ?? "memory");
  if (!fs.existsSync(memoryDir)) {
    return null;
  }

  const chunks: string[] = [];
  const indexPath = path.join(memoryDir, "INDEX.md");
  if (fs.existsSync(indexPath)) {
    chunks.push(`### memory/INDEX.md\n${fs.readFileSync(indexPath, "utf8")}`);
  }

  const issuePath = path.join(memoryDir, "issues", `${issueIdentifier}.md`);
  if (fs.existsSync(issuePath)) {
    chunks.push(
      `### memory/issues/${issueIdentifier}.md\n${fs.readFileSync(issuePath, "utf8")}`,
    );
  }

  const patternsDir = path.join(memoryDir, "patterns");
  if (fs.existsSync(patternsDir)) {
    const files = fs
      .readdirSync(patternsDir)
      .filter((f) => f.endsWith(".md"))
      .slice(0, 3);
    for (const file of files) {
      chunks.push(
        `### memory/patterns/${file}\n${fs.readFileSync(path.join(patternsDir, file), "utf8")}`,
      );
    }
  }

  if (chunks.length === 0) {
    return null;
  }

  let text = chunks.join("\n\n");
  if (text.length > MAX_EXCERPT_CHARS) {
    text = `${text.slice(0, MAX_EXCERPT_CHARS)}\n\n…(truncated)`;
  }
  return text;
}

export function projectBrainInstructions(
  config: AgentBridgeConfig,
  issueIdentifier: string,
): string {
  const dir = config.project.memoryDir ?? "memory";
  return [
    "## Project brain (required)",
    `This repo's living memory lives under \`${dir}/.\``,
    "Before changing code, read:",
    `- \`${dir}/INDEX.md\` (if present)`,
    `- \`${dir}/issues/${issueIdentifier}.md\` (if present)`,
    `- relevant \`${dir}/patterns/*.md\``,
    "",
    "After you finish (success or failure), update the brain in this PR:",
    `- Create/update \`${dir}/issues/${issueIdentifier}.md\` with: goal, what changed, errors+fixes, decisions, open loops, PR URL`,
    `- Append a short session note under \`${dir}/sessions/\``,
    `- Keep \`${dir}/INDEX.md\` as a one-line map of hot spots / open risks`,
    "Keep notes short — future agents need signal, not a transcript.",
  ].join("\n");
}
