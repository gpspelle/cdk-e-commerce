require("dotenv-safe").config();
const jwt = require('jsonwebtoken');

const main = (event, context, callback) => {
    const token = event.authorizationToken;
    console.log(token, process.env.SECRET)
    if (!token) {
        callback(null, {
            statusCode: 401,
            body: JSON.stringify({ message: 'O token de autenticação não está presente no header de acesso, x-access-token.' }),
            headers: {
                "Access-Control-Allow-Origin": "*", // Required for CORS support to work
                "Content-Type": "application/json"
            },
        })
    }

    jwt.verify(token, process.env.SECRET, function(error, decoded) {
        if (error) {
            callback(null, {
                statusCode: 403,
                body: JSON.stringify({ message: 'Falha ao autorizar o token jwt.'}),
                headers: {
                    "Access-Control-Allow-Origin": "*", // Required for CORS support to work
                    "Content-Type": "application/json"
                },
            })
        }
        
        // se tudo estiver ok, salva no request para uso posterior
        event.userId = decoded.id;
        callback();
    });

    console.log(event);
}

module.exports = { main }