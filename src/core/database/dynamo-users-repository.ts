import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import type { BotUser } from '../domain/user';
import type { UsersRepository } from './users-repository';

export type DynamoUsersRepositoryOptions = {
  tableName: string;
  /** Optional pre-built client - injected in tests via aws-sdk-client-mock. */
  client?: DynamoDBDocumentClient;
  /** Optional clock injection for deterministic timestamps in tests. */
  now?: () => Date;
};

/**
 * DynamoDB-backed implementation of `UsersRepository`.
 *
 * Table contract:
 *   - Partition key: `id` (String)
 *   - No sort key
 *   - Billing: pay-per-request (set by CDK)
 */
export function createDynamoUsersRepository(
  options: DynamoUsersRepositoryOptions,
): UsersRepository {
  const { tableName } = options;
  const now = options.now ?? (() => new Date());
  const client =
    options.client ??
    DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });

  return {
    async getById(id) {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: { id },
        }),
      );

      return (result.Item as BotUser | undefined) ?? null;
    },

    async save(user) {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: user,
        }),
      );
    },

    async reactivate(id) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { id },
          UpdateExpression: 'SET isActive = :active, reactDate = :now',
          ExpressionAttributeValues: {
            ':active': true,
            ':now': now().toISOString(),
          },
        }),
      );
    },

    async deactivate(id) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { id },
          UpdateExpression: 'SET isActive = :inactive, endDate = :now',
          ExpressionAttributeValues: {
            ':inactive': false,
            ':now': now().toISOString(),
          },
        }),
      );
    },

    async listActive() {
      const all: BotUser[] = [];
      let exclusiveStartKey: Record<string, unknown> | undefined;

      do {
        const page = await client.send(
          new ScanCommand({
            TableName: tableName,
            FilterExpression: 'isActive = :true',
            ExpressionAttributeValues: { ':true': true },
            ExclusiveStartKey: exclusiveStartKey,
          }),
        );
        if (page.Items) {
          all.push(...(page.Items as BotUser[]));
        }
        exclusiveStartKey = page.LastEvaluatedKey;
      } while (exclusiveStartKey);

      return all;
    },
  };
}
