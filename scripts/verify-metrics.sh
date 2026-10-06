#!/usr/bin/env bash
# E2E verification of the metrics API against raw git.
# Usage: scripts/verify-metrics.sh <repo-id>   (run from the project root)
set -u
RID="${1:?usage: verify-metrics.sh <repo-id>}"
BASE="http://localhost:3000/api/repos/$RID"
ROOT="$(pwd)"
OUT="$ROOT/.rat-data/verify"
mkdir -p "$OUT"
REPO="$ROOT/.rat-data/repos/$RID/checkout"

echo "=== 1. time range 1500000000..1600000000 ==="
curl -s "$BASE/metrics?from=1500000000&to=1600000000" -o "$OUT/r1.json"
cd "$REPO"
git log HEAD --no-merges --numstat -M50% --format='%x01%ct' | awk -F'\t' '
/^\x01/ { t=substr($0,2)+0; inr=(t>=1500000000 && t<1600000000); if (inr) hc++; next }
NF==3 && inr && $1!="-" && $2!="-" { a+=$1; r+=$2 }
END { print "git: commits=" hc " added=" a " removed=" r }'
OUT="$OUT" python3 - <<'EOF'
import json, os
d = json.load(open(os.path.join(os.environ['OUT'], 'r1.json')))
s = d['summary']
print(f"api: commits={s['commits']} added={s['added']} removed={s['removed']}")
EOF

echo "=== 2. author filter (2nd biggest author) ==="
AUTHOR="$(git shortlog -sne --no-merges HEAD | head -2 | tail -1 | sed 's/^ *[0-9]*[[:space:]]*//')"
echo "author: $AUTHOR"
curl -s --get --data-urlencode "author=$AUTHOR" "$BASE/metrics" -o "$OUT/r2.json"
git log HEAD --no-merges --numstat -M50% --format='%x01%an <%ae>' | AUTHOR="$AUTHOR" awk -F'\t' '
/^\x01/ { ina = (index($0, ENVIRON["AUTHOR"]) > 0); if (ina) hc++; next }
NF==3 && ina && $1!="-" && $2!="-" { a+=$1; r+=$2 }
END { print "git: commits=" hc+0 " added=" a+0 " removed=" r+0 }'
OUT="$OUT" python3 - <<'EOF'
import json, os
d = json.load(open(os.path.join(os.environ['OUT'], 'r2.json')))
s = d['summary']
top = d['authors'][0] if d['authors'] else None
print(f"api: commits={s['commits']} added={s['added']} removed={s['removed']}" + (f" top={top['key']} ownership={top['ownership']:.3f}" if top else " (empty)"))
EOF

echo "=== 3. manual commit selection (3 newest hashes) ==="
HASHES=$(git rev-parse HEAD~0 HEAD~1 HEAD~2 | tr '\n' ',' | sed 's/,$//')
curl -s "$BASE/metrics?commits=$HASHES" -o "$OUT/r3.json"
for h in $(echo "$HASHES" | tr ',' ' '); do git show --numstat -M50% --format= "$h"; done | awk -F'\t' 'NF==3 && $1!="-" && $2!="-" {a+=$1; r+=$2} END {print "git: added=" a+0 " removed=" r+0}'
OUT="$OUT" python3 - <<'EOF'
import json, os
d = json.load(open(os.path.join(os.environ['OUT'], 'r3.json')))
s = d['summary']
print(f"api: commits={s['commits']} added={s['added']} removed={s['removed']}")
EOF

echo "=== 4. file object check (top-churn file) ==="
FILE=$(curl -s "$BASE/metrics" | python3 -c 'import json,sys; print(json.load(sys.stdin)["files"][0]["path"])')
echo "file: $FILE"
curl -s --get --data-urlencode "path=$FILE" "$BASE/metrics" -o "$OUT/r4.json"
OUT="$OUT" python3 - <<'EOF'
import json, os
d = json.load(open(os.path.join(os.environ['OUT'], 'r4.json')))
s = d['summary']
o = d['object']
print(f"api: object={o['path']} type={o['type']} added={s['added']} removed={s['removed']} mods={s['mods']}")
EOF

echo "=== 5. author merge round-trip (PUT) ==="
curl -s -X PUT "$BASE/authors" -H 'content-type: application/json' \
  -d '{"groups":[{"name":"Merged Test","identities":[]}]}' -o /dev/null
echo "(empty identity group must be dropped by the server)"
curl -s "$BASE/authors" | python3 -c 'import json,sys; print("groups:", json.load(sys.stdin)["groups"])'

echo "=== done ==="
