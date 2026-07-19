#!/usr/bin/env bash

set -Eeuo pipefail

base_url="${1:-${SMOKE_BASE_URL:-http://127.0.0.1}}"
base_url="${base_url%/}"

body_file="$(mktemp)"
headers_file="$(mktemp)"
admin_html_file="$(mktemp)"

cleanup() {
  rm -f "$body_file" "$headers_file" "$admin_html_file"
}
trap cleanup EXIT

request() {
  local path="$1"
  local label="$2"
  local attempt
  local status="000"

  for attempt in {1..12}; do
    : >"$body_file"
    : >"$headers_file"
    if ! status="$(curl --silent --show-error --location \
      --connect-timeout 5 --max-time 30 \
      --output "$body_file" --dump-header "$headers_file" \
      --write-out '%{http_code}' "${base_url}${path}")"; then
      status="000"
    fi
    if [[ "$status" =~ ^2[0-9][0-9]$ ]]; then
      break
    fi
    if (( attempt < 12 )); then
      sleep 5
    fi
  done

  if [[ ! "$status" =~ ^2[0-9][0-9]$ ]]; then
    echo "[smoke] ${label} failed: HTTP ${status} (${path})" >&2
    head -c 500 "$body_file" >&2 || true
    echo >&2
    return 1
  fi

  content_type="$(tr -d '\r' <"$headers_file" \
    | sed -n 's/^[Cc]ontent-[Tt]ype:[[:space:]]*//p' \
    | tail -n 1)"
  echo "[smoke] ${label}: HTTP ${status}, ${content_type:-content-type missing}"
}

require_content_type() {
  local expected="$1"
  local label="$2"
  if [[ ! "${content_type:-}" =~ $expected ]]; then
    echo "[smoke] ${label} returned unexpected Content-Type: ${content_type:-missing}" >&2
    return 1
  fi
}

reject_html_fallback() {
  local label="$1"
  if head -c 512 "$body_file" | grep -Eiq '<!doctype|<html'; then
    echo "[smoke] ${label} was incorrectly served as index.html" >&2
    return 1
  fi
}

resolve_admin_asset() {
  local asset="$1"
  case "$asset" in
    /admin/*) printf '%s' "$asset" ;;
    /*) printf '%s' "$asset" ;;
    ./*) printf '/admin/%s' "${asset#./}" ;;
    *) printf '/admin/%s' "$asset" ;;
  esac
}

request "/" "storefront homepage"
require_content_type 'text/html' "storefront homepage"
test -s "$body_file"
grep -Eiq '^Content-Security-Policy:' "$headers_file"

request "/health" "backend health through Nginx"
require_content_type 'application/json' "backend health"
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$body_file"

request "/ready" "backend readiness through Nginx"
require_content_type 'application/json' "backend readiness"
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ready"' "$body_file"

request "/api/socket.io/?EIO=4&transport=polling" "Socket.IO reverse proxy"
require_content_type 'text/plain' "Socket.IO reverse proxy"
grep -Eq '^0\{' "$body_file"

request "/admin/" "admin root"
require_content_type 'text/html' "admin root"

request "/admin/login" "admin login route"
require_content_type 'text/html' "admin login route"
cp "$body_file" "$admin_html_file"

admin_js="$(grep -Eo 'src="[^"]+\.js"' "$admin_html_file" \
  | head -n 1 | sed -E 's/^src="|"$//g' || true)"
admin_css="$(grep -Eo 'href="[^"]+\.css"' "$admin_html_file" \
  | head -n 1 | sed -E 's/^href="|"$//g' || true)"

if [[ -z "$admin_js" || -z "$admin_css" ]]; then
  echo "[smoke] admin login HTML does not reference both JavaScript and CSS assets" >&2
  exit 1
fi

admin_js_path="$(resolve_admin_asset "$admin_js")"
admin_css_path="$(resolve_admin_asset "$admin_css")"

request "$admin_js_path" "admin JavaScript asset"
require_content_type 'javascript|ecmascript' "admin JavaScript asset"
reject_html_fallback "admin JavaScript asset"

request "$admin_css_path" "admin CSS asset"
require_content_type 'text/css' "admin CSS asset"
reject_html_fallback "admin CSS asset"

missing_asset_status="$(curl --silent --show-error --output "$body_file" \
  --write-out '%{http_code}' "${base_url}/admin/assets/compose-smoke-missing.js")"
if [[ "$missing_asset_status" != "404" ]]; then
  echo "[smoke] missing admin asset returned HTTP ${missing_asset_status}, expected 404" >&2
  exit 1
fi
if cmp -s "$body_file" "$admin_html_file" \
  || grep -Fq '<div id="root"></div>' "$body_file"; then
  echo "[smoke] missing admin asset was incorrectly served as the admin SPA" >&2
  exit 1
fi

request "/api/bearings" "API reverse proxy"
require_content_type 'application/json' "API reverse proxy"
grep -Eq '"data"[[:space:]]*:' "$body_file"

request "/images/1779352422128-674289.png" "static image proxy"
require_content_type 'image/' "static image proxy"
test -s "$body_file"

request "/robots.txt" "robots policy"
require_content_type 'text/plain' "robots policy"
grep -Fq "Sitemap:" "$body_file"

request "/sitemap.xml" "XML sitemap"
require_content_type 'application/xml|text/xml' "XML sitemap"
grep -Fq '<urlset' "$body_file"

echo "[smoke] all Compose entrypoint checks passed"
