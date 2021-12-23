const AWS = require('aws-sdk');
const jwt = require("jsonwebtoken");
const { 
    SES_EMAIL_FROM, 
    REGION,
    API_ENDPOINT,
    SECRET
} = process.env;

if (!SES_EMAIL_FROM || !REGION || !API_ENDPOINT || !SECRET) {
  throw new Error(
    'Please add the API_ENDPOINT, SES_EMAIL_FROM, SECRET and REGION environment variables.',
  );
}

// Set the region
AWS.config.update({ region: REGION })

const main = async (event, context) => {
  const record = event.Records[0];

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
        return JSON.stringify({
            body: {
                error: error.message
            },
            statusCode: 400
        });
      }
      return JSON.stringify({
        body: {
            error: JSON.stringify(error)
        },
        statusCode: 400,
      });
    }
  }

  return JSON.stringify({
    body: {
        message: JSON.stringify("only insert on dynamodb relates to an email.")
    },
    statusCode: 200,
  });
  
}

async function sendEmail({
  name,
  email,
}) {
  const message = "hello world";
  const ses = new AWS.SES({region: REGION});
  await ses.sendEmail(sendEmailParams({name, email, message})).promise();

  return JSON.stringify({
    body: {
        message: 'Email sent successfully 🎉🎉🎉'
    },
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
        Text: {
          Charset: 'UTF-8',
          Data: getTextContent({name, email, message}),
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: 'Verificação de endereço de email',
      },
    },
    Source: SES_EMAIL_FROM,
  };
}

function getTextContent({name, email}) {
  const token = jwt.sign({ email }, SECRET, {
    expiresIn: '24h'
  });

  const verificationLink = `${API_ENDPOINT}/email?token=${token}`

  return `
    Prezado ${name},

    Nós recebemos uma tentativa de autorização desse email para usar o site de administração do E-commerce Loja das Artes.
    Caso você tenha feito esse pedido, clique no link abaixo para confirmar o seu email:

    ${verificationLink}

    O link expira em 24 horas, contate a administração após esse prazo.

    Caso você não tenha feito esse pedido, não clique no link. Pedimos que você nos informe sobre esse evento, mandando uma mensagem para um de nossos administradores.

    Atenciosamente,
    Loja das Artes
  `;
}

module.exports = { main }
