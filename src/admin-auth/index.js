const jwt = require("jsonwebtoken");
const { 
    SECRET, 
    REGION, 
    ACCOUNT, 
    API_ID, 
    STAGE 
} = process.env;

exports.handler = async (event, context, callback) => {
    const token = event.authorizationToken;
    if (!token) {
        callback("O token de autenticação não está presente no header de acesso, x-access-token.");
    }

    try {
        const payload = jwt.verify(token, SECRET);
        const allowAllApiGWResources = `arn:aws:execute-api:${REGION}:${ACCOUNT}:${API_ID}/${STAGE}/*`;
        callback(null, generatePolicy("user", "Allow", allowAllApiGWResources, payload.id));
    } catch (error) {
        callback("Falha ao autorizar o token jwt.");
    }
}

// Help function to generate an IAM policy
const generatePolicy = function(principalId, effect, resource, id) {
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
        id
    };

    return authResponse;
}
