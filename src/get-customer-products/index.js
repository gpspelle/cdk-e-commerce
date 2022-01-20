const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { REGION, PRODUCTS_TABLE } = process.env;
const ddbClient = new DynamoDBClient({ region: REGION })

exports.handler = async (event) => {
  const lastEvaluatedKey = event.queryStringParameters.key
  
  const params = {
    TableName: PRODUCTS_TABLE,
    ExclusiveStartKey: lastEvaluatedKey,
  }

  const scanResults = []
  var items

  do {
    items = await ddbClient.send(new ScanCommand(params))
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