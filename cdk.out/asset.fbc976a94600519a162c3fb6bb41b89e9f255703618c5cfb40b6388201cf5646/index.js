// Load the AWS SDK for Node.js
require("dotenv-safe").config();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
var AWS = require("aws-sdk");
// Set the region
AWS.config.update({ region: "us-east-1" });
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

const main = async (event) => {
    const task = JSON.parse(event.body)
    const email = task.email
    const params = {
        TableName: "admins",
        Key: {
            "email": { S: email},
        },
    }

    try {
        const result = await dynamodb.getItem(params).promise();
        const sha512Password = crypto.createHash('sha512').update(task.password).digest('hex');
        if (result.Item.password.S === sha512Password) {
            const id = result.Item.id.S;
            const token = jwt.sign({ id }, process.env.SECRET, {
              expiresIn: '24h'
            });

            return {
                statusCode: 200,
                body: JSON.stringify({ token }),
                headers: {
                    "Access-Control-Allow-Origin": "*", // Required for CORS support to work
                    "Content-Type": "application/json"
                },
                isBase64Encoded: false,
            }
        }
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify("Email ou senha incorretos."),
            headers: {
                "Access-Control-Allow-Origin": "*", // Required for CORS support to work
                "Content-Typ": "application/json"
            },
            isBase64Encoded: false,
        }
    }

    return {
        statusCode: 400,
        body: JSON.stringify("Email ou senha incorretos."),
        headers: {
            "Access-Control-Allow-Origin": "*", // Required for CORS support to work
            "Content-Typ": "application/json"
        },
        isBase64Encoded: false,
    }
}

module.exports = { main };
