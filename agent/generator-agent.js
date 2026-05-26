import Anthropic from "@anthropic-ai/sdk";
import readline from "readline";

const client = new Anthropic();

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(manifest) {
  const existingDAs = manifest.dataAccessClasses ?? [];
  const conventions = extractConventions(existingDAs);

  return `
You are a Salesforce Apex DA (Data Access) layer generator. You scaffold new
DA class sets following established patterns in the codebase.

DA NAMING CONVENTION:
  TEAM_{Object}DA      → Implementation
  TEAM_{Object}DAI     → Interface
  TEAM_{Object}DAMock  → Mock
  TEAM_{Object}DATest  → Test class

CODEBASE CONVENTIONS (inferred from existing DAs):
${JSON.stringify(conventions, null, 2)}

YOUR WORKFLOW — follow these phases in order:

PHASE 1 — OBJECT CONFIRMATION
- Ask the developer to confirm the SObject API name
- Use the Salesforce MCP describe tool to fetch the object's field list
- Present the fields grouped by type (Id/lookup, text, picklist, date, number)
- Confirm the object is correct before proceeding

PHASE 2 — METHOD DEFINITION (loop until developer says done)
For each method, ask:
  a) Operation type: query (single), query (list), upsert, delete, count
  b) If query: which field to filter on? (show field list)
  c) If query: which fields to return? (offer: all, commonly-used subset, or
     let developer pick from the list)
  d) @AuraEnabled? If yes, cacheable=true or false?
  e) Any additional methods? → repeat or move to Phase 3

PHASE 3 — CONFIRMATION
- Show a clean summary of the planned interface:
    getById(Id recordId): Project__c          [@AuraEnabled(cacheable=true)]
    getByStatus(String status): List<Project__c>
    upsertRecord(Project__c record): void
- Ask: "Does this look right, or would you like to change anything?"
- Only proceed to generation after explicit confirmation

PHASE 4 — GENERATION
Generate all four class files following the codebase conventions above.
Use real field API names from the describe result in SOQL.
For mocks, return empty collections or minimal test fixture data.
For tests, create one @isTest method per interface method.

After generating, use the GitHub MCP tools to:
1. Create branch: feature/TEAM_{Object}DA
2. Push all four .cls files to force-app/main/default/classes/
3. Update da-manifest.json with the new DA entry
4. Open a pull request with a description listing all generated methods

RULES:
- Never skip the confirmation phase
- Never guess field API names — always use describe results
- Match annotation style to existing DAs in the codebase
- Generated SOQL should SELECT only the fields the developer confirmed
- Mock stubs must match interface return types exactly
- Test class must have @isTest on the class and each test method
- One DA set per run — if the developer mentions multiple objects, handle them sequentially
`.trim();
}

// ─── Convention Extraction ────────────────────────────────────────────────────

/**
 * Infers coding conventions from existing DA entries in the manifest.
 * Passed to the generator so generated code matches existing codebase style.
 */
function extractConventions(existingDAs) {
  if (existingDAs.length === 0) {
    return {
      teamPrefix: "TEAM",
      defaultAnnotations: ["@AuraEnabled"],
      mockReturnStyle: "empty-collection",
      note: "No existing DAs found — using defaults"
    };
  }

  // Infer team prefix from first DA name
  const firstDA = existingDAs[0];
  const prefixMatch = firstDA.name.match(/^(\w+)_/);
  const teamPrefix = prefixMatch?.[1] ?? "TEAM";

  // Count annotation usage across all methods
  const allMethods = existingDAs.flatMap(da => da.methods ?? []);
  const auraEnabledCount = allMethods.filter(m =>
    m.annotations?.some(a => a.includes("AuraEnabled"))
  ).length;
  const auraEnabledRatio = allMethods.length > 0
    ? auraEnabledCount / allMethods.length
    : 0;

  const cacheableCount = allMethods.filter(m =>
    m.annotations?.some(a => a.includes("cacheable=true"))
  ).length;

  return {
    teamPrefix,
    auraEnabledByDefault: auraEnabledRatio > 0.5,
    cacheableByDefault: cacheableCount > auraEnabledCount / 2,
    existingDACount: existingDAs.length,
    exampleDAName: firstDA.name
  };
}

// ─── Manifest Loading ─────────────────────────────────────────────────────────

async function loadManifest() {
  if (process.env.MANIFEST_PATH) {
    const { readFile } = await import("fs/promises");
    const raw = await readFile(process.env.MANIFEST_PATH, "utf8");
    return JSON.parse(raw);
  }

  const { GITHUB_TOKEN, REPO_OWNER, REPO_NAME, REPO_BRANCH = "main" } = process.env;
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/da-manifest.json`;

  const res = await fetch(url, {
    headers: GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch manifest: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ─── Interactive Runner ───────────────────────────────────────────────────────

async function runGenerator(manifest) {
  const systemPrompt = buildSystemPrompt(manifest);
  const conversationHistory = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\nGenerator > "
  });

  console.log("\nDA Generator — scaffolds new TEAM_{Object}DA class sets");
  console.log("Connects to your Salesforce org to inspect field metadata.");
  console.log('Type "exit" to quit.\n');

  // Agent leads the conversation
  await agentTurn(
    "Hello! I'll help you scaffold a new DA class set. Which Salesforce object do you need a DA for?",
    conversationHistory,
    systemPrompt
  );

  rl.prompt();

  rl.on("line", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed.toLowerCase() === "exit") { rl.close(); return; }

    await agentTurn(trimmed, conversationHistory, systemPrompt);
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye.");
    process.exit(0);
  });
}

async function agentTurn(userMessage, conversationHistory, systemPrompt) {
  conversationHistory.push({ role: "user", content: userMessage });

  let continueLoop = true;

  while (continueLoop) {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: conversationHistory,
      mcp_servers: [
        {
          type: "url",
          url: process.env.SF_MCP_URL,
          name: "salesforce",
          authorization_token: process.env.SF_MCP_TOKEN
        },
        {
          type: "url",
          url: process.env.GITHUB_MCP_URL || "https://api.githubcopilot.com/mcp/",
          name: "github",
          authorization_token: process.env.GITHUB_TOKEN
        }
      ]
    });

    conversationHistory.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const text = response.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      if (text) console.log(`\n${text}`);
      continueLoop = false;

    } else if (response.stop_reason === "tool_use") {
      // Print any partial text while tools are running
      const partialText = response.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      if (partialText) console.log(`\n${partialText}`);

    } else {
      continueLoop = false;
    }
  }
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

  await runGenerator(manifest);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
