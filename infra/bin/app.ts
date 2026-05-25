#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import { appConfig } from '../../config/app.config';
import { BerlinHolidaysBotStack } from '../lib/berlin-holidays-bot-stack';

/**
 * CDK app entrypoint.
 *
 * Secrets (bot tokens, chat id) come from the local environment so they never
 * land in the CloudFormation template diff or in source control. Account and
 * region are resolved at deploy time from the AWS CLI (`CDK_DEFAULT_*`), so
 * `aws configure` is the only place they need to live. Everything else -
 * names, sizes - is sourced from `config/app.config.ts`.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Copy .env.example to .env and fill it in (or export it in your shell).`,
    );
  }
  return value;
}

const app = new App();

new BerlinHolidaysBotStack(app, appConfig.stackName, {
  config: appConfig,
  botToken: requireEnv('BOT_TOKEN'),
  logsBotToken: requireEnv('LOGS_BOT_TOKEN'),
  logsChatId: requireEnv('LOGS_CHAT_ID'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
