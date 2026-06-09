#!/bin/sh
set -eu

cd "${CI_PRIMARY_REPOSITORY_PATH:-$(pwd)}"

echo "Preparing Capacitor iOS project for Xcode Cloud..."
corepack enable
corepack prepare pnpm@9.15.4 --activate

pnpm install --frozen-lockfile
pnpm --filter @notes/web app:ios:copy
