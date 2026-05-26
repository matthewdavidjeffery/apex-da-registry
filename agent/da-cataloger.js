import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";

const client = new Anthropic();

const SYSTEM_PROMPT = `
You are a Salesforce Data Access (DA) layer cataloger. Your job is to:

1. Use the Salesforce MCP tools to introspect Apex classes in the org.
2. Identify DA class sets. Each set consists of four classes sharing a common name:
   - TEAM_{Object}DA      → Implementation
   - TEAM_{Object}DAI     → Interface
   - TEAM_{Object}DAMock  → Mock implementation
   - TEAM_{Object}DATest  → Test class
3. For each DA set, extract:
   - All method signatures from the interface (DAI)
   - Parameter types, return types, annotations
   - Salesforce object references (SObject types used as params/returns)
   - Cross-DA dependencies (where one DA calls another)
4. Output two artifacts:
   A) A structured JSON manifest (da-manifest.json) for agent consumption
   B) Markdown documentation files for a GitHub repo (human-readable)

When introspecting, use the retrieve_apex_class tool to get class bodies.
Use list_apex_classes to enumerate candidate classes.
For SObject references, note the API name of any object used as a parameter or return type.
`.trim();

async function runCataloger() {
  const conversationHistory = [];

  const userMessage = `
Please catalog all DA classes in this Salesforce org.

Steps:
1. List all Apex classes and identify those matching the TEAM_*DA* naming pattern
2. For each DA set found, retrieve and parse the interface class (DAI) to extract method signatures
3. Retrieve the implementation class to identify SObject references and cross-DA calls
4. Build the full manifest and documentation

Begin now.
  `.trim();

  conversationHistory.push({ role: "user", content: userMessage });

  let continueLoop = true;

  while (continueLoop) {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 8096,
      system: SYSTEM_PROMPT,
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
          url: "https://api.githubcopilot.com/mcp/",
          name: "github",
          authorization_token: process.env.GITHUB_TOKEN
        }
      ]
    });

    conversationHistory.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const finalText = response.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");

      await extractAndSaveManifest(finalText);
      continueLoop = false;

    } else if (response.stop_reason === "tool_use") {
      console.log("Agent using tools, continuing...");

    } else {
      continueLoop = false;
    }
  }

  console.log("Cataloging complete.");
}

async function extractAndSaveManifest(responseText) {
  const jsonMatch = responseText.match(/```json\n([\s\S]+?)\n```/);
  if (jsonMatch) {
    const manifest = JSON.parse(jsonMatch[1]);
    await fs.writeFile("../../da-manifest.json", JSON.stringify(manifest, null, 2));
    console.log("Manifest saved to da-manifest.json");
  }
}

runCataloger().catch(console.error);
