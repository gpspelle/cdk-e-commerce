// Load the AWS SDK for Node.js
var AWS = require("aws-sdk")
// Set the region
AWS.config.update({ region: "us-east-1" })
const docClient = new AWS.DynamoDB.DocumentClient()

const main = async (event) => {
  const params = {
    TableName: "products",
    ExclusiveStartKey: undefined,
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

module.exports = { main }
