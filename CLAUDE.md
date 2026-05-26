# apex-da-registry

Salesforce DA (Data Access) layer tooling — cataloger, reviewer, copilot, and generator.
Designed to be added as a git submodule inside a Salesforce project repo.

## Skills

Two Claude Code skills are available in `.claude/skills/`:

| Skill | Trigger | Description |
|-------|---------|-------------|
| `da-manifest-reader` | Questions about DA methods, SObjects, dependencies | Answers DA layer questions from `da-manifest.json` without an org connection |
| `da-generator` | "scaffold/generate/create a DA for X" | Guides DA class set creation end-to-end using Salesforce + GitHub MCPs |

To make these skills available in the parent repo, add this line to the parent's `CLAUDE.md`:

```
@<submodule-path>/CLAUDE.md
```

Where `<submodule-path>` is the directory where this repo is checked out (e.g., `@registry/CLAUDE.md`).

## Required MCP Configuration

The parent repo's Claude Code settings must have **both** of these MCPs configured:

| MCP name | Used by |
|----------|---------|
| Salesforce MCP | `da-generator` — describes object fields for SOQL generation |
| GitHub MCP | `da-generator` — creates branches, pushes files, opens PRs |

The `da-manifest-reader` skill reads `da-manifest.json` locally and does not require any MCP.

## Required Environment Variables

Set these in the parent repo's environment (shell, `.env`, or CI secrets).
The agent scripts read them via `process.env` — no config files inside this submodule are needed.

| Variable | Required by | Purpose |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | all agents | Claude API authentication |
| `GITHUB_TOKEN` | cataloger, reviewer, generator | GitHub API / MCP auth |
| `REPO_OWNER` | cataloger, copilot, generator | GitHub org or user name |
| `REPO_NAME` | cataloger, copilot, generator | GitHub repository name |
| `REPO_BRANCH` | cataloger, copilot, generator | Branch to read manifest from (default: `main`) |
| `SF_MCP_URL` | cataloger, generator | Salesforce MCP server URL |
| `SF_MCP_TOKEN` | cataloger, generator | Salesforce MCP access token |
| `GITHUB_MCP_URL` | cataloger, reviewer, generator | GitHub MCP URL (default: `https://api.githubcopilot.com/mcp/`) |
| `MANIFEST_PATH` | cataloger, reviewer, copilot | Absolute path to `da-manifest.json` (default: `<cwd>/da-manifest.json`) |
| `PR_NUMBER` | reviewer | PR number being reviewed |
| `BASE_SHA` | reviewer | Base commit SHA for diff |
| `HEAD_SHA` | reviewer | Head commit SHA for diff |

`GITHUB_MCP_URL` defaults to the GitHub Copilot MCP endpoint. Override if your team
runs a self-hosted GitHub MCP server.

`MANIFEST_PATH` defaults to `da-manifest.json` in the directory where the command is
run (the parent repo root when invoked from there). Set it explicitly if needed.

## Agent Scripts

Run these from the **parent repo root** after installing dependencies:

```bash
# Install dependencies
cd <submodule-path>/agent && npm install
cd <submodule-path>/agent/reviewer && npm install

# Catalog all DA classes from the org → da-manifest.json
node <submodule-path>/agent/da-cataloger.js

# Ask questions about the DA layer
node <submodule-path>/agent/developer-copilot.js "which DA handles Opportunity?"

# Generate a new DA class set interactively
node <submodule-path>/agent/generator-agent.js

# Run the PR reviewer (CI usage)
node <submodule-path>/agent/reviewer/reviewer-agent.js
```

See `<submodule-path>/agent/.env.example` for the full variable reference.
