/**
 * Formats a DA review result object into a GitHub PR comment (Markdown).
 *
 * @param {object} result - output from reviewer-agent.js
 * @returns {string} Markdown string
 */
export function formatComment(result) {
  const { daName, checks, callerImpact = [], blocksMerge } = result;
  const lines = [`## DA Layer Review — \`${daName}\`\n`];

  lines.push(formatInterfaceParity(checks.interfaceParity));
  lines.push(formatMockParity(checks.mockParity));
  lines.push(formatManifestDrift(checks.manifestDrift));
  lines.push(formatTestCoverageShape(checks.testCoverageShape));

  if (callerImpact.length > 0) {
    lines.push(formatCallerImpact(callerImpact));
  }

  if (blocksMerge) {
    lines.push("\n---");
    lines.push("> ❌ **Merge blocked** — resolve errors above before merging.");
  } else {
    lines.push("\n---");
    lines.push("> ✅ **DA layer checks passed** — no merge blockers found.");
  }

  return lines.join("\n");
}

// ─── Section Formatters ───────────────────────────────────────────────────────

function formatInterfaceParity(check) {
  const icon = check.pass ? "✅" : "❌";
  const lines = [`\n### ${icon} Interface Parity`];

  if (check.errors?.length) {
    check.errors.forEach(e => lines.push(`- ${e}`));
  } else {
    lines.push("All interface methods present in implementation.");
  }

  if (check.warnings?.length) {
    lines.push("\n**Warnings:**");
    check.warnings.forEach(w => lines.push(`- ⚠️ ${w}`));
  }

  return lines.join("\n");
}

function formatMockParity(check) {
  const icon = check.pass ? "✅" : "❌";
  const lines = [`\n### ${icon} Mock Parity`];

  if (check.errors?.length) {
    check.errors.forEach(e => lines.push(`- ${e}`));
  } else {
    lines.push("All interface methods stubbed in mock.");
  }

  return lines.join("\n");
}

function formatManifestDrift(check) {
  const icon = check.pass ? "✅" : "❌";
  const lines = [`\n### ${icon} Manifest (\`da-manifest.json\`)`];

  if (check.isNewDA) {
    lines.push("⚠️ New DA set — not yet in the manifest. Run the cataloger after merging.");
    return lines.join("\n");
  }

  if (check.errors?.length) {
    lines.push("`da-manifest.json` is stale — re-run the cataloger before merging.");
    check.errors.forEach(e => lines.push(`- ${e}`));
  } else {
    lines.push("`da-manifest.json` reflects the current interface shape.");
  }

  if (check.warnings?.length) {
    check.warnings.forEach(w => lines.push(`- ⚠️ ${w}`));
  }

  return lines.join("\n");
}

function formatTestCoverageShape(check) {
  const icon = check.pass ? "✅" : "⚠️";
  const lines = [`\n### ${icon} Test Coverage Shape`];

  if (check.warnings?.length) {
    check.warnings.forEach(w => lines.push(w));
  }

  if (check.uncoveredMethods?.length) {
    lines.push(
      `No matching test methods found for: ${check.uncoveredMethods.map(m => `\`${m}\``).join(", ")}.`
    );
  }

  if (check.pass) {
    lines.push("Test method count matches interface method count.");
  }

  return lines.join("\n");
}

function formatCallerImpact(callerImpact) {
  const lines = ["\n### ℹ️ Caller Impact"];
  lines.push("The interface changed. These DAs consume it and may need attention:\n");

  callerImpact.forEach(({ da, usedMethods }) => {
    const methods = usedMethods.map(m => `\`${m}\``).join(", ");
    lines.push(`- \`${da}\` — uses: ${methods}`);
  });

  return lines.join("\n");
}
