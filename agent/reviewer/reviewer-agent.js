import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import { formatComment } from "./comment-formatter.js";

const client = new Anthropic();

const REVIEWER_SYSTEM = `
You are a Salesforce Apex DA layer code reviewer. You will be given:
1. The changed files in a pull request (class bodies as text)
2. The current da-manifest.json contents
3. The DA naming convention

DA class sets follow this pattern:
  TEAM_{Object}DA      → Implementation
  TEAM_{Object}DAI     → Interface (canonical source of truth)
  TEAM_{Object}DAMock  → Mock implementation
  TEAM_{Object}DATest  → Test class

Your job is to perform four checks for each DA set touched in the PR:

INTERFACE PARITY CHECK
- Parse all method signatures from the DAI (interface) class
- Verify each signature exists in the DA (implementation) class
- Flag any methods in DA not present on DAI

MOCK PARITY CHECK
- Every method on DAI must have a matching stub in DAMock
- Match on method name and parameter count; return type must match exactly

MANIFEST DRIFT CHECK
- Compare DAI method signatures against the manifest entry for this DA
- Flag if manifest is missing methods or has stale signatures

TEST COVERAGE SHAPE CHECK
- Count @isTest annotated methods in DATest
- Count methods on the interface
- Flag if test count is less than interface method count (warning only)

CALLER IMPACT
- From the manifest, read consumedBy for any DA whose interface changed
- List the consuming DAs and which methods they use

Respond ONLY with a JSON object in this exact shape:
{
  "daName": "TEAM_AccountDA",
  "checks": {
    "interfaceParity": {
      "pass": false,
      "errors": ["getByOwnerId missing from implementation"]
    },
    "mockParity": {
      "pass": false,
      "errors": ["getByOwnerId missing from mock"]
    },
    "manifestDrift": {
      "pass": true,
      "errors": []
    },
    "testCoverageShape": {
      "pass": false,
      "warnings": ["2 test methods for 4 interface methods"],
      "uncoveredMethods": ["getByOwnerId", "upsertRecord"]
    }
  },
  "callerImpact": [
    { "da": "TEAM_OpportunityDA", "usedMethods": ["getById", "getByOwnerId"] }
  ],
  "blocksMerge": true
}
`.trim();

async function runReviewer() {
  const {
    GITHUB_TOKEN, PR_NUMBER, REPO_OWNER,
    REPO_NAME, BASE_SHA, HEAD_SHA
  } = process.env;

  const manifestPath = process.env.MANIFEST_PATH || path.resolve(process.cwd(), "da-manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

  const conversationHistory = [{
    role: "user",
    content: `
Please review this pull request for DA layer compliance.

PR: ${REPO_OWNER}/${REPO_NAME}#${PR_NUMBER}
Base SHA: ${BASE_SHA}
Head SHA: ${HEAD_SHA}

Current manifest:
\`\`\`json
${JSON.stringify(manifest, null, 2)}
\`\`\`

Steps:
1. Use GitHub tools to get the list of changed files in this PR
2. Filter to files matching TEAM_*DA*.cls
3. For each DA set found, fetch all four class bodies from the PR branch
4. Run all four checks
5. Return results as the specified JSON

Begin.
    `.trim()
  }];

  let result = null;
  let continueLoop = true;

  while (continueLoop) {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: REVIEWER_SYSTEM,
      messages: conversationHistory,
      mcp_servers: [{
        type: "url",
        url: process.env.GITHUB_MCP_URL || "https://api.githubcopilot.com/mcp/",
        name: "github",
        authorization_token: GITHUB_TOKEN
      }]
    });

    conversationHistory.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const text = response.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");

      const jsonMatch = text.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch) result = JSON.parse(jsonMatch[1]);
      continueLoop = false;

    } else if (response.stop_reason !== "tool_use") {
      continueLoop = false;
    }
  }

  if (result) {
    await postPRComment(result, GITHUB_TOKEN, REPO_OWNER, REPO_NAME, PR_NUMBER);

    if (result.blocksMerge) {
      console.error("DA review failed — blocking merge.");
      process.exit(1);
    }
  }
}

async function postPRComment(result, token, owner, repo, prNumber) {
  const body = formatComment(result);
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: token });

  const comments = await octokit.issues.listComments({
    owner, repo, issue_number: prNumber
  });

  const existing = comments.data.find(c =>
    c.body.startsWith("## DA Layer Review")
  );

  if (existing) {
    await octokit.issues.updateComment({
      owner, repo, comment_id: existing.id, body
    });
  } else {
    await octokit.issues.createComment({
      owner, repo, issue_number: prNumber, body
    });
  }
}

runReviewer().catch(console.error);
