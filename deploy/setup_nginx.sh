#!/usr/bin/env bash
set -euo pipefail

CONF_SOURCE="${CONF_SOURCE:-$HOME/apps/animon-be/deploy/nginx_animon.conf}"
CONF_TARGET="/etc/nginx/sites-available/animon"

if [[ ! -f "$CONF_SOURCE" ]]; then
  echo "Nginx conf source not found: $CONF_SOURCE"
  exit 1
fi

sudo cp "$CONF_SOURCE" "$CONF_TARGET"
sudo ln -sf "$CONF_TARGET" /etc/nginx/sites-enabled/animon

# Optional: disable default site if still enabled
if [[ -L /etc/nginx/sites-enabled/default ]]; then
  sudo rm -f /etc/nginx/sites-enabled/default
fi

sudo nginx -t
sudo systemctl restart nginx

echo "Nginx configured and restarted successfully."
