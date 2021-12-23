import AWS from 'aws-sdk';
import { 
    SES_EMAIL_FROM, 
    SES_REGION
} from '../../.env';

if (!SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    'Please add the SES_EMAIL_FROM and SES_REGION environment variables in an .env.ts file located in the root directory',
  );
}

// Set the region
AWS.config.update({ region: SES_REGION })

const main = async (event, context) => {
  const record = event.Recods[0];

  if (record.eventName == 'INSERT') {
    const email = record.dynamodb.NewImage.email.S;
    const name = record.dynamodb.NewImage.name.S;

    try {
      if (!name || !email)
        throw new Error('Properties name and email are required');
  
      return await sendEmail({name, email});
    } catch (error) {
      console.log('ERROR is: ', error);
      if (error instanceof Error) {
        return JSON.stringify({body: {error: error.message}, statusCode: 400});
      }
      return JSON.stringify({
        body: {error: JSON.stringify(error)},
        statusCode: 400,
      });
    }
  }

  return JSON.stringify({
    body: {error: JSON.stringify("error")},
    statusCode: 400,
  });
  
}

async function sendEmail({
  name,
  email,
}) {
  const message = "hello world";
  const ses = new AWS.SES({region: SES_REGION});
  await ses.sendEmail(sendEmailParams({name, email, message})).promise();

  return JSON.stringify({
    body: {message: 'Email sent successfully 🎉🎉🎉'},
    statusCode: 200,
  });
}

function sendEmailParams({name, email, message}) {
  return {
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: getHtmlContent({name, email, message}),
        },
        Text: {
          Charset: 'UTF-8',
          Data: getTextContent({name, email, message}),
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: `Email from example ses app.`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
}

function getHtmlContent({name, email, message}) {
  return `
    <html>
      <body>
        <h1>Received an Email. 📬</h1>
        <h2>Sent from: </h2>
        <ul>
          <li style="font-size:18px">👤 <b>${name}</b></li>
          <li style="font-size:18px">✉️ <b>${email}</b></li>
        </ul>
        <p style="font-size:18px">${message}</p>
      </body>
    </html> 
  `;
}

function getTextContent({name, email, message}) {
  return `
    Received an Email. 📬
    Sent from:
        👤 ${name}
        ✉️ ${email}
    ${message}
  `;
}

module.exports = { main }
