#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import { appConfig } from '../../config/app.config';
import { BerlinHolidaysBotStack } from '../lib/berlin-holidays-bot-stack';

/**
 * CDK app entrypoint.
 *
 * Secrets (bot tokens, chat id) live in SSM Parameter Store as SecureStrings.
 * The stack references them via CloudFormation dynamic references so the
 * synthesized template only ever contains pointers like
 * `{{resolve:ssm-secure:...}}`, never the literal values. See
 * `config/app.config.ts -> ssm` for parameter names and version. Provision
 * them once via the AWS CLI - the procedure is documented in `AGENTS.md`.
 *
 * Account and region are resolved at deploy time from the AWS CLI
 * (`CDK_DEFAULT_*`), so `aws configure` is the only place they need to live.
 * Everything else - names, sizes - is sourced from `config/app.config.ts`.
 */
const app = new App();

new BerlinHolidaysBotStack(app, appConfig.stackName, {
  config: appConfig,
  logLevel: process.env.LOG_LEVEL ?? 'info',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
