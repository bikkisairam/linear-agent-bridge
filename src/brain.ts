import fs from "node:fs";
import path from "node:path";
import type { AgentBridgeConfig } from "./config.js";

const MAX_EXCERPT_CHARS = 6_000;
const MAX_INDEX_CHARS = 2_000;
const MAX_ISSUE_CHARS = 3_000;
const MAX_PATTERN_FILES = 2;

/**
 * Reads a selective slice of the markdown project brain from a local checkout.
 * Scale rule: never load the whole memory tree — only INDEX + this issue +
 * a couple of keyword-matched patterns.
 */
export function loadProjectBrainExcerpts(
  config: AgentBridgeConfig,
  issueIdentifier: string,
  hints: string[] = [],
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
    chunks.push(
      `### memory/INDEX.md\n${clip(fs.readFileSync(indexPath, "utf8"), MAX_INDEX_CHARS)}`,
    );
  }

  const issuePath = path.join(memoryDir, "issues", `${issueIdentifier}.md`);
  if (fs.existsSync(issuePath)) {
    chunks.push(
      `### memory/issues/${issueIdentifier}.md\n${clip(fs.readFileSync(issuePath, "utf8"), MAX_ISSUE_CHARS)}`,
    );
  }

  const patternsDir = path.join(memoryDir, "patterns");
  if (fs.existsSync(patternsDir)) {
    const needle = normalizeHints([issueIdentifier, ...hints]);
    const files = fs
      .readdirSync(patternsDir)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .map((file) => {
        const full = path.join(patternsDir, file);
        const body = fs.readFileSync(full, "utf8");
        const score = scoreText(`${file}\n${body}`, needle);
        return { file, body, score };
      })
      .filter((f) => f.score > 0 || needle.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PATTERN_FILES);

    // If no keyword hits, still skip dumping all patterns at scale.
    for (const hit of files.filter((f) => f.score > 0)) {
      chunks.push(
        `### memory/patterns/${hit.file}\n${clip(hit.body, 1_500)}`,
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

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…(truncated)`;
}

function normalizeHints(hints: string[]): string[] {
  return hints
    .flatMap((h) => h.toLowerCase().split(/[^a-z0-9]+/g))
    .filter((t) => t.length >= 3);
}

function scoreText(text: string, needles: string[]): number {
  if (needles.length === 0) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const n of needles) {
    if (lower.includes(n)) score += 1;
  }
  return score;
}

export function projectBrainInstructions(
  config: AgentBridgeConfig,
  issueIdentifier: string,
): string {
  const dir = config.project.memoryDir ?? "memory";
  return [
    "## Project brain (required)",
    `This repo's living memory lives under \`${dir}/\` as markdown.`,
    "Before changing code, read ONLY:",
    `- \`${dir}/INDEX.md\` (if present) — short map, not a transcript`,
    `- \`${dir}/issues/${issueIdentifier}.md\` (if present)`,
    `- at most 1–2 relevant \`${dir}/patterns/*.md\` files`,
    "Do not load every issue file. Selective reads only.",
    "",
    "After you finish (success or failure), update the brain in this PR:",
    `- Create/update \`${dir}/issues/${issueIdentifier}.md\` with: goal, what changed, errors+fixes, decisions, open loops, PR URL`,
    `- Append a short session note under \`${dir}/sessions/\``,
    `- Keep \`${dir}/INDEX.md\` as a one-line map of hot spots / open risks`,
    "Keep notes short — future agents need signal, not a transcript.",
  ].join("\n");
}
