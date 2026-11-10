#!/usr/bin/env bash
# Installs the India Post delivery check on your Supabase project.
# It reads the public speedpost tracking page, so no India Post login or key is needed.
# Run it from the project folder:   bash scripts/deploy-tracking.sh
set -euo pipefail

PROJECT_REF="gmbskdhdewacvsijqgxi"
cd "$(dirname "$0")/.."

echo
echo "Step 1 of 2: sign in to Supabase (a browser window may open; use the account that owns your site's data)"
npx --yes supabase login

echo
echo "Step 2 of 2: installing the delivery check"
npx --yes supabase functions deploy india-post-sync --project-ref "$PROJECT_REF" --use-api

echo
echo "Done. Open the Tracking and COD page and press Check delivery now."
