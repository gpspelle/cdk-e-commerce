const AWS = require('aws-sdk');
const jwt = require("jsonwebtoken");
const { 
    SES_EMAIL_FROM, 
    REGION,
    API_ENDPOINT,
    SECRET,
    ACCESS_TOKEN_NAME,
    EMAIL_VERIFICATION_LINK_ENDPOINT,
} = process.env;

// Set the region
AWS.config.update({ region: REGION })

const main = async (event, context) => {
  console.log(event);
  var record;
  if (event.Records && event.Records.length > 0) {
    record = event.Records[0];
  }

  var task;
  var email;
  var name;
  if (event.body) {
    task = JSON.parse(event.body);
    ({ email, name } = task);
  }

  if ((record && record.eventName == 'INSERT') || (email && name)) {
    
    if (!email || !name) {
      email = record.dynamodb.NewImage.email.S;
      name = record.dynamodb.NewImage.name.S;
    }
    
    try {
      if (!name || !email)
        throw new Error('Properties name and email are required');
  
      return await sendEmail({ name, email });
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        return JSON.stringify({
            body: {
              message: error.message
            },
            statusCode: error.statusCode
        });
      }
      return JSON.stringify({
        body: {
          message: JSON.stringify(error)
        },
        statusCode: 400,
      });
    }
  }

  return JSON.stringify({
    body: {
      message: JSON.stringify("A execução foi bem sucedida, mas não resultou em um email enviado.")
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
      message: 'Email enviado com sucesso.'
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

  const verificationLink = `${API_ENDPOINT}/${EMAIL_VERIFICATION_LINK_ENDPOINT}?${ACCESS_TOKEN_NAME}=${token}`

  return `
    Prezado ${name},

    Nós recebemos uma tentativa de autorização desse email para usar o site de administração do E-commerce Loja das Artes.
    Caso você tenha feito esse pedido, clique no link abaixo para confirmar o seu email:

    ${verificationLink}

    O link expira em 24 horas, após esse prazo, solicite um outro email na seção minha conta do site de administração.

    Caso você não tenha feito esse pedido, não clique no link. Pedimos que você nos informe sobre esse evento, mandando uma mensagem para um de nossos administradores.

    Atenciosamente,
    Loja das Artes
  `;
}

module.exports = { main }
