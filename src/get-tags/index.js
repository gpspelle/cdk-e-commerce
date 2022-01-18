// Load the AWS SDK for Node.js
const DynamoDB = require("aws-sdk/clients/dynamodb")
const { 
  REGION,
  PRODUCT_TAGS_TABLE,
  PRODUCT_TAGS_TABLE_PARTITION_KEY,
  NO_TAGS_STRING,
} = process.env;

const docClient = new DynamoDB.DocumentClient({ region: REGION })

exports.handler = async () => {
  const params = {
    TableName: PRODUCT_TAGS_TABLE,
    ExclusiveStartKey: undefined,
    FilterExpression: "#pk <> :no",
    ExpressionAttributeNames: {
      "#pk": PRODUCT_TAGS_TABLE_PARTITION_KEY,
    },
    ExpressionAttributeValues: {
      ":no": NO_TAGS_STRING 
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
    body: JSON.stringify(scanResults),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Access-Control-Allow-Credentials": true, // Required for cookies, authorization headers with HTTPS
    },
    isBase64Encoded: false,
  }
}