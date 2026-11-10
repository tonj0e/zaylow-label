#!/usr/bin/env bash
# One-time setup for the India Post delivery check.
# Run it from the project folder:   bash scripts/setup-india-post.sh
set -euo pipefail

PROJECT_REF="gmbskdhdewacvsijqgxi"
cd "$(dirname "$0")/.."

echo
echo "This sets up the India Post delivery check for your site."
echo "You type your India Post login below. It is hidden, sent to your Supabase project, and not saved in any file here."
echo

read -r -p "India Post API username: " IP_USER
read -r -s -p "India Post API password (typing is hidden): " IP_PASS
echo
echo "Which India Post server?"
echo "  Press Enter to use the TEST server (practice data only), or"
echo "  paste the PRODUCTION address from the India Post developer portal (ends with /beextcustomer/v1)."
read -r -p "Address: " IP_BASE

if [ -z "$IP_USER" ] || [ -z "$IP_PASS" ]; then
  echo "The username and password cannot be empty. Nothing was changed."
  exit 1
fi

# The login goes through a temporary private file (not the command line), which is deleted straight after.
umask 077
TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT
{
  printf 'INDIAPOST_USERNAME=%s\n' "$IP_USER"
  printf 'INDIAPOST_PASSWORD=%s\n' "$IP_PASS"
  if [ -n "$IP_BASE" ]; then printf 'INDIAPOST_BASE_URL=%s\n' "$IP_BASE"; fi
} > "$TMP_ENV"

echo
echo "Step 1 of 3: sign in to Supabase (a browser window may open; use the account that owns your site's data)"
npx --yes supabase login

echo
echo "Step 2 of 3: saving your India Post login on the server"
npx --yes supabase secrets set --project-ref "$PROJECT_REF" --env-file "$TMP_ENV"

echo
echo "Step 3 of 3: installing the delivery check"
npx --yes supabase functions deploy india-post-sync --project-ref "$PROJECT_REF" --use-api

echo
echo "Done. Open the Tracking and COD page and press Check delivery now."
