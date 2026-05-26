import { parseApexClass, findMissingMethods, findExtraMethods, findReturnTypeMismatches } from "./parse-signatures.js";

/**
 * Runs all parity and drift checks for a single DA set.
 *
 * @param {object} classBodies  - { interface, implementation, mock, test }
 * @param {object} manifestEntry - the DA's entry from da-manifest.json (may be null for new DAs)
 * @param {Set<string>} knownSObjects - from manifest for SObject classification
 * @returns {DiffResult}
 */
export async function runChecks(classBodies, manifestEntry, knownSObjects = new Set()) {
  const { interface: ifaceSrc, implementation: implSrc, mock: mockSrc, test: testSrc } = classBodies;

  // Parse all available class bodies
  const ifaceMethods = ifaceSrc
    ? parseApexClass(ifaceSrc, "interface", knownSObjects)
    : [];

  const implMethods = implSrc
    ? parseApexClass(implSrc, "implementation", knownSObjects)
    : [];

  const mockMethods = mockSrc
    ? parseApexClass(mockSrc, "mock", knownSObjects)
    : [];

  // ── Interface Parity ────────────────────────────────────────────────────────
  const interfaceParity = checkInterfaceParity(ifaceMethods, implMethods);

  // ── Mock Parity ─────────────────────────────────────────────────────────────
  const mockParity = checkMockParity(ifaceMethods, mockMethods);

  // ── Manifest Drift ──────────────────────────────────────────────────────────
  const manifestDrift = checkManifestDrift(ifaceMethods, manifestEntry);

  // ── Test Coverage Shape ─────────────────────────────────────────────────────
  const testCoverageShape = checkTestCoverageShape(ifaceMethods, testSrc);

  const blocksMerge = !interfaceParity.pass || !mockParity.pass || !manifestDrift.pass;

  return {
    checks: { interfaceParity, mockParity, manifestDrift, testCoverageShape },
    blocksMerge,
    // Expose parsed interface methods for caller impact lookup
    interfaceMethods: ifaceMethods
  };
}

// ─── Individual Checks ────────────────────────────────────────────────────────

function checkInterfaceParity(ifaceMethods, implMethods) {
  const missing    = findMissingMethods(ifaceMethods, implMethods);
  const extra      = findExtraMethods(ifaceMethods, implMethods);
  const mismatches = findReturnTypeMismatches(ifaceMethods, implMethods);

  const errors = [
    ...missing.map(m =>
      `\`${formatSig(m)}\` is defined in the interface but missing from the implementation`
    ),
    ...mismatches.map(m =>
      `\`${m.method}\` return type mismatch — interface: \`${m.expected}\`, implementation: \`${m.actual}\``
    )
  ];

  const warnings = extra.map(m =>
    `\`${formatSig(m)}\` exists in the implementation but not on the interface — consider adding or making private`
  );

  return { pass: errors.length === 0, errors, warnings };
}

function checkMockParity(ifaceMethods, mockMethods) {
  const missing    = findMissingMethods(ifaceMethods, mockMethods);
  const mismatches = findReturnTypeMismatches(ifaceMethods, mockMethods);

  const errors = [
    ...missing.map(m =>
      `\`${formatSig(m)}\` is missing from the mock — add a stub returning ${defaultReturn(m.returnType)}`
    ),
    ...mismatches.map(m =>
      `\`${m.method}\` return type mismatch — interface: \`${m.expected}\`, mock: \`${m.actual}\``
    )
  ];

  return { pass: errors.length === 0, errors };
}

/**
 * Compares current interface methods against the manifest entry.
 * Two drift modes:
 *   - STRICT: any difference is an error
 *   - ADDITIVE (default): only new methods missing from manifest are errors;
 *     methods removed from the interface are warnings (deletion in progress)
 *
 * @param {MethodSignature[]} ifaceMethods - live parsed from DAI class
 * @param {object|null} manifestEntry - entry from da-manifest.json
 * @param {"strict"|"additive"} mode
 */
function checkManifestDrift(ifaceMethods, manifestEntry, mode = "additive") {
  // New DA set — not yet cataloged
  if (!manifestEntry) {
    return {
      pass: false,
      errors: ["This DA set has no entry in da-manifest.json — run the cataloger after merging"],
      isNewDA: true
    };
  }

  const manifestMethods = manifestEntry.methods ?? [];

  // Normalize manifest methods into the same shape as parsed methods
  const manifestAsParsed = manifestMethods.map(m => ({
    name: m.name,
    parameters: (m.parameters ?? []).map(p => ({ name: p.name, type: p.type })),
    returnType: m.returnType
  }));

  const addedToInterface     = findMissingMethods(ifaceMethods, manifestAsParsed);
  const removedFromInterface = findMissingMethods(manifestAsParsed, ifaceMethods);
  const returnMismatches     = findReturnTypeMismatches(ifaceMethods, manifestAsParsed);

  const errors = [
    ...addedToInterface.map(m =>
      `\`${m.name}\` is in the interface but missing from da-manifest.json — re-run the cataloger`
    ),
    ...(mode === "strict" ? removedFromInterface.map(m =>
      `\`${m.name}\` is in da-manifest.json but no longer in the interface`
    ) : []),
    ...returnMismatches.map(m =>
      `\`${m.method}\` return type changed — manifest has \`${m.expected}\`, interface now has \`${m.actual}\``
    )
  ];

  const warnings = mode === "additive"
    ? removedFromInterface.map(m =>
        `\`${m.name}\` was removed from the interface — manifest will be stale until cataloger is re-run`
      )
    : [];

  return { pass: errors.length === 0, errors, warnings };
}

/**
 * Checks test coverage shape by counting @isTest methods in the test class.
 * Heuristically matches test method names to interface method names where possible.
 */
function checkTestCoverageShape(ifaceMethods, testSrc) {
  if (!testSrc) {
    return {
      pass: false,
      warnings: ["No test class found for this DA set"],
      uncoveredMethods: ifaceMethods.map(m => m.name)
    };
  }

  // Count @isTest methods via simple regex — PMD not needed here,
  // we just want a count and don't need full AST for test methods
  const testMethodMatches = testSrc.match(/@isTest[\s\S]*?(?:static\s+)?void\s+(\w+)\s*\(/gi) ?? [];
  const testMethodNames   = testMethodMatches.map(m => {
    const nameMatch = m.match(/void\s+(\w+)\s*\(/i);
    return nameMatch?.[1]?.toLowerCase() ?? "";
  });

  // Heuristic: a test method "covers" an interface method if the test method
  // name contains the interface method name (e.g. testGetById → getById)
  const uncoveredMethods = ifaceMethods.filter(iMethod =>
    !testMethodNames.some(testName => testName.includes(iMethod.name.toLowerCase()))
  );

  const pass = uncoveredMethods.length === 0;
  const warnings = pass ? [] : [
    `${testMethodMatches.length} test method(s) for ${ifaceMethods.length} interface method(s)`
  ];

  return {
    pass,
    warnings,
    uncoveredMethods: uncoveredMethods.map(m => m.name)
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatSig(method) {
  const params = method.parameters.map(p => `${p.type} ${p.name}`).join(", ");
  return `${method.returnType} ${method.name}(${params})`;
}

/**
 * Suggests a sensible default stub return value for a given return type.
 * Used in mock parity error messages to guide developers.
 */
function defaultReturn(returnType) {
  if (returnType === "void")                              return "nothing (void stub)";
  if (returnType === "Boolean")                           return "`false`";
  if (returnType === "Integer" || returnType === "Decimal") return "`0`";
  if (returnType.startsWith("List"))                      return `an empty list \`new ${returnType}()\``;
  if (returnType.startsWith("Map"))                       return `an empty map \`new ${returnType}()\``;
  if (returnType.startsWith("Set"))                       return `an empty set \`new ${returnType}()\``;
  return "`null`";
}
