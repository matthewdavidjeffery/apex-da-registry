---
name: da-manifest-reader
description: >
  Use this skill whenever an agent needs to understand the Salesforce DA
  (Data Access) layer — method signatures, SObject dependencies, or
  cross-DA relationships — without connecting to a Salesforce org or
  downloading Apex metadata. Triggers: any question about DA methods,
  which DA handles a given SObject, what a DA returns, or how DAs
  relate to each other. Also triggers for: "which DA", "how do I call",
  "what does X return", "what consumes", "which classes touch",
  "DA for Account/Contact/etc", or "code stub for". The manifest is
  the source of truth. Do NOT use for questions about Apex unrelated to
  the DA layer, Salesforce configuration, or Flow/LWC concerns.
---

## Naming Convention

DA sets follow the pattern `{TEAM}_{Object}DA` with these suffixes:

| Class | Suffix | Example |
|-------|--------|---------|
| Implementation | (none) | `TEAM_AccountDA` |
| Interface | `I` | `TEAM_AccountDAI` |
| Mock | `Mock` | `TEAM_AccountDAMock` |
| Test | `Test` | `TEAM_AccountDATest` |

When resolving a method signature, always prefer the **interface class**
(`DAI`) as canonical. The implementation may contain private helper methods
not on the interface — those are internal and should not be referenced by
consuming code.

## Locating the Manifest

Read `da-manifest.json` from the repository root. If it is not present
locally, use the GitHub MCP to fetch it from the `docs/` path or the
repo root. The file is the authoritative source — do not infer DA behavior
from class names alone.

## What the Manifest Contains

- Full method signatures (name, return type, parameters, visibility)
- Annotations (`@AuraEnabled`, etc.)
- Which SObjects each method touches
- Cross-DA dependency graph (which DAs call which)

## How to Answer Queries

**Finding a DA for a given SObject**
Search `dependencies.sObjects` arrays across all entries for the object name.

**Checking a method signature**
Navigate: `dataAccessClasses[].methods[]` — filter by `name`.

**Understanding dependencies**
- `dependencies.consumes` → DAs this class calls internally
- `dependencies.consumedBy` → DAs that depend on this class
- Reference `docs/DEPENDENCY_GRAPH.md` for visual layout

## Response Style

- Lead with the direct answer, then supporting detail
- For method signatures:
    DA Class: TEAM_AccountDA
    Method:   getById(Id recordId): Account
    Annotations: @AuraEnabled
- For code stubs, use valid Apex syntax
- For call chains, show each step in order with the DA and method
- Keep responses concise — developers are mid-task

## Resolving Ambiguity

- If a method exists on both the interface and mock, the interface is canonical
- Mock implementations may omit SObject references — use implementation class
  data for `objectReferences`, interface data for method signatures
- Test classes are cataloged for coverage awareness only; do not treat their
  helper methods as part of the public API
- A `complete: false` entry means the DA set is missing one or more classes —
  check the `missing` array before relying on that entry

## What This Skill Cannot Answer

- Which specific fields a query returns (not in the manifest)
- Governor limit or performance implications
- Anything outside the DA layer (triggers, LWC, Flow, etc.)

For those, check the class source directly or run a Salesforce org describe.
