#!/usr/bin/env bash
# Regenerates the sandbox-only WASM/driver-adapter Prisma client used for real-database tests.
set -euo pipefail
cd "$(dirname "$0")/.."
export PRISMA_SCHEMA_ENGINE_BINARY=/tmp/dummy-engine PRISMA_QUERY_ENGINE_LIBRARY=/tmp/dummy-engine PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 DATABASE_URL=${DATABASE_URL:-postgresql://x@localhost/x}
touch /tmp/dummy-engine; chmod +x /tmp/dummy-engine
rm -rf .scratch/client
sed -e 's|provider = "prisma-client-js"|provider = "prisma-client-js"\n  previewFeatures = ["driverAdapters"]\n  output = "./client"|' prisma/schema.prisma > .scratch/schema.prisma
npx prisma generate --schema .scratch/schema.prisma 2>&1 | grep -iE "generated|error" || true
R=node_modules/@prisma/client/runtime
cp $R/query_engine_bg.postgresql.wasm .scratch/client/query_engine_bg.wasm
cp $R/query_engine_bg.postgresql.js .scratch/client/query_engine_bg.js
cat > .scratch/client/wasm-worker-loader.mjs <<'EOT'
import { readFileSync } from 'node:fs';
export default WebAssembly.compile(readFileSync(new URL('./query_engine_bg.wasm', import.meta.url))).then((m) => ({ default: m }));
EOT
