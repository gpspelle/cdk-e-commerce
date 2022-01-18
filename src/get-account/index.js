const DynamoDB = require("aws-sdk/clients/dynamodb")
const { REGION, ADMINS_TABLE } = process.env;
const docClient = new DynamoDB.DocumentClient({ region: REGION })

exports.handler = async (event) => {
  const accountId = event.requestContext.authorizer.id

  const params = {
    TableName: ADMINS_TABLE,
    ExclusiveStartKey: undefined,
    FilterExpression: `id = :id`,
    ProjectionExpression: "email, id, #n, commercial_name, phone_number, is_email_verified",
    ExpressionAttributeValues: {
      ":id": accountId 
    },
    ExpressionAttributeNames: {
      "#n": "name"
    }
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
    console.error(error);

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