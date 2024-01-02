import { DynamoDBStreamHandler } from 'aws-lambda';
import { SESClient, SendEmailCommandInput, SendEmailCommand} from '@aws-sdk/client-ses';
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from '../env';

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    'Please add the SES_EMAIL_TO, SES_EMAIL_FROM, and SES_REGION environment variables in an env.js file located in the root directory'
  );
}

let current = "";

const client = new SESClient({ region: SES_REGION });

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {

        let message = "";

        //from dynamodb event
        //Reference for dynamodb: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html
        const srcKey = record.dynamodb?.Keys?.ImageName?.S;
            if (record.eventName === "INSERT") {
                current = 'Image Inserted'
                message = `Your image: ${srcKey} has been inserted into the DynamoDB table.`;
            } else if (record.eventName === "REMOVE") {
                current = 'Image Deleted'
                message = `Your image: ${srcKey} has been deleted from the DynamoDB table.`;
            }

         await sendConfirmationEmail(message);
    }
}

async function sendConfirmationEmail(message: string) {
  const parameters: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: getHtmlContent(message),
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: `${current}`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
  await client.send(new SendEmailCommand(parameters));
}

function getHtmlContent(message: string) {
  return `
    <html>
      <body>
        <p style="font-size:18px">${message}</p>
      </body>
    </html> 
  `;
}
