-----

## name: da-developer-copilot
description: >
Use this skill when a developer asks anything about the Salesforce DA
(Data Access) layer — which DA to use, how to call a method, what a method
returns, which DAs depend on each other, or what would be affected by a
change. Triggers: “which DA”, “how do I call”, “what does X return”,
“what consumes”, “which classes touch”, “DA for Account/Contact/etc”,
“code stub for”, or any question about TEAM_*DA* classes. Do NOT use for
questions about Apex unrelated to the DA layer, Salesforce configuration,
or Flow/LWC concerns.

# DA Developer Copilot Skill

## What This Agent Does

Answers questions about the DA layer using `da-manifest.json` as its source
of truth — no org connection or metadata download required.

## How to Invoke

### Interactive (local dev)

```bash
cd agent
npm run copilot
```

### Single question (scripted or Claude Code)

```bash
node agent/developer-copilot.js "which DA handles Opportunity?"
```

### Programmatically (from another agent)

Import and call `runSingleQuery` directly if embedding in a larger workflow.

## Query Types and Examples

**Discovery** — finding the right DA for a job

> “Which DA handles the Contact object?”
> “What DAs touch the Account SObject?”

**Signatures** — exact method details

> “What are the parameters for TEAM_AccountDA.getById?”
> “What does upsertRecord return on OpportunityDA?”

**Call chains** — multi-DA workflows

> “I need contacts for an account plus their owner details”
> “How do I get an Opportunity with its related Account?”

**Impact analysis** — dependency awareness

> “What consumes TEAM_AccountDA?”
> “If I remove getByOwnerId from AccountDAI, what breaks?”

**Code stubs** — ready-to-use Apex

> “Give me a stub for calling ContactDA.getByAccountId”

## What It Cannot Answer

- Which specific fields a query returns (not in the manifest)
- Governor limit or performance implications
- Anything outside the DA layer (triggers, LWC, Flow, etc.)

For those, check the class source directly or run a Salesforce org describe.

## Environment Requirements

Requires one of:

- `REPO_OWNER` + `REPO_NAME` to fetch manifest from GitHub
- `MANIFEST_PATH` to load a local manifest file

See `agent/example.env` for full configuration.