-----

## name: da-generator
description: >
Use this skill when a developer wants to create a new DA class set for a
Salesforce object. Triggers: “scaffold a DA for”, “generate a DA for”,
“create a DA for”, “I need a DA for”, “new DA”, or any request to add a
new TEAM_{Object}DA set to the codebase. Do NOT use for modifying existing
DA classes, asking questions about existing DAs, or non-DA Apex scaffolding.

# DA Generator Skill

## What This Agent Does

Guides developers through a structured interview to define a new DA class set,
then generates all four classes (DAI, DA, DAMock, DATest), pushes them to a
feature branch, and opens a PR — which triggers the Reviewer automatically.

## How to Invoke

```bash
cd agent
npm run generate
```

## What to Expect

The agent leads a four-phase conversation:

**Phase 1 — Object confirmation**
Confirm the SObject API name. The agent fetches the field list from your org
so all generated SOQL uses real field API names.

**Phase 2 — Method definition**
For each method you need, the agent asks:

- Operation type (query single, query list, upsert, delete, count)
- Which field to filter on (for queries)
- Which fields to return (all, common subset, or your choice)
- Whether to add @AuraEnabled / cacheable=true

Repeat until you have all the methods you need.

**Phase 3 — Confirmation**
Reviews the planned interface with you before generating anything.
You can revise at this point.

**Phase 4 — Generation and push**
Generates all four .cls files, pushes to a feature branch, updates
da-manifest.json, and opens a PR. The DA Reviewer runs automatically on the PR.

## What Gets Generated

|File                 |Contents                                          |
|---------------------|--------------------------------------------------|
|`TEAM_{Object}DAI`   |Interface with all confirmed method signatures    |
|`TEAM_{Object}DA`    |Implementation with SOQL using real field names   |
|`TEAM_{Object}DAMock`|Stubs returning empty collections or test fixtures|
|`TEAM_{Object}DATest`|One @isTest method per interface method           |

## Environment Requirements

Requires:

- `SF_MCP_URL` + `SF_MCP_TOKEN` — Salesforce org connection for field describe
- `GITHUB_TOKEN` + `REPO_OWNER` + `REPO_NAME` — GitHub for branch and PR creation
- `REPO_OWNER` + `REPO_NAME` — to fetch current manifest

See `agent/example.env` for full configuration.

## Notes

- Handles one SObject per session — run again for additional objects
- Generated code matches annotation and style conventions of existing DAs
- The opened PR triggers DA Reviewer automatically — no manual review setup needed