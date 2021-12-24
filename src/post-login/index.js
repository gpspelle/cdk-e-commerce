// Load the AWS SDK for Node.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
var AWS = require("aws-sdk");
const { 
    SECRET,
    REGION,
    ADMINS_TABLE,
    ADMINS_TABLE_PARTITION_KEY, 
    HASH_ALG
} = process.env;
// Set the region
AWS.config.update({ region: REGION });
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

const main = async (event) => {
    const task = JSON.parse(event.body)
    const email = task.email
    const params = {
        TableName: ADMINS_TABLE,
        Key: {
            [ADMINS_TABLE_PARTITION_KEY]: { S: email },
        },
    }

    try {
        const result = await dynamodb.getItem(params).promise();
        const hashedPassword = crypto.createHash(HASH_ALG).update(task.password).digest('hex');
        if (result.Item.password.S === hashedPassword) {
            const id = result.Item.id.S;
            const token = jwt.sign({ id }, SECRET, {
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
                "Content-Type": "application/json"
            },
            isBase64Encoded: false,
        }
    }

    return {
        statusCode: 400,
        body: JSON.stringify("Email ou senha incorretos."),
        headers: {
            "Access-Control-Allow-Origin": "*", // Required for CORS support to work
            "Content-Type": "application/json"
        },
        isBase64Encoded: false,
    }
}

module.exports = { main };
