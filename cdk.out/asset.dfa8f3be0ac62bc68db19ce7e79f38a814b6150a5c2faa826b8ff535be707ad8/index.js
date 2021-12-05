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

/*!
 * node-s3-url-encode - Because s3 urls are annoying
 */

var encodings = {
  '\+': "%2B",
  '\!': "%21",
  '\"': "%22",
  '\#': "%23",
  '\$': "%24",
  '\&': "%26",
  '\'': "%27",
  '\(': "%28",
  '\)': "%29",
  '\*': "%2A",
  '\,': "%2C",
  '\:': "%3A",
  '\;': "%3B",
  '\=': "%3D",
  '\?': "%3F",
  '\@': "%40",
};

function encodeS3URI(filename) {
  return encodeURI(filename) // Do the standard url encoding
              .replace(
                  /(\+|!|"|#|\$|&|'|\(|\)|\*|\+|,|:|;|=|\?|@)/img,
                  function(match) { return encodings[match]; }
              );

}

const main = (event, context, callback) => {
  const task = JSON.parse(event.body)
  const name = task.name
  const description = task.description
  const price = task.price
  const images = task.images
  const productImages = images.map((image) => ({
      S: `https://${bucketName}.s3.${REGION}.amazonaws.com/${encodeS3URI(image.name)}`
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
    const S3EncodedKey = encodeS3URI(image.name)
    const base64Data = new Buffer.from(image.content.replace(/^data:image\/\w+;base64,/, ""), 'base64');
    const type = image.content.split(';')[0].split('/')[1];
  
    const S3Params = {
      Bucket: bucketName,
      Key: S3EncodedKey, // File name you want to save as in S3
      Body: base64Data,
      ContentEncoding: 'base64', // required
      ContentType: `image/${type}` // required. Notice the back ticks
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
