import { SNSHandler } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
    throw new Error(
        "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
      );
    }

const client = new SESClient({ region: "eu-west-1" });

export const handler: SNSHandler = async (event: any) => {
    console.log("Event ", event);
    
    for (const snsRecord of event.Records) {
      const snsMessage = JSON.parse(snsRecord.Sns.Message);
  
      if (snsMessage.Records) {
        console.log("SNS Record ", JSON.stringify(snsMessage));
  
        for (const messageRecord of snsMessage.Records) {
          const s3e = messageRecord.s3;
          const srcBucket = s3e.bucket.name;
          const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
  
          try {
            const message = `We received your image. Its URL is s3://${srcBucket}/${srcKey}`;
            await sendEmailMessage(message);
          } catch (error: unknown) {
            console.log("ERROR is: ", error);
          }
        }
      }
    }
  };

async function sendEmailMessage(message: string) {
  const parameters: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: getHtmlContent(message),
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `New Image Upload`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
  //works together with earlier sendEmailMessage call to send the email
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
