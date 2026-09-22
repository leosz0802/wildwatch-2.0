#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
npx --yes --package terser@5.44.0 terser scripts/sources/worldIdentity.js --compress --mangle -o open-data/worldIdentity.js
