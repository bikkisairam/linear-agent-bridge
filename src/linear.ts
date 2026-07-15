import { LinearClient } from "@linear/sdk";

export type LinearIssueDetails = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  labels: string[];
  stateName: string | null;
};

export class LinearBridge {
  private client: LinearClient;

  constructor(apiKey: string) {
    this.client = new LinearClient({ apiKey });
  }

  async getIssueByIdentifier(identifier: string): Promise<LinearIssueDetails> {
    const teamKey = parseTeamKey(identifier);
    const number = parseIssueNumber(identifier);

    const searched = await this.client.issues({
      filter: {
        team: { key: { eqIgnoreCase: teamKey } },
        number: { eq: number },
      },
    });

    const match =
      searched.nodes.find(
        (n) => n.identifier.toUpperCase() === identifier.toUpperCase(),
      ) ?? searched.nodes[0];

    if (!match) {
      throw new Error(`Linear issue not found: ${identifier}`);
    }

    const labelsConn = await match.labels();
    const state = await match.state;

    return {
      id: match.id,
      identifier: match.identifier,
      title: match.title,
      description: match.description ?? null,
      url: match.url,
      labels: labelsConn.nodes.map((l) => l.name),
      stateName: state?.name ?? null,
    };
  }

  assertApproved(issue: LinearIssueDetails, triggerLabel: string): void {
    const has = issue.labels.some(
      (l) => l.toLowerCase() === triggerLabel.toLowerCase(),
    );
    if (!has) {
      throw new Error(
        `Issue ${issue.identifier} is missing required label "${triggerLabel}". Add the label, then retry.`,
      );
    }
  }

  async comment(issueId: string, body: string): Promise<void> {
    await this.client.createComment({
      issueId,
      body,
    });
  }
}

function parseTeamKey(identifier: string): string {
  const parts = identifier.split("-");
  if (parts.length < 2) {
    throw new Error(`Invalid issue id: ${identifier}`);
  }
  return parts[0]!;
}

function parseIssueNumber(identifier: string): number {
  const parts = identifier.split("-");
  const n = Number(parts[parts.length - 1]);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid issue id: ${identifier}`);
  }
  return n;
}
