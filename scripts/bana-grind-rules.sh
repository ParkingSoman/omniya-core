#!/usr/bin/env bash
# Sequential BANA Electron evidence grind. One rule at a time.
set -u
cd "$(dirname "$0")/.."
unset ELECTRON_RUN_AS_NODE
export OMNIYA_HEADLESS=1

rules=(${@:-14 15 8 23 13 3 6 7 20 10 24 21 11 19 16 18 22 17})

for r in "${rules[@]}"; do
  echo "===== RULE $r $(date) ====="
  git pull --ff-only || true
  unset ELECTRON_RUN_AS_NODE
  node scripts/bana-close-rule-evidence.mjs --rule "$r" --continue-on-fail || true
  npm run bana:merge-electron
  BANA_ELECTRON_RESULTS=docs/bana-electron-results.json npm run bana:enrich
  npm run bana:audit-table
  git add docs/electron-evidence docs/electron-screenshots docs/bana-visual-evidence.json \
    docs/bana-electron-results.json docs/bana-coverage.json docs/bana-audit-table.md || true
  git commit -m "evidence: close Rule $r Electron shard batch" || true
  git push origin HEAD || true
done

echo "DONE $(date)"
