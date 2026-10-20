#!/usr/bin/env bash
set -euo pipefail
image=jamrelay:smoke
suffix="${GITHUB_RUN_ID:-local}-$$"
container="jamrelay-smoke-$suffix"
volume="jamrelay-smoke-$suffix"
network="jamrelay-smoke-$suffix"
version=$(node -p "require('./package.json').version")
cleanup() {
  if [[ ${1:-0} != 0 ]]; then docker logs "$container" 2>/dev/null || true; fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap 'cleanup $?' EXIT
docker build --build-arg "JAMRELAY_VERSION=$version" -t "$image" .
docker volume create "$volume" >/dev/null
docker network create "$network" >/dev/null
# No provider accounts or external credentials are used.
docker run --rm -v "$volume:/data" "$image" setup --yes
docker run -d --name "$container" --network "$network" --network-alias jamrelay \
  -p 127.0.0.1::5267 -v "$volume:/data" "$image" >/dev/null
for attempt in $(seq 1 45); do
  state=$(docker inspect --format '{{.State.Health.Status}}' "$container")
  if [[ $state == healthy ]]; then break; fi
  if [[ $attempt == 45 ]]; then echo 'Container did not become healthy'; exit 1; fi
  sleep 2
done
port=$(docker port "$container" 5267/tcp | head -1 | awk -F: '{print $NF}')
curl --fail --silent "http://127.0.0.1:$port/health" > /tmp/jamrelay-docker-health.json
node --input-type=module - "$version" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const health = JSON.parse(readFileSync('/tmp/jamrelay-docker-health.json', 'utf8'));
assert.equal(health.status, 'ok');
assert.equal(health.version, process.argv[2]);
assert.equal(health.database.schemaState, 'current');
console.log('Host health/version/schema: PASS');
JS
status=$(curl --silent -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d '{}' "http://127.0.0.1:$port/mcp")
[[ $status == 401 ]]
# Verify from a SECOND container sharing only the Compose-equivalent network.
docker run --rm --network "$network" -v "$volume:/data" \
  -e "JAMRELAY_HOST_PORT=$port" -e JAMRELAY_SERVICE_URL=http://jamrelay:5267 \
  --entrypoint node "$image" --input-type=module -e '
    import assert from "node:assert/strict";
    import {verifyEndpoint} from "./dist/cli/connectivity.js";
    const checks = await verifyEndpoint(`http://127.0.0.1:${process.env.JAMRELAY_HOST_PORT}`, true);
    assert.deepEqual(checks, {dns:null, https:null, health:true, mcpProtected:true});
    console.log("Separate Docker CLI network and protected MCP: PASS");'
docker stop "$container" >/dev/null
echo 'Docker image smoke: PASS'
