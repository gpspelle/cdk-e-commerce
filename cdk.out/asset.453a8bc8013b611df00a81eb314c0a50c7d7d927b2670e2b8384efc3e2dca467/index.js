// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
const { v4: uuidv4 } = require("uuid")
// Set the region
const REGION = "us-east-1"
AWS.config.update({ region: REGION })

// Create the DynamoDB service object
const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })
const S3Client = new AWS.S3()
const tableName = "products"
const bucketName = "e-commerce-images-bucket"

const main = (event, context, callback) => {
  const task = JSON.parse(event.body)
  const name = task.name
  const description = task.description
  const price = task.price
  const images = task.images
  const productImages = images.map((image) => ({
    S: `https://${bucketName}.s3.${REGION}.amazonaws.com/${image.name}`,
  }))
  const dynamodbParams = {
    TableName: tableName,
    Item: {
      id: { S: uuidv4() },
      PRODUCT_NAME: { S: name },
      PRODUCT_DESCRIPTION: { S: description },
      PRODUCT_PRICE: { N: price },
      PRODUCT_IMAGES: { L: productImages },
    },
  }

  // Call DynamoDB to add the item to the table
  ddb.putItem(dynamodbParams, function (err, data) {
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
    
    console.log("Successfuly inserted on dynamodb", data)
  })

  images.forEach((image) => {
    const Key = image.name;
    const Body = Buffer.from(image.content, 'base64');
    const S3Params = {
      Bucket: bucketName,
      Key, // File name you want to save as in S3
      Body,
      ContentType: "mime/png"
    }
  
    // Uploading files to the bucket
    S3Client.upload(S3Params, function (err, data) {
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

      console.log(`File uploaded to S3 bucket successfully. ${data.Location}`)
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
