// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
const { v4: uuidv4 } = require("uuid")
// Set the region
const REGION = "us-east-1"
AWS.config.update({ region: REGION })

// Create the DynamoDB service object
const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })
var docClient = new AWS.DynamoDB.DocumentClient();
const S3Client = new AWS.S3()
const productsTable = "products"
const productTagsTable = "productTags"
const bucketName = "e-commerce-images-bucket"

/*!
 * node-s3-url-encode - Because s3 urls are annoying
 */

var encodings = {
  '\+': "abc",
  '\!': "bcd",
  '\"': "cde",
  '\#': "def",
  '\$': "efg",
  '\&': "fgh",
  '\'': "ghi",
  '\(': "hij",
  '\)': "ijk",
  '\*': "jkl",
  '\,': "klm",
  '\:': "lmn",
  '\;': "mno",
  '\=': "nop",
  '\?': "opq",
  '\@': "pqr",
};

function encodeS3URI(filename) {
  return encodeURI(filename) // Do the standard url encoding
              .replace(
                  /(\+|!|"|#|\$|&|'|\(|\)|\*|\+|,|:|;|=|\?|@)/img,
                  function(match) { return encodings[match]; }
              );

}

const handleError = (callback, error) => {
  console.error("Error", error);

  callback({
    statusCode: 500,
    body: JSON.stringify(error),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      'Content-Type': 'application/json'
    },
    isBase64Encoded: false
  });
}

const main = async (event, context, callback) => {
  const task = JSON.parse(event.body)
  const name = task.name
  const description = task.description
  const price = task.price
  const tags = task.tags
  const images = task.images
  const productOwnerId = event.requestContext.authorizer.id;
  console.log(event)
  console.log(productOwnerId)
  const id = uuidv4()

  const productImages = images.map((image) => ({
      S: `https://${bucketName}.s3.${REGION}.amazonaws.com/${id}/${encodeS3URI(image.name.replace(/ /g, ""))}`
  }))

  const dynamodbParams = {
    TableName: productsTable,
    Item: {
      id: { S: id },
      PRODUCT_OWNER_ID: { S: productOwnerId },
      PRODUCT_NAME: { S: name },
      PRODUCT_DESCRIPTION: { S: description },
      PRODUCT_PRICE: { N: price },
      PRODUCT_IMAGES: { L: productImages },
    },
  }

  if (tags.length > 0) {
    dynamodbParams.Item.PRODUCT_TAGS = { SS: tags }
  }

  // Call DynamoDB to add the item to the table
  try {
    await ddb.putItem(dynamodbParams).promise()
  } catch (error) {
    handleError(callback, error)
  }

  tags.forEach((tag) => {
    const updateTagsParams = {
      TableName: productTagsTable,
      Key: {
        "TAG_NAME": tag
      },
      UpdateExpression: "ADD #p :start",
      ExpressionAttributeNames : {
        "#p" : "products"
      },
      ExpressionAttributeValues: {
        ":start": docClient.createSet([id]),
      },
      ReturnValues: "UPDATED_NEW",
    }

    docClient.update(updateTagsParams, function (err, data) {
      if (err) {
        console.error("Error", err)
  
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
  
      console.log(`Added product to tag on products tags table. ${data}`)
    })
  })

  images.forEach((image) => {
    const S3EncodedKey = `${id}/${encodeS3URI(image.name.replace(/ /g, ""))}`
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

        callback({
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
