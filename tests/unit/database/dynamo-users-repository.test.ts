import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createDynamoUsersRepository,
  type DynamoUsersRepositoryOptions,
} from '../../../src/core/database/dynamo-users-repository';
import type { UsersRepository } from '../../../src/core/database/users-repository';
import type { BotUser } from '../../../src/core/domain/user';

const TABLE = 'test-users';

describe('createDynamoUsersRepository', () => {
  const docMock = mockClient(DynamoDBDocumentClient);
  let repo: UsersRepository;

  beforeEach(() => {
    docMock.reset();
    const opts: DynamoUsersRepositoryOptions = {
      tableName: TABLE,
      client: docMock as unknown as DynamoDBDocumentClient,
      now: () => new Date('2030-06-01T12:00:00.000Z'),
    };
    repo = createDynamoUsersRepository(opts);
  });

  afterEach(() => {
    docMock.reset();
  });

  it('getById returns the item when found', async () => {
    const item: BotUser = {
      id: '7',
      isActive: true,
      isBot: false,
      isPremium: false,
      languageCode: 'en',
      firstName: 'A',
      lastName: 'B',
      username: 'ab',
      startDate: '2025-01-01T00:00:00.000Z',
    };
    docMock.on(GetCommand).resolves({ Item: item });

    await expect(repo.getById('7')).resolves.toEqual(item);
    const call = docMock.commandCalls(GetCommand)[0]!;
    expect(call.args[0].input).toMatchObject({
      TableName: TABLE,
      Key: { id: '7' },
    });
  });

  it('getById returns null when the item is missing', async () => {
    docMock.on(GetCommand).resolves({});
    await expect(repo.getById('missing')).resolves.toBeNull();
  });

  it('save sends a PutCommand with the full user item', async () => {
    docMock.on(PutCommand).resolves({});

    const user: BotUser = {
      id: '7',
      isActive: true,
      isBot: false,
      isPremium: false,
      languageCode: 'en',
      firstName: 'A',
      lastName: 'B',
      username: 'ab',
      startDate: '2025-01-01T00:00:00.000Z',
    };

    await repo.save(user);

    const call = docMock.commandCalls(PutCommand)[0]!;
    expect(call.args[0].input).toEqual({
      TableName: TABLE,
      Item: user,
    });
  });

  it('reactivate sets isActive=true and writes reactDate', async () => {
    docMock.on(UpdateCommand).resolves({});

    await repo.reactivate('7');

    const call = docMock.commandCalls(UpdateCommand)[0]!;
    expect(call.args[0].input).toMatchObject({
      TableName: TABLE,
      Key: { id: '7' },
      UpdateExpression: 'SET isActive = :active, reactDate = :now',
      ExpressionAttributeValues: {
        ':active': true,
        ':now': '2030-06-01T12:00:00.000Z',
      },
    });
  });

  it('deactivate sets isActive=false and writes endDate', async () => {
    docMock.on(UpdateCommand).resolves({});

    await repo.deactivate('7');

    const call = docMock.commandCalls(UpdateCommand)[0]!;
    expect(call.args[0].input).toMatchObject({
      TableName: TABLE,
      Key: { id: '7' },
      UpdateExpression: 'SET isActive = :inactive, endDate = :now',
      ExpressionAttributeValues: {
        ':inactive': false,
        ':now': '2030-06-01T12:00:00.000Z',
      },
    });
  });

  it('listActive scans with the isActive filter and returns all items', async () => {
    const userA: BotUser = {
      id: '1',
      isActive: true,
      isBot: false,
      isPremium: false,
      languageCode: 'en',
      firstName: 'Ada',
      lastName: '',
      username: '',
      startDate: '2025-01-01T00:00:00.000Z',
    };
    const userB: BotUser = { ...userA, id: '2', firstName: 'Bea' };

    docMock.on(ScanCommand).resolves({ Items: [userA, userB] });

    await expect(repo.listActive()).resolves.toEqual([userA, userB]);

    const call = docMock.commandCalls(ScanCommand)[0]!;
    expect(call.args[0].input).toMatchObject({
      TableName: TABLE,
      FilterExpression: 'isActive = :true',
      ExpressionAttributeValues: { ':true': true },
    });
  });

  it('listActive paginates through LastEvaluatedKey until exhausted', async () => {
    const page1 = [{ id: '1', isActive: true } as unknown as BotUser];
    const page2 = [{ id: '2', isActive: true } as unknown as BotUser];

    docMock
      .on(ScanCommand)
      .resolvesOnce({ Items: page1, LastEvaluatedKey: { id: '1' } })
      .resolvesOnce({ Items: page2 });

    const result = await repo.listActive();
    expect(result.map(u => u.id)).toEqual(['1', '2']);

    const calls = docMock.commandCalls(ScanCommand);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.args[0].input.ExclusiveStartKey).toEqual({ id: '1' });
  });

  it('listActive returns [] when the table is empty', async () => {
    docMock.on(ScanCommand).resolves({});
    await expect(repo.listActive()).resolves.toEqual([]);
  });
});
