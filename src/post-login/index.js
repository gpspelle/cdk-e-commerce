// Load the AWS SDK for Node.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const DynamoDB = require("aws-sdk/clients/dynamodb");
const { 
    SECRET,
    REGION,
    ADMINS_TABLE,
    ADMINS_TABLE_PARTITION_KEY, 
    HASH_ALG
} = process.env;

const dynamodb = new DynamoDB({ apiVersion: '2012-08-10', region: REGION });

exports.handler = async (event) => {
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
            const is_active = result.Item.is_active.BOOL;
            const token = jwt.sign({ id, is_active }, SECRET, {
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