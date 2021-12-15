// Load the AWS SDK for Node.js
var AWS = require("aws-sdk");
// Set the region
AWS.config.update({ region: "us-east-1" });
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

const main = async (event) => {
    const task = JSON.parse(event.body)
    const params = {
        TableName: "admins",
        Key: {
            "username": {"S": task.username},
        },
    }

    const result = await dynamodb.getItem(params).promise();

    if (result.Item.password.S === task.password) {
        return {
            statusCode: 200,
            body: JSON.stringify({ token: "test123" }),
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
