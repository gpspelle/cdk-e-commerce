// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
// Set the region
const REGION = "us-east-1"
AWS.config.update({ region: REGION })

const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })
const docClient = new AWS.DynamoDB.DocumentClient();
const S3Client = new AWS.S3()
const productsTable = "products"
const productTagsTable = "productTags"
const bucketName = "e-commerce-images-bucket"

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

const getItemFromDynamoDB = async (id) => {
  const params = {
    TableName: productsTable,
    Key: { id }
  }

  return docClient.get(params).promise();
}

const removeProductFromTag = async (oldTag, id) => {
  const params = {
    TableName: productTagsTable,
    Key: { TAG_NAME: oldTag },
    ExpressionAttributeNames: {
      "#p": "products"
    },
    ExpressionAttributeValues: {
      ":id": docClient.createSet(id),
    },
    UpdateExpression: "DELETE #p :id",
  }

  return docClient.update(params).promise()
}

const deleteItemFromDynamoDB = async (dynamodbParams) => {
  return ddb.deleteItem(dynamodbParams).promise();
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

  var response;
  try {
    response = await getItemFromDynamoDB(id)
    console.log(`Successfuly retrieved item ${id} from dynamodb`);
  } catch (error) {
    handleError(callback, error)
  }

  const oldTags = response.Item.PRODUCT_TAGS.values
  console.log(oldTags)
  for (const oldTag of oldTags) {
    try {
      await removeProductFromTag(oldTag, id)
    } catch (error) {
      handleError(callback, error)
    }
  }

  try {
    await emptyS3Directory(bucketName, `${id}/`);
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

  console.log(`Successfuly deleted product ${id} from S3 bucket`);

  const dynamodbParams = {
    Key: {
      "id": {
        "S": id
      },
    }, 
    TableName: productsTable
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
