import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import dotenv from "dotenv";

export type AgentBridgeConfig = {
  project: {
    name: string;
    repo: string;
    defaultBranch: string;
    localPath?: string;
    memoryDir?: string;
  };
  linear: {
    triggerLabel: string;
    /** Comment phrases that start an agent (like @Cursor). Default: @lab, @cursor */
    commentTriggers?: string[];
    webhook?: {
      port?: number;
      path?: string;
    };
    pollSeconds?: number;
  };
  cursor: {
    runtime: "cloud" | "local";
    model: string;
    autoCreatePR: boolean;
  };
  skills?: Array<{ path: string }>;
  prompt: {
    bootstrap: string;
  };
};

export type EnvKeys = {
  cursorApiKey: string;
  linearApiKey: string;
  linearWebhookSecret?: string;
};

export function loadEnv(cwd = process.cwd()): EnvKeys {
  dotenv.config({ path: path.join(cwd, ".env") });

  const cursorApiKey = process.env.CURSOR_API_KEY?.trim();
  const linearApiKey = process.env.LINEAR_API_KEY?.trim();

  if (!cursorApiKey) {
    throw new Error("Missing CURSOR_API_KEY in environment or .env");
  }
  if (!linearApiKey) {
    throw new Error("Missing LINEAR_API_KEY in environment or .env");
  }

  return {
    cursorApiKey,
    linearApiKey,
    linearWebhookSecret: process.env.LINEAR_WEBHOOK_SECRET?.trim() || undefined,
  };
}

export function loadConfig(
  cwd = process.cwd(),
  configPath = "agent-bridge.yaml",
): AgentBridgeConfig {
  const fullPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(cwd, configPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config not found: ${fullPath}`);
  }

  const raw = fs.readFileSync(fullPath, "utf8");
  const parsed = yaml.load(raw) as AgentBridgeConfig;

  if (!parsed?.project?.repo) {
    throw new Error("agent-bridge.yaml: project.repo is required");
  }
  if (!parsed.linear?.triggerLabel) {
    parsed.linear = { ...(parsed.linear ?? {}), triggerLabel: "agent-approved" };
  }
  if (!parsed.linear.commentTriggers?.length) {
    parsed.linear.commentTriggers = ["@lab", "@cursor"];
  }
  if (!parsed.linear.webhook) {
    parsed.linear.webhook = { port: 8787, path: "/webhooks/linear" };
  }
  if (parsed.linear.pollSeconds == null) {
    parsed.linear.pollSeconds = 15;
  }
  if (!parsed.cursor) {
    parsed.cursor = {
      runtime: "cloud",
      model: "composer-2.5",
      autoCreatePR: true,
    };
  }
  if (!parsed.project.memoryDir) {
    parsed.project.memoryDir = "memory";
  }
  if (!parsed.prompt?.bootstrap) {
    throw new Error("agent-bridge.yaml: prompt.bootstrap is required");
  }

  return parsed;
}

export function resolveSkillContents(
  config: AgentBridgeConfig,
  cwd = process.cwd(),
): string[] {
  const skills = config.skills ?? [];
  return skills.map((skill) => {
    const full = path.isAbsolute(skill.path)
      ? skill.path
      : path.join(cwd, skill.path);
    if (!fs.existsSync(full)) {
      throw new Error(`Skill file not found: ${full}`);
    }
    return fs.readFileSync(full, "utf8");
  });
}
