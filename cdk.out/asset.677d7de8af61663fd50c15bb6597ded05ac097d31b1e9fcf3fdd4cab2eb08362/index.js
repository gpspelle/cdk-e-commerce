// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
// Set the region
const REGION = "us-east-1"
AWS.config.update({ region: REGION })

const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })
const S3Client = new AWS.S3()
const tableName = "products"
const bucketName = "e-commerce-images-bucket"

const getItemfromDynamoDB = async (dynamodbParams) => { 
  return await ddb.getItem(dynamodbParams).promise();
}

const deleteItemfromS3 = async (S3Params) => { 
  return await S3Client.deleteObject(S3Params).promise();
}

const deleteItemFromDynamoDB = async (dynamodbParams) => {
  return await ddb.deleteItem(dynamodbParams).promise();
}

const main = async (event, context, callback) => {
  const task = event.body
  const id = task.id

  const dynamodbParams = {
    Key: {
      "id": {
        "S": id
      },
    }, 
    TableName: tableName
  };

  var data;
  try {
    data = await getItemfromDynamoDB(dynamodbParams);
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
  
  const images = data.Item.PRODUCT_IMAGES.L;
  images.forEach(async (image) => {
    const S3Params = {
      Bucket: bucketName,
      Key: image.S,
    } 
  
    console.log(S3Params)
    // Deleting files from the bucket
    try {
      await deleteItemfromS3(S3Params);
      console.log(`File deleted from S3 bucket successfully. ${image.S}`)
    } catch (error) {
      console.error("Error", error)
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
  })

  try {
    await deleteItemFromDynamoDB(dynamodbParams);
    console.log("Successfuly deleted item from dynamodb");
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
