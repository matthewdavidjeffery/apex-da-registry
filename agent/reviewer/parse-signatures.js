import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { select } from "xpath";
import { tmpdir } from "os";
import { join } from "path";

// ─── PMD AST Extraction ───────────────────────────────────────────────────────

/**
 * Runs `pmd ast-dump` on a .cls source string and returns the XML AST.
 * Writes to a temp file since PMD requires a file path.
 *
 * @param {string} apexSource - Raw .cls file content
 * @param {string} label      - Used for temp filename only
 * @returns {string} Raw XML AST string
 */
export function getAstXml(apexSource, label = "apex_class") {
  const tmpPath = join(tmpdir(), `${label}_${Date.now()}.cls`);

  try {
    writeFileSync(tmpPath, apexSource, "utf8");

    const xml = execSync(
      `pmd ast-dump --file "${tmpPath}" --language apex --format xml`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }
    );

    return xml;
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

// ─── XPath Extractors ─────────────────────────────────────────────────────────

function getMethodNodes(doc) {
  return select("//MethodDeclaration", doc);
}

/**
 * Extracts annotation strings from a MethodDeclaration node.
 * Handles both bare @AuraEnabled and @AuraEnabled(cacheable=true) forms.
 */
function extractAnnotations(methodNode) {
  const annotNodes = select("Annotation", methodNode);
  return annotNodes.map(a => {
    const name = a.getAttribute("Image");
    const pairs = select("AnnotationMemberValuePair", a);

    if (pairs.length === 0) return `@${name}`;

    const args = pairs.map(p => {
      const key = p.getAttribute("Image");
      const val = p.childNodes[0]?.getAttribute("Image") ?? "true";
      return `${key}=${val}`;
    }).join(", ");

    return `@${name}(${args})`;
  });
}

/**
 * Reconstructs a full type string from a type node,
 * handling generics like List<Account>, Map<Id, List<Contact>>.
 */
function extractTypeString(typeNode) {
  if (!typeNode) return "void";
  if (typeNode.nodeName === "VoidResult") return "void";

  if (typeNode.nodeName === "ResultType") {
    const inner = typeNode.childNodes[0];
    if (!inner) return "void";
    return extractTypeString(inner);
  }

  const baseName = typeNode.getAttribute("Image");
  const typeArgs = select("TypeArguments/ClassOrInterfaceType", typeNode);

  if (typeArgs.length === 0) return baseName;

  const args = typeArgs.map(extractTypeString).join(", ");
  return `${baseName}<${args}>`;
}

/**
 * Extracts formal parameters from a MethodDeclarator node.
 */
function extractParameters(methodNode) {
  const paramNodes = select(
    "MethodDeclarator/FormalParameters/FormalParameter",
    methodNode
  );

  return paramNodes.map(param => {
    const typeNode = select("Type/ClassOrInterfaceType", param)[0]
                  ?? select("Type/PrimitiveType", param)[0];
    const nameNode = select("VariableDeclaratorId", param)[0];

    return {
      name: nameNode?.getAttribute("Image") ?? "",
      type: typeNode ? extractTypeString(typeNode) : "Object"
    };
  });
}

/**
 * Extracts visibility modifier from a MethodDeclaration node.
 */
function extractVisibility(methodNode) {
  const modifiers = select("MethodDeclarator/../Modifier", methodNode);
  const vis = ["public", "global", "private", "protected"];
  for (const mod of modifiers) {
    const img = mod.getAttribute("Image")?.toLowerCase();
    if (vis.includes(img)) return img;
  }
  return "";
}

// ─── SObject Reference Detection ─────────────────────────────────────────────

const PRIMITIVES = new Set([
  "Id", "String", "Boolean", "Integer", "Long", "Decimal",
  "Double", "Date", "Datetime", "Time", "Blob", "Object"
]);

const COLLECTION_WRAPPERS = new Set(["List", "Map", "Set"]);

/**
 * Heuristically identifies SObject API names from a list of type strings.
 * Custom objects end in __c, __r, __mdt, __e, __b.
 * Standard objects are matched against the caller-provided knownSObjects set.
 *
 * @param {string[]} types
 * @param {Set<string>} knownSObjects - standard SObject names from manifest or describe
 * @returns {string[]}
 */
export function extractSObjectReferences(types, knownSObjects = new Set()) {
  const sObjects = new Set();

  for (const type of types) {
    const tokens = type
      .replace(/[<>]/g, " ")
      .split(/[\s,]+/)
      .map(t => t.trim())
      .filter(Boolean);

    for (const token of tokens) {
      if (PRIMITIVES.has(token)) continue;
      if (COLLECTION_WRAPPERS.has(token)) continue;
      if (token.includes(".")) continue;

      if (/__(c|r|mdt|e|b|share|history|feed)$/i.test(token)) {
        sObjects.add(token);
        continue;
      }

      if (knownSObjects.has(token)) {
        sObjects.add(token);
      }
    }
  }

  return [...sObjects];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Full pipeline: raw Apex source → structured method signatures.
 * Uses PMD ast-dump for parsing — no LLM required.
 *
 * @param {string} apexSource
 * @param {string} sourceType  - "interface" | "implementation" | "mock"
 * @param {Set<string>} knownSObjects
 * @returns {Array<MethodSignature>}
 */
export function parseApexClass(apexSource, sourceType = "interface", knownSObjects = new Set()) {
  const xml = getAstXml(apexSource, sourceType);
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const methodNodes = getMethodNodes(doc);

  return methodNodes.map(node => {
    const name        = node.getAttribute("Image");
    const annotations = extractAnnotations(node);
    const visibility  = extractVisibility(node);
    const isStatic    = select("count(MethodDeclarator/../Modifier[@Image='static'])", node) > 0;
    const parameters  = extractParameters(node);

    const resultTypeNode = select("ResultType", node)[0];
    const returnType     = extractTypeString(resultTypeNode);

    const allTypes = [returnType, ...parameters.map(p => p.type)];
    const sObjectReferences = extractSObjectReferences(allTypes, knownSObjects);

    return {
      name,
      visibility,
      isStatic,
      returnType,
      parameters,
      annotations,
      sObjectReferences
    };
  });
}

// ─── Diff Utilities ───────────────────────────────────────────────────────────

/**
 * Returns methods present in expected (interface) but missing from actual.
 * Matches on name + parameter count.
 */
export function findMissingMethods(expected, actual) {
  return expected.filter(exp =>
    !actual.find(act =>
      act.name === exp.name &&
      act.parameters.length === exp.parameters.length
    )
  );
}

/**
 * Returns methods in actual not present in expected (interface).
 * These are impl-only methods — flagged as warnings.
 */
export function findExtraMethods(expected, actual) {
  return actual.filter(act =>
    !expected.find(exp =>
      exp.name === act.name &&
      exp.parameters.length === act.parameters.length
    )
  );
}

/**
 * Returns methods that exist in both but have mismatched return types.
 */
export function findReturnTypeMismatches(interfaceMethods, actualMethods) {
  return interfaceMethods.reduce((acc, iMethod) => {
    const match = actualMethods.find(m =>
      m.name === iMethod.name &&
      m.parameters.length === iMethod.parameters.length
    );
    if (match && match.returnType !== iMethod.returnType) {
      acc.push({
        method: iMethod.name,
        expected: iMethod.returnType,
        actual: match.returnType
      });
    }
    return acc;
  }, []);
}
