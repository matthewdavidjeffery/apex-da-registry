import Anthropic from "@anthropic-ai/sdk";
import readline from "readline";

const client = new Anthropic();

// ─── Manifest Loading ─────────────────────────────────────────────────────────

/**
 * Fetches the manifest from GitHub raw content URL.
 * Falls back to local file if MANIFEST_PATH env var is set.
 */
async function loadManifest() {
  // Local override for development
  if (process.env.MANIFEST_PATH) {
    const { readFile } = await import("fs/promises");
    const raw = await readFile(process.env.MANIFEST_PATH, "utf8");
    return JSON.parse(raw);
  }

  const { GITHUB_TOKEN, REPO_OWNER, REPO_NAME, REPO_BRANCH = "main" } = process.env;

  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/da-manifest.json`;

  const res = await fetch(url, {
    headers: GITHUB_TOKEN
      ? { Authorization: `Bearer ${GITHUB_TOKEN}` }
      : {}
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch manifest: ${res.status} ${res.statusText}\nURL: ${url}`);
  }

  return res.json();
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(manifest) {
  return `
You are a Salesforce Apex DA (Data Access) layer assistant. You help developers
understand and use the DA layer in their codebase without needing to read the
source classes directly.

DA NAMING CONVENTION:
  TEAM_{Object}DA      → Implementation class
  TEAM_{Object}DAI     → Interface (canonical — always reference this)
  TEAM_{Object}DAMock  → Mock for test contexts
  TEAM_{Object}DATest  → Test class

WHAT YOU CAN ANSWER:
1. Discovery — which DA handles a given SObject or operation
2. Signatures — exact method signatures, parameters, return types, annotations
3. Call chains — which DAs to use together for a multi-object operation
4. Impact — what consumes a given DA, what would be affected by a change
5. Code stubs — generate correctly-typed Apex call stubs using real signatures

WHAT YOU CANNOT ANSWER:
- Field-level details not in the manifest (e.g. which fields getById queries)
- Whether a DA method exists in a specific API version
- Runtime behavior or governor limit implications
When asked something outside your scope, say so clearly and suggest checking
the class directly or running a Salesforce describe.

RESPONSE STYLE:
- Lead with the direct answer, then supporting detail
- For method signatures, always use this format:
    DA Class: TEAM_AccountDA
    Method:   getById(Id recordId): Account
    Annotations: @AuraEnabled
- For code stubs, use valid Apex syntax
- For call chains, show each step in order with the DA and method
- Keep responses concise — developers are mid-task

CURRENT DA MANIFEST:
\`\`\`json
${JSON.stringify(manifest, null, 2)}
\`\`\`
  `.trim();
}

// ─── Query Handler ────────────────────────────────────────────────────────────

async function query(userMessage, conversationHistory, systemPrompt) {
  conversationHistory.push({ role: "user", content: userMessage });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: conversationHistory
  });

  const assistantMessage = response.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  conversationHistory.push({ role: "assistant", content: assistantMessage });

  return assistantMessage;
}

// ─── Modes ────────────────────────────────────────────────────────────────────

/**
 * Single-query mode: node developer-copilot.js "which DA handles Account?"
 */
async function runSingleQuery(manifest, question) {
  const systemPrompt = buildSystemPrompt(manifest);
  const answer = await query(question, [], systemPrompt);
  console.log(answer);
}

/**
 * Interactive REPL mode: node developer-copilot.js
 */
async function runInteractive(manifest) {
  const systemPrompt = buildSystemPrompt(manifest);
  const conversationHistory = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\nDA Copilot > "
  });

  const daCount = manifest.dataAccessClasses?.length ?? 0;
  const generated = manifest.generated
    ? new Date(manifest.generated).toLocaleDateString()
    : "unknown";

  console.log(`\nDA Copilot — ${daCount} DA classes loaded (manifest: ${generated})`);
  console.log('Ask anything about the DA layer. Type "exit" to quit.\n');

  rl.prompt();

  rl.on("line", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed.toLowerCase() === "exit") { rl.close(); return; }

    try {
      const answer = await query(trimmed, conversationHistory, systemPrompt);
      console.log(`\n${answer}`);
    } catch (err) {
      console.error(`\nError: ${err.message}`);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye.");
    process.exit(0);
  });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main() {
  let manifest;

  try {
    manifest = await loadManifest();
  } catch (err) {
    console.error(`Failed to load DA manifest: ${err.message}`);
    console.error("Set MANIFEST_PATH for local file, or REPO_OWNER/REPO_NAME for GitHub.");
    process.exit(1);
  }

  const singleQuery = process.argv[2];

  if (singleQuery) {
    await runSingleQuery(manifest, singleQuery);
  } else {
    await runInteractive(manifest);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
