// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
const { v4: uuidv4 } = require("uuid")
const crypto = require("crypto");
// Set the region
const { 
    REGION, 
    ADMINS_TABLE,
    ADMINS_TABLE_PARTITION_KEY,
    HASH_ALG 
} = process.env;
AWS.config.update({ region: REGION })

// Create the DynamoDB service object
const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })

const handleError = (error) => {
    console.error(error);

    if (error.code === "ConditionalCheckFailedException") {
        return {
            statusCode: error.statusCode,
            body: JSON.stringify({ message: "O email utilizado já está em uso." }),
            headers: {
                "Access-Control-Allow-Origin": "*", // Required for CORS support to work
                "Content-Type": "application/json"
            },
            isBase64Encoded: false
        };
    }

    return {
        statusCode: error.statusCode,
        body: JSON.stringify({ message: error.message || "Erro desconhecido, tente novamente." }),
        headers: {
            "Access-Control-Allow-Origin": "*", // Required for CORS support to work
            "Content-Type": "application/json"
        },
        isBase64Encoded: false
    };
}

const isValidEmail = (email) =>
    String(email)
    .toLowerCase()
    .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )
var strongRegex = new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})");
const isValidPassword = (password) => strongRegex.test(password)

const main = async (event) => {
    const task = JSON.parse(event.body)
    const { email, name, commercialName, phoneNumber, password} = task
    const id = uuidv4()

    if (!isValidEmail(email)) {
        return handleError({ message: "Email inválido", statusCode: 400 });
    }

    if (!isValidPassword(password)) {
        return handleError({ message: "Senha inválida, leia atenciosamente os requisitos mínimos para criar uma senha válida.", statusCode: 400 });
    }

    const hashedPassword = crypto.createHash(HASH_ALG).update(password).digest('hex');

    const dynamodbParams = {
        TableName: ADMINS_TABLE,
        Item: {
            [ADMINS_TABLE_PARTITION_KEY]: { S: email.toLowerCase() },
            id: { S: id },
            name: { S: name },
            commercial_name: { S: commercialName },
            phone_number: { S: phoneNumber },
            password: { S: hashedPassword },
            is_email_verified: { BOOL: false },
        },
        ConditionExpression: "attribute_not_exists(#unique)",
        ExpressionAttributeNames : {
            "#unique" : ADMINS_TABLE_PARTITION_KEY,
        },
    }

    // Call DynamoDB to add the item to the table
    try {
        await ddb.putItem(dynamodbParams).promise()
    } catch (error) {
        return handleError(error)
    }

    return {
        statusCode: 200,
        body: JSON.stringify("Success"),
        headers: {
            "Access-Control-Allow-Origin": "*", // Required for CORS support to work
            "Content-Type": "application/json"
        },
        isBase64Encoded: false
    };

}

module.exports = { main }
