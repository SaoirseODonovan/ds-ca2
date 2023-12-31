import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

  // Tables
  //just like how tables were created in CA1 
    const imagesTable = new dynamodb.Table(this, "ImagesTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "ImageName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Images",
    });

    // Integration infrastructure

    const mailRejectionQueue = new sqs.Queue(this, "mail-rejection-queue", {
      queueName: "RejectionDLQ",
    });

    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: mailRejectionQueue,
        maxReceiveCount: 1,
      },
      retentionPeriod: cdk.Duration.seconds(60),
    });

    const allUserEventsTopic = new sns.Topic(this, "AllUserEventsTopic", {
      displayName: "All user events topic",
    });
    
    const confirmationMailerFn = new lambdanode.NodejsFunction(this, "confirmation-mailer-function", {
      runtime: lambda.Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/confirmationMailer.ts`,
    });

    const rejectionMailerFn = new lambdanode.NodejsFunction(this, "rejection-mailer-function", {
      runtime: lambda.Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
    });

    const updateTableFn = new lambdanode.NodejsFunction(this, "update-table-function", {
      runtime: lambda.Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/updateTables.ts`,
    });

    const processDeleteFn = new lambdanode.NodejsFunction(this, "process-delete-function", {
      runtime: lambda.Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/processDelete.ts`,
    });

    // const addDeleteMailerFn = new lambdanode.NodejsFunction(this, "add-delete-mailer-function", {
    //   runtime: lambda.Runtime.NODEJS_18_X,
    //   memorySize: 1024,
    //   timeout: cdk.Duration.seconds(3),
    //   entry: `${__dirname}/../lambdas/addDeleteMailer.ts`,
    // });

    //Reference for adding subscription to sns topic:https://docs.aws.amazon.com/cdk/api/v2/python/aws_cdk.aws_sns_subscriptions/LambdaSubscription.html

    allUserEventsTopic.addSubscription(
      new subs.LambdaSubscription(confirmationMailerFn));

    allUserEventsTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue) 
    );

    allUserEventsTopic.addSubscription(
      new subs.LambdaSubscription(processDeleteFn)
    );

    //as shown in snsstart lab archive
    allUserEventsTopic.addSubscription(
      new subs.LambdaSubscription(updateTableFn, {
        filterPolicy: {
          'comment_type': 
          sns.SubscriptionFilter.stringFilter({
            allowlist: ["Caption"]
        })
      }
    }
  ));

    // Lambda functions

    const processImageFn = new lambdanode.NodejsFunction(
      this,
      "ProcessImageFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        deadLetterQueue: mailRejectionQueue,
      }
    );

    // Event triggers

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(allUserEventsTopic)
    );

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.SnsDestination(allUserEventsTopic)
    );

    const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
    });

    processImageFn.addEventSource(newImageEventSource);

    const newRejectionEventSource = new events.SqsEventSource(mailRejectionQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
      maxConcurrency: 5
    });

    rejectionMailerFn.addEventSource(newRejectionEventSource);
    //permissions added under the hood by 'addEventSource'

    // Permissions

    imagesBucket.grantRead(processImageFn);
    imagesTable.grantReadWriteData(processImageFn);

    updateTableFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          //Reference for UpdateItem: https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateItem.html
          'dynamodb:UpdateItem'
        ],
        //Reference for .tableArn: https://stackoverflow.com/questions/75514180/is-there-a-way-to-create-a-dynamodb-table-with-ttl-and-pitr-enabled-with-the-jav
        resources: [imagesTable.tableArn],
      })
  );

    confirmationMailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    rejectionMailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    // Output

    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });
  }
}