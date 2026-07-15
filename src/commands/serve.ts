import crypto from "node:crypto";
import http from "node:http";
import { openContext, takeIssue } from "./take.js";
import { commentRequestsTake } from "../trigger.js";

type LinearCommentWebhook = {
  action?: string;
  type?: string;
  data?: {
    id?: string;
    body?: string;
    issueId?: string;
    userId?: string;
  };
  webhookTimestamp?: number;
};

/**
 * HTTP server for Linear Comment webhooks.
 * Comment `@lab` or `@cursor` on an agent-approved issue → lab take.
 */
export async function cmdServe(options: {
  port?: number;
  cwd?: string;
} = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const ctx = openContext(cwd);
  const path =
    ctx.config.linear.webhook?.path ?? "/webhooks/linear";
  const port =
    options.port ??
    ctx.config.linear.webhook?.port ??
    Number(process.env.PORT ?? 8787);

  const triggers = ctx.config.linear.commentTriggers ?? ["@lab", "@cursor"];
  const secret = ctx.env.linearWebhookSecret;

  // Serialize takes so two webhooks don't double-start
  let chain: Promise<void> = Promise.resolve();

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "lab-serve" }));
      return;
    }

    if (req.method !== "POST" || !req.url?.startsWith(path)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks);

    try {
      if (secret) {
        const signature = String(req.headers["linear-signature"] ?? "");
        verifyLinearSignature(raw, signature, secret);
      } else {
        console.warn(
          "Warning: LINEAR_WEBHOOK_SECRET not set — signature not verified",
        );
      }

      const payload = JSON.parse(raw.toString("utf8")) as LinearCommentWebhook;
      if (payload.type !== "Comment" || payload.action !== "create") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ignored: true, reason: "not_comment_create" }));
        return;
      }

      const body = payload.data?.body ?? "";
      const issueId = payload.data?.issueId;
      if (!issueId || !commentRequestsTake(body, triggers)) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ignored: true, reason: "no_trigger" }));
        return;
      }

      console.log(`Webhook trigger on issue ${issueId}: ${body.slice(0, 80)}`);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ accepted: true, issueId }));

      chain = chain
        .then(async () => {
          const result = await takeIssue(issueId, {
            ctx,
            closeLedger: false,
            source: "lab serve",
          });
          console.log(
            result.ok
              ? `Take ok: ${result.identifier} (${result.status})`
              : `Take skipped/failed: ${result.message}`,
          );
        })
        .catch((err) => {
          console.error("Take error:", err);
        });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Webhook error:", message);
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
  });

  const shutdown = () => {
    console.log("Shutting down lab serve…");
    ctx.ledger.close();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen(port, () => {
    console.log(`lab serve listening on http://127.0.0.1:${port}${path}`);
    console.log(`Triggers: ${triggers.join(", ")}`);
    console.log(`Label gate: ${ctx.config.linear.triggerLabel}`);
    console.log("");
    console.log("Local demo: run ngrok/cloudflared to this port, then register");
    console.log("a Linear webhook for Comment events pointing at that URL.");
    console.log("Or use: npm run lab -- poll   (no public URL needed)");
  });
}

function verifyLinearSignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): void {
  if (!signature) {
    throw new Error("Missing Linear-Signature header");
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid Linear webhook signature");
  }
}
