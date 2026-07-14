import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

export type IssueRow = {
  identifier: string;
  title: string;
  url: string;
  updated_at: string;
};

export type AgentRunRow = {
  id: string;
  issue_identifier: string;
  cursor_agent_id: string | null;
  cursor_run_id: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

export type PullRequestRow = {
  id: string;
  issue_identifier: string;
  url: string;
  number: number | null;
  state: string;
  created_at: string;
};

const ACTIVE_STATUSES = new Set(["pending", "running", "starting"]);

export class RunLedger {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        identifier TEXT PRIMARY KEY,
        title TEXT,
        url TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        issue_identifier TEXT NOT NULL,
        cursor_agent_id TEXT,
        cursor_run_id TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error TEXT,
        FOREIGN KEY (issue_identifier) REFERENCES issues(identifier)
      );

      CREATE TABLE IF NOT EXISTS pull_requests (
        id TEXT PRIMARY KEY,
        issue_identifier TEXT NOT NULL,
        url TEXT NOT NULL,
        number INTEGER,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (issue_identifier) REFERENCES issues(identifier)
      );

      CREATE INDEX IF NOT EXISTS idx_runs_issue ON agent_runs(issue_identifier);
      CREATE INDEX IF NOT EXISTS idx_prs_issue ON pull_requests(issue_identifier);
    `);
  }

  upsertIssue(issue: IssueRow): void {
    this.db
      .prepare(
        `INSERT INTO issues (identifier, title, url, updated_at)
         VALUES (@identifier, @title, @url, @updated_at)
         ON CONFLICT(identifier) DO UPDATE SET
           title = excluded.title,
           url = excluded.url,
           updated_at = excluded.updated_at`,
      )
      .run(issue);
  }

  getActiveRun(issueIdentifier: string): AgentRunRow | undefined {
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_runs
         WHERE issue_identifier = ?
         ORDER BY started_at DESC`,
      )
      .all(issueIdentifier) as AgentRunRow[];

    return rows.find((r) => ACTIVE_STATUSES.has(r.status));
  }

  getLatestRun(issueIdentifier: string): AgentRunRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM agent_runs
         WHERE issue_identifier = ?
         ORDER BY started_at DESC
         LIMIT 1`,
      )
      .get(issueIdentifier) as AgentRunRow | undefined;
  }

  startRun(input: {
    issueIdentifier: string;
    cursorAgentId?: string;
    cursorRunId?: string;
    status?: string;
  }): AgentRunRow {
    const row: AgentRunRow = {
      id: uuidv4(),
      issue_identifier: input.issueIdentifier,
      cursor_agent_id: input.cursorAgentId ?? null,
      cursor_run_id: input.cursorRunId ?? null,
      status: input.status ?? "starting",
      started_at: new Date().toISOString(),
      finished_at: null,
      error: null,
    };

    this.db
      .prepare(
        `INSERT INTO agent_runs
         (id, issue_identifier, cursor_agent_id, cursor_run_id, status, started_at, finished_at, error)
         VALUES
         (@id, @issue_identifier, @cursor_agent_id, @cursor_run_id, @status, @started_at, @finished_at, @error)`,
      )
      .run(row);

    return row;
  }

  updateRun(
    id: string,
    patch: Partial<
      Pick<
        AgentRunRow,
        | "cursor_agent_id"
        | "cursor_run_id"
        | "status"
        | "finished_at"
        | "error"
      >
    >,
  ): void {
    const current = this.db
      .prepare(`SELECT * FROM agent_runs WHERE id = ?`)
      .get(id) as AgentRunRow | undefined;
    if (!current) {
      throw new Error(`Unknown agent run: ${id}`);
    }

    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE agent_runs SET
           cursor_agent_id = @cursor_agent_id,
           cursor_run_id = @cursor_run_id,
           status = @status,
           finished_at = @finished_at,
           error = @error
         WHERE id = @id`,
      )
      .run(next);
  }

  finishRun(
    id: string,
    status: "succeeded" | "failed" | "cancelled",
    error?: string,
  ): void {
    this.updateRun(id, {
      status,
      finished_at: new Date().toISOString(),
      error: error ?? null,
    });
  }

  linkPullRequest(input: {
    issueIdentifier: string;
    url: string;
    number?: number | null;
    state?: string;
  }): PullRequestRow {
    const row: PullRequestRow = {
      id: uuidv4(),
      issue_identifier: input.issueIdentifier,
      url: input.url,
      number: input.number ?? null,
      state: input.state ?? "open",
      created_at: new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO pull_requests
         (id, issue_identifier, url, number, state, created_at)
         VALUES
         (@id, @issue_identifier, @url, @number, @state, @created_at)`,
      )
      .run(row);

    return row;
  }

  getLatestPullRequest(issueIdentifier: string): PullRequestRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM pull_requests
         WHERE issue_identifier = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(issueIdentifier) as PullRequestRow | undefined;
  }

  getIssue(issueIdentifier: string): IssueRow | undefined {
    return this.db
      .prepare(`SELECT * FROM issues WHERE identifier = ?`)
      .get(issueIdentifier) as IssueRow | undefined;
  }

  close(): void {
    this.db.close();
  }
}

export function defaultDbPath(cwd = process.cwd()): string {
  return path.join(cwd, "data", "run-ledger.db");
}
