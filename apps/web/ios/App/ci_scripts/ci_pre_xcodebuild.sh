#!/bin/sh
set -eu

cd "${CI_PRIMARY_REPOSITORY_PATH:-$(pwd)}"

echo "Preparing Capacitor iOS project for Xcode Cloud..."

if command -v corepack >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@9.15.4 --activate
elif command -v npm >/dev/null 2>&1; then
  echo "Corepack is unavailable; installing pnpm with npm..."
  npm install --global pnpm@9.15.4
else
  echo "Neither corepack nor npm is available to install pnpm."
  exit 1
fi

PNPM="$(command -v pnpm)"
"${PNPM}" install --frozen-lockfile
"${PNPM}" --filter @notes/web app:ios:copy

if [ -n "${CI_BUILD_NUMBER:-}" ]; then
  echo "Setting iOS build number to ${CI_BUILD_NUMBER}"
  cd apps/web/ios/App
  xcrun agvtool new-version -all "${CI_BUILD_NUMBER}"
fi
