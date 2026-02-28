#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${MODULE_DIR}/../.." && pwd)"

if [[ $# -ne 1 ]]; then
	echo "Usage: $0 /path/to/standalone-module-repo"
	exit 1
fi

TARGET_DIR="$1"
mkdir -p "${TARGET_DIR}"

rsync -a \
	--delete \
	--exclude 'node_modules' \
	--exclude 'dist' \
	"${MODULE_DIR}/" "${TARGET_DIR}/"

cp "${ROOT_DIR}/LICENSE" "${TARGET_DIR}/LICENSE"

echo "Standalone module repo exported to: ${TARGET_DIR}"
echo "Next steps:"
echo "  cd \"${TARGET_DIR}\""
echo "  npm install"
echo "  npm run check"
echo "  npm run build"
echo "  TALKTOME_REPO_ROOT=/path/to/talktome npm run smoke"
