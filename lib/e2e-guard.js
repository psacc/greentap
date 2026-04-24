/**
 * E2E guard — prevents greentap from touching any chat other than the
 * sandbox while GREENTAP_E2E=1. Opt-in via env var; zero overhead when off.
 *
 * Two enforcement shapes:
 *   - assertE2EAllowed(chatName): for commands that target a specific chat
 *     (read, send, navigateToChat, pollResults, etc). Throws on mismatch.
 *   - filterToSandbox(rows, nameKey): for list-returning commands
 *     (chats, unread, search). Strips non-sandbox rows in E2E mode.
 */

const DEFAULT_SANDBOX = "greentap-sandbox";

export function isE2EMode() {
  return process.env.GREENTAP_E2E === "1";
}

function allowedChat() {
  return process.env.GREENTAP_E2E_CHAT || DEFAULT_SANDBOX;
}

export function assertE2EAllowed(chatName) {
  if (!isE2EMode()) return;
  const allowed = allowedChat();
  if (chatName !== allowed) {
    throw new Error(
      `E2E mode: chat '${chatName}' not allowed; only '${allowed}'`,
    );
  }
}

export function filterToSandbox(rows, nameKey = "name") {
  if (!isE2EMode()) return rows;
  const allowed = allowedChat();
  return rows.filter((r) => r && r[nameKey] === allowed);
}

/**
 * Single source of truth for chat-targeting commands in lib/commands.js
 * that MUST call assertE2EAllowed. The enforcement test iterates this list.
 *
 * When adding a new chat-targeting command: add its exported name here
 * and call assertE2EAllowed at its entry point. CONTRIBUTING.md documents
 * this as a code-review checklist item.
 */
export const GUARDED_COMMANDS = Object.freeze([
  "navigateToChat",
  "read",
  "send",
  "pollResults",
]);
