// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
// Set the region
const REGION = "us-east-1"
AWS.config.update({ region: REGION })

var docClient = new AWS.DynamoDB.DocumentClient();
const S3Client = new AWS.S3()
const tableName = "products"
const bucketName = "e-commerce-images-bucket"

const updateItemOnDynamoDB = async (tableName, item, idAttributeName) => {
  const params = {
      TableName: tableName,
      Key: {},
      ExpressionAttributeValues: {},
      ExpressionAttributeNames: {},
      UpdateExpression: "",
  };

  params["Key"][idAttributeName] = item[idAttributeName];

  var prefix = "set ";
  const attributes = Object.keys(item);
  
  if(attributes.length == 1) {
    return;
  }

  var productImages;
  if (item.PRODUCT_IMAGES) {
    productImages = item.PRODUCT_IMAGES.map((image) => `https://${bucketName}.s3.${REGION}.amazonaws.com/${item[idAttributeName]}/${encodeS3URI(image.name)}`);
  }

  for (let i = 0; i < attributes.length; i++) {
      let attribute = attributes[i];
      if (attribute != idAttributeName) {
          params["UpdateExpression"] += prefix + "#" + attribute + " = :" + attribute;
          params["ExpressionAttributeValues"][":" + attribute] = attribute === "PRODUCT_IMAGES" ? productImages : item[attribute];
          params["ExpressionAttributeNames"]["#" + attribute] = attribute;
          prefix = ", ";
      }
  }

  await docClient.update(params).promise();
}

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

async function emptyS3Directory(bucket, dir) {
  const listParams = {
      Bucket: bucket,
      Prefix: dir
  };

  const listedObjects = await S3Client.listObjectsV2(listParams).promise();

  if (listedObjects.Contents.length === 0) return;

  const deleteParams = {
      Bucket: bucket,
      Delete: { Objects: [] }
  };

  listedObjects.Contents.forEach(({ Key }) => {
      deleteParams.Delete.Objects.push({ Key });
  });

  await S3Client.deleteObjects(deleteParams).promise();

  if (listedObjects.IsTruncated) await emptyS3Directory(bucket, dir);
}


const main = async (event, context, callback) => {
  const task = JSON.parse(event.body)
  const id = task.id
  const images = task.PRODUCT_IMAGES

  // if images is defined we remove all the old images
  if (images) {
    try {
      await emptyS3Directory(bucketName, `${id}/`);
      console.log(`Successfuly deleted product ${id} from S3 bucket`);
    } catch (error) {
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
  }

  // update parameters on dynamodb
  try {
    await updateItemOnDynamoDB(tableName, task, "id");
    console.log("Successfuly updated item on dynamodb");
  } catch(error) {
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

  // if images is defined, add the new images
  if (images) {
    images.forEach((image) => {
      const S3EncodedKey = `${id}/${encodeS3URI(image.name)}`
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
            statusCode: 500,
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
