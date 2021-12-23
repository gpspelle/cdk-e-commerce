const jwt = require("jsonwebtoken");
const {
    SECRET
} = process.env;

const main = async (event) => {
    const response = {
        "isAuthorized": false
    };
    const token = event.queryStringParameters["token"];
    if (!token) {
        return response;
    }

    try {
        const payload = jwt.verify(token, SECRET);
        response.isAuthorized = false;
        response.context = {
            email: payload.email
        };
    
        return response;
    } catch (error) {
        console.error(error);
        return response;
    }
}

module.exports = { main }