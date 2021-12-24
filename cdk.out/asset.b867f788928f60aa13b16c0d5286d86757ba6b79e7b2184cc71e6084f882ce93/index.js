// Load the AWS SDK for Node.js
var AWS = require("aws-sdk");
const { 
    REGION,
    ADMINS_TABLE,
    ADMINS_TABLE_PARTITION_KEY,
} = process.env;
// Set the region
AWS.config.update({ region: REGION });

const docClient = new AWS.DynamoDB.DocumentClient();

const handleError = (callback, error) => {
    console.error(error);
  
    callback(null, {
        statusCode: error.statusCode,
        body: JSON.stringify({ message: "Erro desconhecido, tente novamente." }),
        headers: {
            "Access-Control-Allow-Origin": "*", // Required for CORS support to work
            "Content-Type": "application/json"
        },
        isBase64Encoded: false
    });
}

const addEmailVerificationToAccount = async (email) => {
    const params = {
      TableName: ADMINS_TABLE,
      Key: { [ADMINS_TABLE_PARTITION_KEY]: email },
      ExpressionAttributeNames: {
        "#v": "is_email_verified"
      },
      ExpressionAttributeValues: {
        ":verified": true,
      },
      UpdateExpression: "SET #v = :verified",
    }
  
    await docClient.update(params).promise()
}

const html = '\
    <html>\
            <style>\
                h1 { color: #73757d; }\
            </style>\
        <body>\
            <h1>Email verificado com sucesso!</h1>\
            <p>Seja bem vindo, novo lojista &#127881;</p>\
        </body>\
    </html>';

const main = async (event, context, callback) => {
    const email = event.requestContext.authorizer.lambda.email
    // update parameters on dynamodb
    try {
        await addEmailVerificationToAccount(email);
        console.log("Successfully updated item on dynamodb");
    } catch(error) {
        handleError(callback, error);
    }

    return {
        statusCode: 200,
        body: html,
        headers: {
            "Access-Control-Allow-Origin": "*", // Required for CORS support to work
            "Content-Type": "text/html"
        },
        isBase64Encoded: false,
    }
}

module.exports = { main };
