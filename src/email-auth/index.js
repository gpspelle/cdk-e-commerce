const jwt = require("jsonwebtoken");
const {
    SECRET,
    ACCESS_TOKEN_NAME
} = process.env;

exports.handler = async (event) => {
    const response = {
        "isAuthorized": false
    };

    const token = event.queryStringParameters[ACCESS_TOKEN_NAME];
    if (!token) {
        console.error(`${ACCESS_TOKEN_NAME} not found`, event)
        return response;
    }

    try {
        const payload = jwt.verify(token, SECRET);
        response.isAuthorized = true;
        response.context = {
            email: payload.email
        };
        
        console.log("Requisição autorizada com sucesso.");
        return response;
    } catch (error) {
        console.error(error);
        return response;
    }
}