import { Agent, CursorAgentError } from "@cursor/sdk";
import type { AgentBridgeConfig } from "./config.js";

export type CloudAgentStartResult = {
  agentId: string;
  runId: string;
};

export type CloudAgentFinishResult = {
  status: string;
  prUrl?: string;
  branchName?: string;
  error?: string;
};

/**
 * Starts a Cursor cloud agent and waits for the run to finish.
 * Always pass apiKey explicitly — never rely on ambient auth in shared code.
 */
export async function runCloudAgent(input: {
  apiKey: string;
  config: AgentBridgeConfig;
  prompt: string;
  onStarted?: (info: CloudAgentStartResult) => void | Promise<void>;
  onStatus?: (line: string) => void;
}): Promise<CloudAgentFinishResult> {
  const { apiKey, config, prompt, onStarted, onStatus } = input;

  if (config.cursor.runtime !== "cloud") {
    throw new Error(
      `Only cloud runtime is supported in this MVP (got: ${config.cursor.runtime})`,
    );
  }

  let agent: Awaited<ReturnType<typeof Agent.create>> | undefined;

  try {
    agent = await Agent.create({
      apiKey,
      model: { id: config.cursor.model },
      cloud: {
        repos: [
          {
            url: config.project.repo,
            startingRef: config.project.defaultBranch,
          },
        ],
        autoCreatePR: config.cursor.autoCreatePR,
      },
    });

    const run = await agent.send(prompt);
    const started: CloudAgentStartResult = {
      agentId: agent.agentId,
      runId: run.id,
    };
    await onStarted?.(started);
    onStatus?.(`Cloud agent started: agent=${started.agentId} run=${started.runId}`);

    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text.trim()) {
            onStatus?.(truncate(block.text.trim(), 200));
          }
        }
      } else if (event.type === "status") {
        onStatus?.(`status: ${String((event as { status?: string }).status ?? event.type)}`);
      }
    }

    const result = await run.wait();

    if (result.status === "error") {
      return {
        status: "error",
        error: `Run ${result.id} failed`,
        prUrl: extractPrUrl(result),
        branchName: extractBranch(result),
      };
    }

    return {
      status: result.status,
      prUrl: extractPrUrl(result),
      branchName: extractBranch(result),
    };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(
        `Cursor agent failed to start: ${err.message} (retryable=${err.isRetryable})`,
      );
    }
    throw err;
  } finally {
    if (agent) {
      await agent[Symbol.asyncDispose]();
    }
  }
}

export async function watchCloudAgent(input: {
  apiKey: string;
  agentId: string;
  runId?: string;
  onStatus?: (line: string) => void;
}): Promise<CloudAgentFinishResult> {
  const { apiKey, agentId, runId, onStatus } = input;

  await using agent = await Agent.resume(agentId, { apiKey });

  if (runId) {
    const run = await Agent.getRun(runId, {
      runtime: "cloud",
      agentId,
      apiKey,
    });
    onStatus?.(`Watching run ${runId} on agent ${agentId}`);
    if (run.supports("stream")) {
      for await (const event of run.stream()) {
        if (event.type === "status") {
          onStatus?.(`status: ${event.type}`);
        }
      }
    }
    const result = await run.wait();
    return {
      status: result.status,
      prUrl: extractPrUrl(result),
      branchName: extractBranch(result),
      error: result.status === "error" ? `Run ${result.id} failed` : undefined,
    };
  }

  onStatus?.(`Resumed agent ${agent.agentId} (no active runId to watch)`);
  return { status: "unknown" };
}

function extractPrUrl(result: {
  git?: { branches?: Array<{ prUrl?: string; branch?: string; repoUrl?: string }> };
}): string | undefined {
  return result.git?.branches?.find((b) => b.prUrl)?.prUrl;
}

function extractBranch(result: {
  git?: { branches?: Array<{ prUrl?: string; branch?: string; repoUrl?: string }> };
}): string | undefined {
  return result.git?.branches?.find((b) => b.branch)?.branch;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function parsePrNumber(url: string): number | null {
  const m = url.match(/\/pull\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export { parsePrNumber };
