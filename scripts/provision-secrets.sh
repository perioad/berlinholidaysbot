#!/usr/bin/env bash
#
# Provision the SSM SecureString parameters used by the CDK stack.
#
# Reads token values from the project's .env file, verifies the required
# variables exist, and pushes each one to SSM Parameter Store. Idempotent:
# by default skips parameters that already exist; pass --force to overwrite
# (rotation), which bumps the parameter's version - in that case remember
# to update `appConfig.ssm.version` in config/app.config.ts and redeploy.
#
# Usage:
#   bash scripts/provision-secrets.sh           # create-if-missing
#   bash scripts/provision-secrets.sh --force   # rotate existing values
#
# Requirements: bash 3.2+ (macOS default), AWS CLI configured.

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

# Source of truth for parameter <-> env var mapping. Keep aligned with
# config/app.config.ts -> ssm.
PARAMS=(
  "/berlinholidaysbot/bot-token:BOT_TOKEN"
  "/berlinholidaysbot/logs-bot-token:LOGS_BOT_TOKEN"
  "/berlinholidaysbot/logs-chat-id:LOGS_CHAT_ID"
)

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.example to .env and fill it in." >&2
  exit 1
fi
if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found. Install + configure it first." >&2
  exit 1
fi

# Sourcing .env runs any shell expansion in values; .env is your own file
# so the trust boundary is fine, but be aware of it.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

# Validate everything BEFORE touching AWS, so a partial run is impossible.
missing=()
for entry in "${PARAMS[@]}"; do
  var_name="${entry##*:}"
  if [[ -z "${!var_name:-}" ]]; then
    missing+=("$var_name")
  fi
done
if (( ${#missing[@]} > 0 )); then
  {
    echo "Missing required values in $ENV_FILE:"
    printf '  - %s\n' "${missing[@]}"
    echo
    echo "Add them temporarily to .env (it is gitignored), re-run, then"
    echo "feel free to remove them again - the deployed stack reads from SSM."
  } >&2
  exit 1
fi

echo "Provisioning SSM SecureString parameters..."
echo

for entry in "${PARAMS[@]}"; do
  param_name="${entry%%:*}"
  var_name="${entry##*:}"
  value="${!var_name}"

  if aws ssm get-parameter --name "$param_name" >/dev/null 2>&1; then
    if (( FORCE )); then
      echo "  rotating  $param_name"
      aws ssm put-parameter \
        --name "$param_name" \
        --type SecureString \
        --value "$value" \
        --overwrite >/dev/null
    else
      echo "  skipping  $param_name  (already exists; --force to overwrite)"
      continue
    fi
  else
    echo "  creating  $param_name"
    aws ssm put-parameter \
      --name "$param_name" \
      --type SecureString \
      --value "$value" >/dev/null
  fi
done

echo
echo "Current versions:"
for entry in "${PARAMS[@]}"; do
  param_name="${entry%%:*}"
  version=$(
    aws ssm get-parameter \
      --name "$param_name" \
      --query 'Parameter.Version' \
      --output text 2>/dev/null \
      || echo "?"
  )
  printf '  %-40s v%s\n' "$param_name" "$version"
done

if (( FORCE )); then
  cat <<EOF

Rotation complete. Run 'npm run deploy' to push the new values into the
deployed Lambdas (the stack reads the latest SSM version automatically -
no code change needed).
EOF
fi
