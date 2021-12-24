// Load the AWS SDK for Node.js
var AWS = require("aws-sdk")
const { REGION, ADMINS_TABLE } = process.env;
// Set the region
AWS.config.update({ region: REGION })
const docClient = new AWS.DynamoDB.DocumentClient()

const main = async (event) => {
  const accountId = event.requestContext.authorizer.id

  const params = {
    TableName: ADMINS_TABLE,
    ExclusiveStartKey: undefined,
    FilterExpression: `id = ${accountId}`,
    ProjectionExpression: "email, id, name, commercial_name, phone_number, is_email_verified",
  }

  try {
    const items = await docClient.scan(params).promise()

    return {
      statusCode: 200,
      body: JSON.stringify(items.Items),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      },
      isBase64Encoded: false,
    }
  } catch (error) {
    return {
      statusCode: error.statusCode,
      body: JSON.stringify({ message: "Erro desconhecido, tente novamente." }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      },
      isBase64Encoded: false,
    }
  }
}

module.exports = { main }
