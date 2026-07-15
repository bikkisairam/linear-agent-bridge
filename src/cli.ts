#!/usr/bin/env node
import { Command } from "commander";
import { cmdTake } from "./commands/take.js";
import { cmdStatus } from "./commands/status.js";
import { cmdWatch } from "./commands/watch.js";
import { cmdInitMemory } from "./commands/init-memory.js";

const program = new Command();

program
  .name("lab")
  .description(
    "Linear Agent Bridge — approved issues → Cursor agents → PRs + markdown project brain",
  )
  .version("0.1.0");

program
  .command("take")
  .argument("<issueId>", "Linear issue id, e.g. ENG-12")
  .description("Start a Cursor cloud agent for an agent-approved Linear issue")
  .action(async (issueId: string) => {
    await cmdTake(issueId);
  });

program
  .command("status")
  .argument("<issueId>", "Linear issue id, e.g. ENG-12")
  .description("Show run ledger + linked PR for an issue")
  .action(async (issueId: string) => {
    await cmdStatus(issueId);
  });

program
  .command("watch")
  .argument("<issueId>", "Linear issue id, e.g. ENG-12")
  .description("Poll / resume an in-flight Cursor agent run and update Linear")
  .action(async (issueId: string) => {
    await cmdWatch(issueId);
  });

program
  .command("init-memory")
  .description(
    "Scaffold markdown project brain (memory/) in the target repo checkout",
  )
  .option(
    "-p, --path <dir>",
    "Target repo root (defaults to project.localPath or cwd)",
  )
  .action(async (opts: { path?: string }) => {
    await cmdInitMemory({ path: opts.path });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
