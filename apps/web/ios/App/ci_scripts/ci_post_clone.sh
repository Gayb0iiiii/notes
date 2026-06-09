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
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm --version

pnpm install --frozen-lockfile
