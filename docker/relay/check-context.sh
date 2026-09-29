#!/usr/bin/env bash
# RP-03A: test Docker's actual .dockerignore handling with harmless canaries.
set -euo pipefail

repo=$(cd "$(dirname "$0")/../.." && pwd)
docker_bin=${DOCKER_BIN:-docker}
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
context="$tmp/context"
exported="$tmp/exported"
mkdir -p "$context" "$exported"
cp "$repo/.dockerignore" "$context/.dockerignore"

included=(
  package.json package-lock.json
  packages/ai/package.json
  packages/engine/package.json packages/engine/src/entry.ts
  packages/protocol/package.json packages/protocol/src/entry.ts
  packages/relay-dev/package.json packages/relay-dev/src/entry.ts
  packages/web/package.json packages/web/dist/index.html
  tools/sim/package.json
)
excluded=(
  secrets/root.txt tools/relay/secrets/nested.txt
  .env .env.production packages/relay-dev/src/.env.production
  packages/engine/src/identity.p12 packages/engine/src/identity.jks
  packages/engine/src/identity.pfx packages/engine/src/identity.keystore
  packages/protocol/src/identity.pem packages/relay-dev/src/identity.key
  packages/web/src/secret.ts packages/web/dist/identity.pem
  packages/web/dist/secrets/nested.txt packages/web/dist/.env.production
  packages/ai/src/unneeded.ts tools/sim/src/unneeded.ts
  packages/web/public/unbundled.svg packages/relay-dev/test/unneeded.ts
  packages/engine/src/node_modules/unneeded.js
  docs/private.txt android/private.txt tools/relay/.funnel-owned
)
for path in "${included[@]}" "${excluded[@]}"; do
  mkdir -p "$context/$(dirname "$path")"
  printf 'canary\n' > "$context/$path"
done
printf 'FROM scratch\nCOPY . /\n' > "$tmp/Dockerfile"
"$docker_bin" build --quiet -f "$tmp/Dockerfile" --output "type=local,dest=$exported" "$context" >/dev/null

for path in "${included[@]}"; do
  if [[ ! -f "$exported/$path" ]]; then
    printf 'Docker context lost required file: %s\n' "$path" >&2
    exit 1
  fi
done
for path in "${excluded[@]}"; do
  if [[ -e "$exported/$path" ]]; then
    printf 'Docker context leaked canary: %s\n' "$path" >&2
    exit 1
  fi
done
printf 'Docker context allowlist and sensitive-file canaries passed.\n'
