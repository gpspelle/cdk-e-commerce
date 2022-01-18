const DynamoDB = require("aws-sdk/clients/dynamodb")
const { REGION, PRODUCTS_TABLE, PRODUCTS_TABLE_PARTITION_KEY } = process.env;
const ddb = new DynamoDB({ region: REGION })

exports.handler = (event, context, callback) => {
  const task = event.queryStringParameters
  const id = task.id

  const params = {
    TableName: PRODUCTS_TABLE,
    Key: {
      [PRODUCTS_TABLE_PARTITION_KEY]: {
        S: id
      }
    }
  }

  ddb.getItem(params, function(err, data) {
    if (err) {
      callback(null, {
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