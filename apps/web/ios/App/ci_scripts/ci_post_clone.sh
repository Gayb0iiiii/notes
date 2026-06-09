#!/bin/sh
set -eu

cd "${CI_PRIMARY_REPOSITORY_PATH:-$(pwd)}"

echo "Using repository at $(pwd)"

if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installing Node with Homebrew..."
    brew install node
  else
    echo "Node is not installed and Homebrew is unavailable."
    exit 1
  fi
fi

node --version

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
"${PNPM}" --version
"${PNPM}" install --frozen-lockfile
