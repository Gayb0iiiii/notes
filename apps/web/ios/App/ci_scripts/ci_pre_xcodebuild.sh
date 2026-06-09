#!/bin/sh
set -eu

cd "${CI_PRIMARY_REPOSITORY_PATH:-$(pwd)}"

echo "Preparing Capacitor iOS project for Xcode Cloud..."
corepack enable
corepack prepare pnpm@9.15.4 --activate

pnpm install --frozen-lockfile
pnpm --filter @notes/web app:ios:copy

if [ -n "${CI_BUILD_NUMBER:-}" ]; then
  echo "Setting iOS build number to ${CI_BUILD_NUMBER}"
  cd apps/web/ios/App
  xcrun agvtool new-version -all "${CI_BUILD_NUMBER}"
fi
