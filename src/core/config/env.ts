import { z } from 'zod';

/**
 * Schema for environment variables required by the Lambda runtime.
 *
 * Keeping this in core/ means: zero AWS-CDK or grammy coupling, fully testable
 * with a plain `parseEnv({...})` call.
 */
const lambdaEnvSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  LOGS_BOT_TOKEN: z.string().min(1, 'LOGS_BOT_TOKEN is required'),
  LOGS_CHAT_ID: z.string().min(1, 'LOGS_CHAT_ID is required'),
  USERS_TABLE_NAME: z.string().min(1, 'USERS_TABLE_NAME is required'),
  AWS_REGION: z.string().min(1, 'AWS_REGION is required'),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
});

export type LambdaEnv = z.infer<typeof lambdaEnvSchema>;

/**
 * Parses and validates the given env object. Throws a readable error on any
 * missing/invalid value so misconfiguration fails fast (cold start), not
 * silently mid-request.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): LambdaEnv {
  const result = lambdaEnvSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
