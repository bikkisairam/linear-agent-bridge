import path from "node:path";
import { loadConfig } from "../config.js";
import { initProjectBrain } from "../brain-init.js";

export async function cmdInitMemory(options: {
  path?: string;
  cwd?: string;
}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const config = loadConfig(cwd);

  const target =
    options.path ??
    config.project.localPath ??
    cwd;

  const memoryDir = config.project.memoryDir ?? "memory";
  const { memoryRoot, created } = initProjectBrain(target, memoryDir);

  console.log(`Project brain ready at: ${memoryRoot}`);
  if (created.length === 0) {
    console.log("Nothing new created (already scaffolded).");
  } else {
    console.log("Created:");
    for (const item of created) {
      console.log(`  - ${path.relative(cwd, item) || item}`);
    }
  }
  console.log("");
  console.log("Tip: commit this memory/ folder in the *target* GitHub repo.");
  console.log("Next agent runs will read INDEX + this issue's case file only.");
}
