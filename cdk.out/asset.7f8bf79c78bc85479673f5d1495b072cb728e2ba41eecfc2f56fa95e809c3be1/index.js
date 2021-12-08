// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
// Set the region
const REGION = "us-east-1"
AWS.config.update({ region: REGION })

const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })
const S3Client = new AWS.S3()
const tableName = "products"
const bucketName = "e-commerce-images-bucket"

const getItemfromDynamoDB = async (tableName, id) => { 
 var dynamodbGetParams = {
    Key: {
    "id": {
        S: id,
      }
    }, 
    TableName: tableName
  };

  return await ddb.getItem(dynamodbGetParams).promise();
}

const main = async (event, context, callback) => {
  const task = event.body
  const id = task.id

  // Call DynamoDB to remove the item to the table
  var data;
  try {
    data = await getItemfromDynamoDB(tableName, id);
    console.log("Successfuly read from dynamodb", data);
  } catch(error) {
    console.error("Error", error);

    callback(null, {
      statusCode: 400,
      body: JSON.stringify(error),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        'Content-Type': 'application/json'
      },
      isBase64Encoded: false
    });
  }
  
  console.log(data);
  
  const images = data.Item.PRODUCT_IMAGES;
  images.forEach((image) => {
  
    const S3Params = {
      Bucket: bucketName,
      Key: image.S,
    } 
  
    // Deleting files from the bucket
    S3Client.deleteObject(S3Params, function (err, data) {
      if (err) {
        console.error("Error", err)

        callback(null, {
          statusCode: 400,
          body: JSON.stringify(err),
          headers: {
            "Access-Control-Allow-Origin": "*", // Required for CORS support to work
            'Content-Type': 'application/json'
          },
          isBase64Encoded: false
        });
        
        return;
      }

      console.log(`File deleted from S3 bucket successfully. ${data.Location}`)
    })
  })

  callback(null, {
    statusCode: 200,
    body: JSON.stringify("Success"),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      'Content-Type': 'application/json'
    },
    isBase64Encoded: false
  });
}

module.exports = { main }
