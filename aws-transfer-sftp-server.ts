import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import {
  aws_s3 as s3,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_logs as logs,
  aws_cloudwatch as cw,
  aws_transfer as transfer,
  aws_lambda as lambda
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** Properties required to setup the SFTP server. */
export interface SftpServerStackProps extends StackProps {
  /** IP addresses that are allowed to connect to the SFTP server.
   * @default All IPV4 is allowed.
   */
  allowedIps?: string[];

  /** The S3 bucket to be configured for the SFTP server. */
  dataBucket: s3.IBucket;
}

/** Stack for initializing a fully working SFTP server. */
export class SftpServerStack extends Stack {

  /** CloudWatch alarm that is triggered if there are too many errors in the logs. */
  errorAlarm: cw.Alarm;

  constructor(scope: Construct, id: string, props: SftpServerStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: 2,
      natGateways: 0,
    });

    // Create the required IAM role which allows the SFTP server
    // to log to CloudWatch.
    const cloudWatchLoggingRole = new iam.Role(this, 'CloudWatchLoggingRole', {
      assumedBy: new iam.ServicePrincipal('transfer.amazonaws.com'),
      description: 'IAM role used by AWS Transfer for logging',
      inlinePolicies: {
        loggingRole: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: [
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:DescribeLogStreams',
              'logs:PutLogEvents',
            ],
            resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/transfer/*`],
            effect: iam.Effect.ALLOW,
          })],
        }),
      },
    });

    // Security group for restricting incoming traffic to specific IP addresses
    // At the moment, all IPV4 is allowed, but we may want to restrict this in the future
    const sg = new ec2.SecurityGroup(this, 'SftpServerSG', {
      vpc,
      allowAllOutbound: false,
      securityGroupName: 'SFTPServerSG',
      description: 'Security group for SFTP server',
    });

    // In production it's good to allow only specific IP addresses
    if (props.allowedIps) {
      props.allowedIps.forEach((ip) => {
        sg.addIngressRule(ec2.Peer.ipv4(ip), ec2.Port.tcp(22), 'Allow SSH inbound');
      });
    } else {
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH inbound');
    }

    // Create as many Elastic IP addresses as we have availability zones
    const eips = vpc.publicSubnets.map((_, index) => new ec2.CfnEIP(this, `SftpEIP${index + 1}`, {
      domain: 'vpc',
    }));

    // Create the lambda to be used as the identity provider
    const identityProviderLambda = new lambda.Function(this, 'IdentityProviderLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset('lambda/identity-provider'),
    });

    // Add resource-based policy to the lambda
    const principal = new iam.ServicePrincipal('transfer.amazonaws.com');
    identityProviderLambda.grantInvoke(principal);

    // Create the transfer server
    const server = new transfer.CfnServer(this, 'SFTPServer', {
      identityProviderType: 'AWS_LAMBDA',
      endpointType: 'PUBLIC',
      loggingRole: cloudWatchLoggingRole.roleArn,
      protocols: ['SFTP'],
      domain: 'S3',
      identityProviderDetails: {
        function: identityProviderLambda.functionArn,
        sftpAuthenticationMethods: "PASSWORD",
      },
      s3StorageOptions: {
        directoryListingOptimization: 'ENABLED',
      },
      securityPolicyName: "TransferSecurityPolicy-2018-11", // Need this policy to allow older ciphers required by the cameras
    });

    // Output Server Endpoint access where clients can connect
    new CfnOutput(this, 'SFTPServerEndpoint', {
      description: 'Server Endpoint',
      value: `${server.attrServerId}.server.transfer.${this.region}.amazonaws.com`,
    });

    // This policy allows access the S3 bucket
    const sftpAccessPolicy = new iam.ManagedPolicy(this, 'SftpAccessPolicy', {
      managedPolicyName: 'SftpAccessPolicy',
      description: 'SFTP access policy',
    });
    props.dataBucket.grantReadWrite(sftpAccessPolicy);

    // This role is granted upon successful authentication with lambda function
    const sftpUserAccessRole = new iam.Role(this, 'SftpAccessRole', {
      assumedBy: new iam.ServicePrincipal('transfer.amazonaws.com'),
      roleName: 'SftpAccessRole',
      managedPolicies: [
        sftpAccessPolicy,
      ],
    });

    // Create log group for the transfer server
    const logGroup = new logs.LogGroup(this, 'SftpLogGroup', {
      logGroupName: `/aws/transfer/${server.attrServerId}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // Metric filter for recognizing two types of errors in the SFTP logs
    const metricFilter = new logs.MetricFilter(this, 'MetricFilter', {
      logGroup,
      metricNamespace: 'SftpServer',
      metricName: 'ErrorLog',
      filterPattern: logs.FilterPattern.anyTerm('ERRORS AUTH_FAILURE', 'ERROR Message'),
      metricValue: '1',
      unit: cw.Unit.COUNT,
    });

    // Alarm if there are too many errors
    this.errorAlarm = new cw.Alarm(this, 'AlarmMetricFilter', {
      alarmDescription: 'Alarm if there are too many errors in the logs',
      metric: metricFilter.metric(),
      threshold: 1,
      evaluationPeriods: 5,
      datapointsToAlarm: 1,
    });
  }
}
