import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";

const client = new Anthropic();

const DOCS_SYSTEM = `
You are a technical documentation writer for a Salesforce Apex DA layer.
You will receive a JSON manifest of DA classes and must create:

1. docs/README.md — Index with hyperlinks to each DA class doc
2. docs/{DAName}.md — Per-class API reference page
3. docs/DEPENDENCY_GRAPH.md — Mermaid graph of DA-to-DA and DA-to-SObject relationships

For each method in the API reference, format it like this:

### methodName(param: Type): ReturnType
**Visibility:** public
**Annotations:** @AuraEnabled
**Parameters:**
| Name | Type | Notes |
|------|------|-------|
| recordId | Id | Salesforce record ID |

**Returns:** \`SObject\` — Description of what is returned
**SObjects Touched:** Account, Contact

---

For the dependency graph, use Mermaid flowchart syntax.
Push all files to GitHub using the github MCP tools.
`.trim();

async function writeGitHubDocs(manifestPath, repoOwner, repoName) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 8096,
    system: DOCS_SYSTEM,
    messages: [{
      role: "user",
      content: `Here is the DA manifest. Please generate and push all documentation files to the GitHub repo ${repoOwner}/${repoName}:\n\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\``
    }],
    mcp_servers: [{
      type: "url",
      url: "https://api.githubcopilot.com/mcp/",
      name: "github",
      authorization_token: process.env.GITHUB_TOKEN
    }]
  });

  console.log("Documentation written to GitHub.");
  return response;
}

writeGitHubDocs(
  "../../da-manifest.json",
  process.env.REPO_OWNER,
  process.env.REPO_NAME
).catch(console.error);
