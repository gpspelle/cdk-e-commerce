const jwt = require("jsonwebtoken");
const {
    SECRET
} = process.env;

const main = async (event, context, callback) => {
    const token = event.queryStringParameters["x-access-token"];
    if (!token) {
        callback("O token de autenticação não está presente na requisição, x-access-token");
    }

    try {
        const payload = jwt.verify(token, SECRET);
        callback(null, generatePolicy("user", "Allow", event.methodArn, payload.email));
    } catch (error) {
        callback("Falha ao autorizar o token jwt.");
    }
}

// Help function to generate an IAM policy
const generatePolicy = function(principalId, effect, resource, email) {
    const authResponse = {};
    
    authResponse.principalId = principalId;
    if (effect && resource) {
        const policyDocument = {};
        policyDocument.Version = "2012-10-17";
        policyDocument.Statement = [];
        const statementOne = {};
        statementOne.Action = "execute-api:Invoke";
        statementOne.Effect = effect;
        statementOne.Resource = resource;
        policyDocument.Statement[0] = statementOne;
        authResponse.policyDocument = policyDocument;
    }
    
    authResponse.context = {
        email
    };

    return authResponse;
}

module.exports = { main }