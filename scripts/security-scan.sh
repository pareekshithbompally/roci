#!/usr/bin/env bash
# Secrets and security scan: gitleaks (known key formats and high-entropy strings) and Semgrep (security rules for
# TypeScript, Rust, shell and GitHub Actions). `--staged` checks only what is about to be committed (the pre-commit hook);
# without it, the whole history and source tree. Fails on any secret, or any Semgrep finding of warning level or above.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

for tool in gitleaks semgrep; do
  command -v "$tool" >/dev/null || { echo "security-scan: $tool is not installed (brew install $tool)" >&2; exit 1; }
done

SEMGREP=(semgrep scan --metrics=off --disable-version-check --quiet --error --severity WARNING --severity ERROR
  --config p/default --config p/secrets --config p/typescript --config p/rust --config p/github-actions)

if [[ "${1:-}" == "--staged" ]]; then
  gitleaks git --staged --no-banner --redact --config .gitleaks.toml
  files=()
  # Semgrep scans a file named on its command line even when .semgrepignore lists its folder, so the folders listed
  # there (third-party and generated code) are left out here; so is a symbolic link (its target is scanned at its own path).
  ignored=()
  while IFS= read -r line; do [[ -z "$line" || "$line" == \#* ]] || ignored+=("$line"); done < .semgrepignore
  skipped() { [[ -L "$1" ]] && return 0; for dir in "${ignored[@]}"; do [[ "$1" == "$dir"* ]] && return 0; done; return 1; }
  while IFS= read -r -d '' file; do skipped "$file" || files+=("$file"); done < <(git diff --cached --name-only --diff-filter=ACMR -z)
  [[ ${#files[@]} -eq 0 ]] || "${SEMGREP[@]}" "${files[@]}"
else
  gitleaks git --no-banner --redact --config .gitleaks.toml
  "${SEMGREP[@]}" .
fi
