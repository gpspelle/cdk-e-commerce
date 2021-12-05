// Load the AWS SDK for Node.js
var AWS = require("aws-sdk");
// Set the region
AWS.config.update({ region: "us-east-1" });
const docClient = new AWS.DynamoDB.DocumentClient();

const main = async (event, context, callback) => {
    const task = JSON.parse(event.body)
    const params = {
        TableName: "admins",
        Key: {
            "email": {"S": task.email},
        },
    }

    const result = await docClient.getItem(params).promise();

    if (result.Item.password.S === task.password) {
        return {
            statusCode: 200,
            body: JSON.stringify("success"),
            headers: {
                "Access-Control-Allow-Origin": "*", // Required for CORS support to work
                "Content-Typ": "application/json"
            },
            isBase64Encoded: false,
        }
    }

    return {
        statusCode: 400,
        body: JSON.stringify("fail"),
        headers: {
            "Access-Control-Allow-Origin": "*", // Required for CORS support to work
            "Content-Typ": "application/json"
        },
        isBase64Encoded: false,
    }
}

module.exports = { main };
