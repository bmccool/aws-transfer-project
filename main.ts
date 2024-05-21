#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {
  aws_s3 as s3,
} from 'aws-cdk-lib';
import { SftpServerStack, SftpServerStackProps } from './aws-transfer-sftp-server';

// Follow the setup process at https://docs.aws.amazon.com/cdk/v2/guide/environments.html
const props: cdk.StackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  }
};

const app = new cdk.App();

// CREATE INCOMING DATASTACK DEV
const bucketStack = new cdk.Stack(app, 'IncomingDataStack-dev', props);
const bucket = new s3.Bucket(bucketStack, 'IncomingDataBucket', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  bucketName: `sftp-server-data-bucket-${props.env?.account}-${props.env?.region}`,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

const sftpProps: SftpServerStackProps = {
  dataBucket: bucket,
  ...props,
};

// CREATING SFTP SERVER STACK PROD
new SftpServerStack(app, 'SftpServerStack-prod', sftpProps);
