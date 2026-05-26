# DA Manifest Consumer Skill

---
name: da-manifest-reader
description: >
  Use this skill whenever an agent needs to understand the Salesforce DA
  (Data Access) layer — method signatures, SObject dependencies, or
  cross-DA relationships — without connecting to a Salesforce org or
  downloading Apex metadata. Triggers: any question about DA methods,
  which DA handles a given SObject, what a DA returns, or how DAs
  relate to each other. The manifest is the source of truth.
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

## What the Manifest Contains

The `da-manifest.json` file (or GitHub `docs/` folder) is the authoritative
reference for all DA classes in the project. It includes:

- Full method signatures (name, return type, parameters, visibility)
- Annotations (@AuraEnabled, etc.)
- Which SObjects each method touches
- Cross-DA dependency graph (which DAs call which)

## How to Read It

### Finding a DA for a given SObject
Search `dependencies.sObjects` arrays across all entries for the object name.

### Checking a method signature
Navigate: `dataAccessClasses[].methods[]` — filter by `name`.

### Understanding dependencies
- `dependencies.consumes` → DAs this class calls internally
- `dependencies.consumedBy` → DAs that depend on this class
- Use the Mermaid graph in `docs/DEPENDENCY_GRAPH.md` for visual reference

## Resolving Ambiguity

- If a method exists on both the interface and mock, the interface is canonical
- Mock implementations may omit SObject references — use implementation class
  data for `objectReferences`, interface data for method signatures
- Test classes are cataloged for coverage awareness only; do not treat their
  helper methods as part of the public API
- A `complete: false` entry means the DA set is missing one or more classes —
  check the `missing` array before relying on that entry

## File Locations

| Artifact | Purpose |
|----------|---------|
| `da-manifest.json` | Machine-readable; use for agent consumption |
| `docs/README.md` | Hyperlinked index of all DA classes |
| `docs/{DAName}.md` | Per-class API reference |
| `docs/DEPENDENCY_GRAPH.md` | Mermaid graph of all relationships |
