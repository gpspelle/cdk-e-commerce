const AWS = require('aws-sdk');
const jwt = require("jsonwebtoken");
const { 
    SES_EMAIL_FROM, 
    REGION,
    API_ENDPOINT,
    SECRET,
    ACCESS_TOKEN_NAME,
} = process.env;

if (!SES_EMAIL_FROM || !REGION || !API_ENDPOINT || !SECRET || !ACCESS_TOKEN_NAME) {
  throw new Error(
    'Please add the ACCESS_TOKEN_NAME, API_ENDPOINT, SES_EMAIL_FROM, SECRET and REGION environment variables.',
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
  
      return await sendEmail({ name, email });
    } catch (error) {
      console.error(error);
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
      message: JSON.stringify("Apenas mudanças do tipo inserção disparam um email.")
    },
    statusCode: 200,
  });
  
}

async function sendEmail({
  name,
  email,
}) {
  const ses = new AWS.SES({ region: REGION });
  await ses.sendEmail(sendEmailParams({ name, email })).promise();

  return JSON.stringify({
    body: {
      message: 'Email sent successfully 🎉🎉🎉'
    },
    statusCode: 200,
  });
}

function sendEmailParams({ name, email }) {
  return {
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Body: {
        Text: {
          Charset: 'UTF-8',
          Data: getTextContent({name, email}),
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

function getTextContent({ name, email }) {
  const token = jwt.sign({ email }, SECRET, {
    expiresIn: '24h'
  });

  const verificationLink = `${API_ENDPOINT}/email?${ACCESS_TOKEN_NAME}=${token}`

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
