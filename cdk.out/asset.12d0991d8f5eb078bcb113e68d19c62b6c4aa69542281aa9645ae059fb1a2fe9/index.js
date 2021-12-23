const jwt = require("jsonwebtoken");
const {
    SECRET
} = process.env;

const main = async (event) => {
    console.log(event);
    const response = {
        "isAuthorized": false
    };

    const token = event.queryStringParameters["x-access-token"];
    if (!token) {
        console.error("x-access-token not found", event)
        return response;
    }

    try {
        const payload = jwt.verify(token, SECRET);
        response.isAuthorized = false;
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

module.exports = { main }