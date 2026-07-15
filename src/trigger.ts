/**
 * Detect Linear comment text that should start lab take
 * (same UX idea as mentioning @Cursor).
 */
export function commentRequestsTake(
  body: string,
  triggers: string[] = ["@lab", "@cursor"],
): boolean {
  const text = body.replace(/\u00a0/g, " ").trim();
  if (!text) return false;

  // Ignore our own bot replies to avoid loops
  if (
    text.includes("🤖 **Agent started**") ||
    text.includes("via `lab take`") ||
    text.includes("via `lab serve`") ||
    text.includes("via `lab poll`") ||
    text.includes("🔗 **PR opened**") ||
    text.includes("✅ **Agent run finished**") ||
    text.includes("❌ **Agent run failed**") ||
    text.includes("Refusing:")
  ) {
    return false;
  }

  const lower = text.toLowerCase();
  if (/\/lab\s+take\b/i.test(text)) return true;

  for (const trigger of triggers) {
    const t = trigger.trim().toLowerCase();
    if (!t) continue;
    // Match whole token: @lab / @Lab / @cursor etc.
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[\\s(,[{])${escaped}\\b`, "i");
    if (re.test(lower)) return true;
  }
  return false;
}
