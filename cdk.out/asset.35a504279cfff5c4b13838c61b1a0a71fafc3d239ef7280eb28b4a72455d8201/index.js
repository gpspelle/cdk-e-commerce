// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
// Set the region
const REGION = "us-east-1"
AWS.config.update({ region: REGION })

const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })
const S3Client = new AWS.S3()
const tableName = "products"
const bucketName = "e-commerce-images-bucket"

const deleteItemFromDynamoDB = async (dynamodbParams) => {
  return await ddb.deleteItem(dynamodbParams).promise();
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
  const task = event.body
  const id = task.id

  try {
    await emptyS3Directory(bucketName, `${id}/`);
    console.log(`Successfuly deleted product ${id} from S3 bucket`);
  } catch (error) {
    console.error("Error", error);

    callback({
      statusCode: 400,
      body: JSON.stringify(error),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        'Content-Type': 'application/json'
      },
      isBase64Encoded: false
    });
  }

  const dynamodbParams = {
    Key: {
      "id": {
        "S": id
      },
    }, 
    TableName: tableName
  };

  try {
    await deleteItemFromDynamoDB(dynamodbParams);
    console.log("Successfuly deleted item from dynamodb");
  } catch(error) {
    console.error("Error", error);

    callback({
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
