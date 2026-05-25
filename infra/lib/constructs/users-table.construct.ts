import { RemovalPolicy } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export type UsersTableProps = {
  tableName: string;
  /**
   * Whether the table should survive stack deletion. Production stacks pass
   * `true` so an accidental `cdk destroy` doesn't lose user records.
   */
  retainOnDelete?: boolean;
};

/**
 * DynamoDB table holding bot users.
 *
 * Schema:
 *   - Partition key: `id` (String) - Telegram user/chat id as string.
 *   - On-demand billing - cheapest option for a bot with bursty traffic.
 */
export class UsersTable extends Construct {
  readonly table: Table;

  constructor(scope: Construct, id: string, props: UsersTableProps) {
    super(scope, id);

    this.table = new Table(this, 'Table', {
      tableName: props.tableName,
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      removalPolicy: props.retainOnDelete
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,
    });
  }
}
