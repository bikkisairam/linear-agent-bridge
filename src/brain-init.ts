import fs from "node:fs";
import path from "node:path";

const INDEX_TEMPLATE = `# Project brain

Living notes for agents and humans. Keep this short.
Load selectively — never paste this whole tree into a prompt.

## Hot spots
- (none yet)

## Open risks
- (none yet)

## Recent issues
- (none yet)
`;

const ISSUE_TEMPLATE = `# ISSUE_ID — title

## Goal
…

## Timeline
- YYYY-MM-DD — started / PR / done

## What changed
- path/to/file — why

## Errors & fixes
- error → fix

## Decisions
- …

## Open loops
- …

## Pointers
- PR:
- Agent:
`;

/**
 * Scaffolds markdown project-brain folders in a target repo checkout.
 */
export function initProjectBrain(
  targetRoot: string,
  memoryDirName = "memory",
): { memoryRoot: string; created: string[] } {
  const memoryRoot = path.join(path.resolve(targetRoot), memoryDirName);
  const created: string[] = [];

  const dirs = [
    memoryRoot,
    path.join(memoryRoot, "issues"),
    path.join(memoryRoot, "sessions"),
    path.join(memoryRoot, "patterns"),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }

  const indexPath = path.join(memoryRoot, "INDEX.md");
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, INDEX_TEMPLATE, "utf8");
    created.push(indexPath);
  }

  const templatePath = path.join(memoryRoot, "issues", "_TEMPLATE.md");
  if (!fs.existsSync(templatePath)) {
    fs.writeFileSync(templatePath, ISSUE_TEMPLATE, "utf8");
    created.push(templatePath);
  }

  for (const empty of ["sessions", "patterns"] as const) {
    const keep = path.join(memoryRoot, empty, ".gitkeep");
    if (!fs.existsSync(keep)) {
      fs.writeFileSync(keep, "", "utf8");
      created.push(keep);
    }
  }

  return { memoryRoot, created };
}
