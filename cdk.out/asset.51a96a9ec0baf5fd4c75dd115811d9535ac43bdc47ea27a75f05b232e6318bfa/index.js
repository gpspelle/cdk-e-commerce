const AWS = require('aws-sdk');
const jwt = require("jsonwebtoken");
const { 
    SES_EMAIL_FROM, 
    REGION,
    SECRET,
    ACCESS_TOKEN_NAME,
    CHANGE_FORGOT_PASSWORD_LINK,
    EMAIL_SIGNATURE,
		ADMIN_CUSTOM_DOMAIN,
    ADMINS_TABLE_PARTITION_KEY,
} = process.env;

// Set the region
AWS.config.update({ region: REGION })

const main = async (event) => {
  const task = JSON.parse(event.body);
	const email = task.email

	if (email === undefined) {
		throw new Error('Email não definido');
	}
    
  try {
		await sendEmail({ email });
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

  return JSON.stringify({
    body: {
      message: JSON.stringify("Email de recuperação de senha enviado.")
    },
    statusCode: 200,
  }); 
}

async function sendEmail({
  email,
}) {
  const ses = new AWS.SES({ region: REGION });
  return ses.sendEmail(sendEmailParams({ email })).promise();
}

function sendEmailParams({ email }) {
  return {
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Body: {
        Text: {
          Charset: 'UTF-8',
          Data: getTextContent({ email }),
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: 'Recuperação de senha',
      },
    },
    Source: SES_EMAIL_FROM,
  };
}

function getTextContent({ email }) {
  const token = jwt.sign({ id: email }, SECRET, {
    expiresIn: '24h'
  });

  const updatePasswordLink = `https://${ADMIN_CUSTOM_DOMAIN}/${CHANGE_FORGOT_PASSWORD_LINK}?${ACCESS_TOKEN_NAME}=${token}&${ADMINS_TABLE_PARTITION_KEY}=${email}`

  return `
    Prezado,

    Nós recebemos uma tentativa de recuperação de senha da conta vinculada a este email para usar o site de administração do E-commerce Loja das Artes.
    Caso você tenha feito esse pedido, clique no link abaixo para confirmar o seu email:

    ${updatePasswordLink}

    O link expira em 24 horas, após esse prazo, inicie o processo novamente.

    Caso você não tenha feito esse pedido, não clique no link. Pedimos que você nos informe sobre esse evento, mandando uma mensagem para um de nossos administradores.

    Atenciosamente,
    ${EMAIL_SIGNATURE}
  `;
}

module.exports = { main }
