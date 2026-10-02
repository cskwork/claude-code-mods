#!/usr/bin/env bash
# Usage: scripts/new-mod.sh <mod-name> ["one line description"]
# Copies template/ to <mod-name>/, renames it and lists it in the marketplace.
set -euo pipefail
cd "$(dirname "$0")/.."

name="${1:?usage: scripts/new-mod.sh <mod-name> [description]}"
description="${2:-TODO: describe what $name does}"
[[ "$name" =~ ^[a-z][a-z0-9-]*$ ]] || { echo "mod name must be kebab-case: $name" >&2; exit 1; }
[[ -e "$name" ]] && { echo "$name already exists" >&2; exit 1; }

pascal="$(echo "$name" | perl -pe 's/(^|-)(\w)/\U$2/g')"
cp -R template "$name"
find "$name" -type f \( -name '*.json' -o -name '*.ts' -o -name '*.tsx' \) -print0 |
  xargs -0 perl -pi -e "s/mod-template/$name/g; s/ModTemplate/$pascal/g"
mv "$name/tests/register.test.ts" "$name/tests/$name.test.ts"

NAME="$name" DESC="$description" python3 - <<'PY'
import json, os
name, desc = os.environ["NAME"], os.environ["DESC"]
manifest = f"{name}/.claude-plugin/plugin.json"
plugin = json.load(open(manifest)); plugin["description"] = desc
json.dump(plugin, open(manifest, "w"), indent=2, ensure_ascii=False); open(manifest, "a").write("\n")
market = ".claude-plugin/marketplace.json"
data = json.load(open(market))
data["plugins"].append({"name": name, "source": f"./{name}", "description": desc})
json.dump(data, open(market, "w"), indent=2, ensure_ascii=False); open(market, "a").write("\n")
PY

claude plugin validate "$name"
claude plugin test "$name"
echo "Created $name/. Develop live with: claude --plugin-dir $PWD/$name"
