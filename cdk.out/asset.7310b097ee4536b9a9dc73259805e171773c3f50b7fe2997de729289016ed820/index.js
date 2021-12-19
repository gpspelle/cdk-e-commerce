require("dotenv-safe").config();
const jwt = require('jsonwebtoken');

const main = async (event, context, callback) => {
    const token = event.authorizationToken;
    console.log(token, process.env.SECRET)
    if (!token) {
        callback("O token de autenticação não está presente no header de acesso, x-access-token.");
    }

    try {
        const payload = jwt.verify(token, process.env.SECRET);
        console.log(payload);
        const authResponse = {
            email: payload.email
        }

        return { statusCode: 200 };
    } catch (error) {
        callback('Falha ao autorizar o token jwt.');
    }
}

module.exports = { main }