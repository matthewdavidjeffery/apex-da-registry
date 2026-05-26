import {
  extractSObjectReferences,
  findMissingMethods,
  findExtraMethods,
  findReturnTypeMismatches
} from "./parse-signatures.js";

// Note: getAstXml and parseApexClass require PMD on PATH and are
// integration-tested separately. The utilities below are pure functions
// and can be tested without any external dependencies.

// ─── extractSObjectReferences ─────────────────────────────────────────────────

test("identifies custom SObject by __c suffix", () => {
  const result = extractSObjectReferences(["Project__c"]);
  expect(result).toContain("Project__c");
});

test("identifies custom metadata by __mdt suffix", () => {
  const result = extractSObjectReferences(["FeatureFlag__mdt"]);
  expect(result).toContain("FeatureFlag__mdt");
});

test("excludes primitive types", () => {
  const result = extractSObjectReferences(["Id", "String", "Boolean"]);
  expect(result).toHaveLength(0);
});

test("excludes collection wrappers", () => {
  const result = extractSObjectReferences(["List<Account>"]);
  // List is excluded; Account is included if in knownSObjects
  expect(result).not.toContain("List");
});

test("identifies standard SObject from knownSObjects set", () => {
  const known = new Set(["Account", "Contact", "Opportunity"]);
  const result = extractSObjectReferences(["Account"], known);
  expect(result).toContain("Account");
});

test("excludes namespace-qualified system types", () => {
  const result = extractSObjectReferences(["Database.SaveResult", "Schema.SObjectType"]);
  expect(result).toHaveLength(0);
});

test("extracts SObject from nested generic Map<Id, List<Account>>", () => {
  const known = new Set(["Account"]);
  const result = extractSObjectReferences(["Map<Id, List<Account>>"], known);
  expect(result).toContain("Account");
  expect(result).not.toContain("Map");
  expect(result).not.toContain("List");
  expect(result).not.toContain("Id");
});

// ─── findMissingMethods ───────────────────────────────────────────────────────

test("detects a method missing from mock", () => {
  const iface = [
    { name: "getById", parameters: [{ name: "id", type: "Id" }], returnType: "Account" },
    { name: "getAll",  parameters: [], returnType: "List<Account>" }
  ];
  const mock = [
    { name: "getById", parameters: [{ name: "id", type: "Id" }], returnType: "Account" }
  ];
  const missing = findMissingMethods(iface, mock);
  expect(missing).toHaveLength(1);
  expect(missing[0].name).toBe("getAll");
});

test("returns empty array when all methods are present", () => {
  const iface = [
    { name: "getById", parameters: [{ name: "id", type: "Id" }], returnType: "Account" }
  ];
  const impl = [
    { name: "getById", parameters: [{ name: "recordId", type: "Id" }], returnType: "Account" }
  ];
  // param name differs ("id" vs "recordId") but count matches — should pass
  expect(findMissingMethods(iface, impl)).toHaveLength(0);
});

test("matches on parameter count not parameter name", () => {
  const iface = [{ name: "upsert", parameters: [{ name: "rec", type: "Account" }], returnType: "void" }];
  const impl  = [{ name: "upsert", parameters: [{ name: "record", type: "Account" }], returnType: "void" }];
  expect(findMissingMethods(iface, impl)).toHaveLength(0);
});

// ─── findExtraMethods ────────────────────────────────────────────────────────

test("finds private helper method in implementation not on interface", () => {
  const iface = [
    { name: "getById", parameters: [{ name: "id", type: "Id" }] }
  ];
  const impl = [
    { name: "getById",       parameters: [{ name: "id", type: "Id" }] },
    { name: "buildQuery",    parameters: [{ name: "filter", type: "String" }] }
  ];
  const extra = findExtraMethods(iface, impl);
  expect(extra).toHaveLength(1);
  expect(extra[0].name).toBe("buildQuery");
});

// ─── findReturnTypeMismatches ─────────────────────────────────────────────────

test("catches return type mismatch between interface and implementation", () => {
  const iface = [{ name: "getAll", parameters: [], returnType: "List<Account>" }];
  const impl  = [{ name: "getAll", parameters: [], returnType: "Account[]" }];
  const mismatches = findReturnTypeMismatches(iface, impl);
  expect(mismatches).toHaveLength(1);
  expect(mismatches[0].expected).toBe("List<Account>");
  expect(mismatches[0].actual).toBe("Account[]");
});

test("passes when return types match", () => {
  const iface = [{ name: "getCount", parameters: [], returnType: "Integer" }];
  const impl  = [{ name: "getCount", parameters: [], returnType: "Integer" }];
  expect(findReturnTypeMismatches(iface, impl)).toHaveLength(0);
});

test("ignores methods that only exist in one side", () => {
  const iface = [{ name: "getAll", parameters: [], returnType: "List<Account>" }];
  const impl  = [{ name: "getById", parameters: [{ name: "id", type: "Id" }], returnType: "Account" }];
  // No overlap — no mismatches to report
  expect(findReturnTypeMismatches(iface, impl)).toHaveLength(0);
});
