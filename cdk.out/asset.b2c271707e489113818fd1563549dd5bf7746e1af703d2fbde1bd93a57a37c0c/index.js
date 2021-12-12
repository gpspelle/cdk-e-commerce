// Load the AWS SDK for Node.js
var AWS = require("aws-sdk")
// Set the region
AWS.config.update({ region: "us-east-1" })
const ddb = new AWS.DynamoDB()

const main = (event) => {
  const task = JSON.parse(event)
  const id = task.id

  const params = {
    TableName: "products",
    Key: {
      "id": {
        S: id
      }
    }
  }

  ddb.getItem(params, function(err, data) {
    if (err) {
      callback({
        statusCode: 400,
        body: JSON.stringify(err),
        headers: {
          "Access-Control-Allow-Origin": "*", // Required for CORS support to work
          'Content-Type': 'application/json'
        },
        isBase64Encoded: false,
      });
    }
    
    callback(null, {
      statusCode: 200,
      body: JSON.stringify(data),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        'Content-Type': 'application/json'
      },
      isBase64Encoded: false,
    });
  });
}

module.exports = { main }
