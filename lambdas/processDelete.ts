import { SNSHandler } from "aws-lambda";
import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: SNSHandler = async (event) => {
  for (const record of event.Records) {
    const message = JSON.parse(record.Sns.Message);
  
      if (message.Records) {
        for (const messageRecord of message.Records) {
          //Referenece for eventName status check: https://stackoverflow.com/questions/48546482/how-to-get-file-size-from-aws-s3-objectremoveddelete-event and https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html
          //mostly just played around with exploring the options presented when 'messageRecord.' is inserted for possible variables available
          if (messageRecord.eventName === 'ObjectRemoved:Delete') {

            const s3e = messageRecord.s3;
            const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

            const deleteCommand = new DeleteCommand({
            //process.env.TABLE_NAME,
              TableName: "Images",
              Key: {
                ImageName: srcKey,
              },
            });

            await ddbDocClient.send(deleteCommand);
        }
      }
    }
  }
};

function createDDbDocClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
      convertEmptyValues: true,
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
      wrapNumbers: false,
    };
    const translateConfig = { marshallOptions, unmarshallOptions };
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
  }
  
