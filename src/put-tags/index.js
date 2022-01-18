const DynamoDB = require("aws-sdk/clients/dynamodb")
const {
  REGION,
  PRODUCT_TAGS_TABLE,
  PRODUCT_TAGS_TABLE_PARTITION_KEY
} = process.env;

// Create the DynamoDB service object
const ddb = new DynamoDB({ apiVersion: "2012-08-10", region: REGION })

exports.handler = (event, context, callback) => {
  const task = JSON.parse(event.body)
  const names = task.names

  const requests = names.map((name) => {
    return { 
      PutRequest: {
        Item: {
          [PRODUCT_TAGS_TABLE_PARTITION_KEY]: { "S" : name }
        }
      }
    }
  })

  const params = {
    RequestItems: {
      [PRODUCT_TAGS_TABLE]: requests
    }
  }

  // Call DynamoDB to add the item to the table
  ddb.batchWriteItem(params, function(err) {
    if (err) {
      console.error(err)
      callback({
          statusCode: 400,
          body: JSON.stringify(err),
          headers: {
            "Access-Control-Allow-Origin": "*", // Required for CORS support to work
            'Content-Type': 'application/json'
          },
          isBase64Encoded: false
      });
    }
    
    callback(null, {
      statusCode: 200,
      body: JSON.stringify("Success"),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        'Content-Type': 'application/json'
      },
      isBase64Encoded: false
    });
  });

}