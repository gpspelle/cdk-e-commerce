const DynamoDB = require("aws-sdk/clients/dynamodb")
const { REGION, PRODUCTS_TABLE } = process.env;
const config = {
  region: REGION,
};
const docClient = new DynamoDB.DocumentClient(config)

const main = async (event) => {
  const lastEvaluatedKey = event.queryStringParameters.key
  
  const params = {
    TableName: PRODUCTS_TABLE,
    ExclusiveStartKey: lastEvaluatedKey,
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
