---
name: da-generator
description: >
  Use this skill when a developer wants to create a new DA class set for a
  Salesforce object. Triggers: "scaffold a DA for", "generate a DA for",
  "create a DA for", "I need a DA for", "new DA", or any request to add a
  new TEAM_{Object}DA set to the codebase. Do NOT use for modifying existing
  DA classes, asking questions about existing DAs, or non-DA Apex scaffolding.
---

## What This Skill Does

Guides developers through a structured interview to define a new DA class set,
then generates all four classes (DAI, DA, DAMock, DATest), pushes them to a
feature branch, and opens a PR — which triggers the Reviewer automatically.

## Required MCPs

This skill uses:
- **Salesforce MCP** — to describe object fields (real field API names for SOQL)
- **GitHub MCP** — to push files to a feature branch and open a PR

Both MCPs must be configured in the parent repo's Claude Code settings before
invoking this skill.

## Workflow

### Phase 1 — Object Confirmation
- Ask the developer to confirm the SObject API name
- Use the Salesforce MCP describe tool to fetch the object's field list
- Present the fields grouped by type (Id/lookup, text, picklist, date, number)
- Confirm the object is correct before proceeding

### Phase 2 — Method Definition (loop until developer says done)
For each method, ask:
- Operation type: query (single), query (list), upsert, delete, count
- If query: which field to filter on? (show field list)
- If query: which fields to return? (offer: all, commonly-used subset, or
  let developer pick from the list)
- `@AuraEnabled`? If yes, `cacheable=true` or `false`?
- Any additional methods? → repeat or move to Phase 3

### Phase 3 — Confirmation
Show a clean summary of the planned interface:
```
getById(Id recordId): Project__c          [@AuraEnabled(cacheable=true)]
getByStatus(String status): List<Project__c>
upsertRecord(Project__c record): void
```
Ask: "Does this look right, or would you like to change anything?"
Only proceed to generation after explicit confirmation.

### Phase 4 — Generation and Push

Generate all four class files following existing codebase conventions.
Use real field API names from the describe result in SOQL.
For mocks, return empty collections or minimal test fixture data.
For tests, create one `@isTest` method per interface method.

After generating, use the **GitHub MCP tools** to:
1. Create branch: `feature/TEAM_{Object}DA`
2. Push all four `.cls` files to `force-app/main/default/classes/`
3. Read `da-manifest.json`, add the new DA entry, push the updated manifest
4. Open a pull request with a description listing all generated methods

## What Gets Generated

| File | Contents |
|------|----------|
| `TEAM_{Object}DAI` | Interface with all confirmed method signatures |
| `TEAM_{Object}DA` | Implementation with SOQL using real field names |
| `TEAM_{Object}DAMock` | Stubs returning empty collections or test fixtures |
| `TEAM_{Object}DATest` | One `@isTest` method per interface method |

## Rules

- Never skip the confirmation phase
- Never guess field API names — always use describe results
- Match annotation style to existing DAs in the codebase (inferred from manifest)
- Generated SOQL should SELECT only the fields the developer confirmed
- Mock stubs must match interface return types exactly
- Test class must have `@isTest` on the class and each test method
- One DA set per run — if the developer mentions multiple objects, handle them sequentially
