import { Stack } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

/**
 * Grants the Lambda role the minimum permissions it needs to read SSM
 * SecureString parameters:
 *   - `ssm:GetParameter` and `ssm:GetParameters` scoped to the specific
 *      parameter ARNs (no wildcard).
 *   - `kms:Decrypt` constrained by `kms:ViaService = ssm.<region>.amazonaws.com`
 *      so the role cannot decrypt KMS-encrypted data outside SSM, even if a
 *      key policy elsewhere would allow it.
 *
 * `kms:Decrypt` uses `*` for the resource (not the actual key ARN) because
 * the default SSM SecureString key is AWS-managed and its ARN is not
 * knowable at synth time. The `kms:ViaService` condition is the
 * AWS-recommended mitigation.
 */
export function grantSsmSecureRead(
  lambda: NodejsFunction,
  parameterNames: string[],
): void {
  const { region, account } = Stack.of(lambda);

  const parameterArns = parameterNames.map(
    name => `arn:aws:ssm:${region}:${account}:parameter${name}`,
  );

  lambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: parameterArns,
    }),
  );

  lambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['kms:Decrypt'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'kms:ViaService': `ssm.${region}.amazonaws.com`,
        },
      },
    }),
  );
}
