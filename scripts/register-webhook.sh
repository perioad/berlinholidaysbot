#!/usr/bin/env bash
#
# Register the Telegram webhook with the deployed Lambda Function URL.
#
# Idempotent: Telegram's setWebhook is a no-op for an unchanged URL, so
# running this on every `npm run deploy` is safe. Picks up the URL from
# the stack's CloudFormation outputs and the bot token from SSM, so there
# is nothing to configure manually.
#
# Honours TELEGRAM_WEBHOOK_SECRET if set in .env (so the value registered
# with Telegram matches what the Lambda validates in
# `webhookCallback({ secretToken })`).
#
# Requirements: bash 3.2+ (macOS default), AWS CLI configured, curl.

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

STACK_NAME="BerlinHolidaysBotStack"
BOT_TOKEN_PARAM="/berlinholidaysbot/bot-token"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found. Install + configure it first." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found." >&2
  exit 1
fi

# Pick up TELEGRAM_WEBHOOK_SECRET from .env if present. Optional.
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

echo "Looking up webhook URL from CloudFormation..."
WEBHOOK_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='WebhookUrl'].OutputValue" \
  --output text)

if [[ -z "$WEBHOOK_URL" || "$WEBHOOK_URL" == "None" ]]; then
  echo "Could not find WebhookUrl output on stack $STACK_NAME." >&2
  echo "Has 'cdk deploy' finished successfully?" >&2
  exit 1
fi

echo "Fetching bot token from SSM..."
BOT_TOKEN=$(aws ssm get-parameter \
  --name "$BOT_TOKEN_PARAM" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text)

if [[ -z "$BOT_TOKEN" || "$BOT_TOKEN" == "None" ]]; then
  echo "SSM parameter $BOT_TOKEN_PARAM is empty or missing." >&2
  echo "Run 'npm run secrets' first." >&2
  exit 1
fi

SECRET_ARG=()
if [[ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  SECRET_ARG=(-d "secret_token=${TELEGRAM_WEBHOOK_SECRET}")
fi

echo "Registering webhook with Telegram..."
response=$(curl -fsS \
  "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${WEBHOOK_URL}" \
  "${SECRET_ARG[@]}")

if echo "$response" | grep -q '"ok":true'; then
  echo "Webhook set: $WEBHOOK_URL"
else
  echo "Telegram rejected setWebhook:" >&2
  echo "$response" >&2
  exit 1
fi
