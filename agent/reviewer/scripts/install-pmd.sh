#!/usr/bin/env bash
set -euo pipefail

PMD_VERSION="${PMD_VERSION:-7.3.0}"
INSTALL_DIR="${HOME}/.local/pmd-${PMD_VERSION}"
PMD_ZIP="pmd-dist-${PMD_VERSION}-bin.zip"
PMD_URL="https://github.com/pmd/pmd/releases/download/pmd_releases/${PMD_VERSION}/${PMD_ZIP}"

if command -v pmd &>/dev/null; then
  INSTALLED=$(pmd --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  if [ "$INSTALLED" = "$PMD_VERSION" ]; then
    echo "PMD ${PMD_VERSION} already installed."
    exit 0
  fi
  echo "PMD ${INSTALLED} found but expected ${PMD_VERSION} — reinstalling..."
fi

echo "Installing PMD ${PMD_VERSION} to ${INSTALL_DIR}..."
curl -sSL "$PMD_URL" -o "/tmp/${PMD_ZIP}"

if [ ! -s "/tmp/${PMD_ZIP}" ]; then
  echo "ERROR: PMD download failed or file is empty"
  exit 1
fi

unzip -q "/tmp/${PMD_ZIP}" -d "/tmp/pmd-extract"
mkdir -p "$(dirname "$INSTALL_DIR")"
mv "/tmp/pmd-extract/pmd-bin-${PMD_VERSION}" "${INSTALL_DIR}"
rm -rf "/tmp/pmd-extract" "/tmp/${PMD_ZIP}"

PMD_BIN="${INSTALL_DIR}/bin"

# Add to shell profile if not already present
for PROFILE in "${HOME}/.zshrc" "${HOME}/.bashrc"; do
  if [ -f "$PROFILE" ] && ! grep -q "pmd-${PMD_VERSION}" "$PROFILE" 2>/dev/null; then
    echo "" >> "$PROFILE"
    echo "# PMD Apex static analysis" >> "$PROFILE"
    echo "export PATH=\"${PMD_BIN}:\$PATH\"" >> "$PROFILE"
    echo "Added PMD to ${PROFILE}"
  fi
done

export PATH="${PMD_BIN}:$PATH"
pmd --version
echo "PMD ${PMD_VERSION} installed. Run: source ~/.zshrc (or ~/.bashrc)"
