#!/usr/bin/env bash
set -euo pipefail
# Deploy from your laptop: copies sources over SSH and runs docker compose on the server.
#
#   chmod 600 ~/Downloads/newpair-april25-vegas-2026.pem
#   export SSH_KEY="$HOME/Downloads/newpair-april25-vegas-2026.pem"
#   ./scripts/deploy-remote.sh ubuntu@3.231.31.216
#
# One-time on the server (install Docker, open 80): sudo bash scripts/bootstrap-server.sh

SSH_KEY="${SSH_KEY:-$HOME/Downloads/newpair-april25-vegas-2026.pem}"
REMOTE="${1:-ubuntu@3.231.31.216}"
REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/mutinynet-web-wallet}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "Missing SSH key at $SSH_KEY (set SSH_KEY=...)" >&2
  exit 1
fi

chmod 600 "$SSH_KEY"
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Avoid macOS tar copying xattrs that GNU tar warns about on Linux.
export COPYFILE_DISABLE=1

"${SSH[@]}" "$REMOTE" "mkdir -p '$REMOTE_DIR'"
tar -C "$ROOT" \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./dist' \
  -czf - . | "${SSH[@]}" "$REMOTE" "tar -xzf - -C '$REMOTE_DIR'"

"${SSH[@]}" "$REMOTE" "sudo usermod -aG docker ubuntu 2>/dev/null || true; cd '$REMOTE_DIR' && sudo docker compose build --pull && sudo docker compose up -d"
HOST="${REMOTE#*@}"
echo "Done. Open http://${HOST}/ (port 80). Mutiny API must be listening on the host at :3000 for /api proxy."
