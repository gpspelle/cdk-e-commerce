// Load the AWS SDK for Node.js
var AWS = require("aws-sdk")
// Set the region
const { REGION, PRODUCTS_TABLE } = process.env;
AWS.config.update({ region: REGION })
const docClient = new AWS.DynamoDB.DocumentClient()

const main = async (event) => {
  const productOwnerId = event.requestContext.authorizer.id
  const lastEvaluatedKey = event.queryStringParameters.key

  const params = {
    TableName: PRODUCTS_TABLE,
    ExclusiveStartKey: lastEvaluatedKey,
    FilterExpression: "#owner = :id",
    ExpressionAttributeNames: {
        "#owner": "PRODUCT_OWNER_ID",
    },
    ExpressionAttributeValues: {
         ":id": productOwnerId 
    }
  }

  const scanResults = []
  var items

  do {
    items = await docClient.scan(params).promise()
    items.Items.forEach((item) => scanResults.push(item))
    params.ExclusiveStartKey = items.LastEvaluatedKey
  } while (typeof items.LastEvaluatedKey !== "undefined")

  return {
    statusCode: 200,
    body: JSON.stringify( { data: scanResults, key: undefined }),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Access-Control-Allow-Credentials": true, // Required for cookies, authorization headers with HTTPS
    },
    isBase64Encoded: false,
  }
}

module.exports = { main }
