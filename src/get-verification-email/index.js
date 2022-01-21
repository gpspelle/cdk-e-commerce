// Load the AWS SDK for Node.js
const DynamoDB = require("aws-sdk/clients/dynamodb");
const { 
    REGION,
    ADMINS_TABLE,
    ADMINS_TABLE_PARTITION_KEY,
} = process.env;

const docClient = new DynamoDB.DocumentClient({ region: REGION });

const handleError = (error) => {
    console.error(error);
  
    return {
        statusCode: error.statusCode,
        body: JSON.stringify({ message: "Erro desconhecido, tente novamente." }),
        headers: {
            "Access-Control-Allow-Origin": "*", // Required for CORS support to work
            "Content-Type": "application/json"
        },
        isBase64Encoded: false
    };
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

exports.handler = async (event) => {
    const email = event.requestContext.authorizer.lambda.email
    // update parameters on dynamodb
    try {
        await addEmailVerificationToAccount(email);
        console.log("Successfully updated item on dynamodb");
    } catch(error) {
        return handleError(error);
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