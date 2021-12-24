// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
// Set the region
const { 
  REGION, 
  PRODUCTS_TABLE,
  PRODUCTS_TABLE_PARTITION_KEY,
  PRODUCT_TAGS_TABLE,
  PRODUCT_TAGS_TABLE_PARTITION_KEY,
  IMAGES_BUCKET 
} = process.env;
AWS.config.update({ region: REGION })

const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })
const docClient = new AWS.DynamoDB.DocumentClient();
const S3Client = new AWS.S3()

const handleError = (callback, error) => {
  console.error(error);

  callback(null, {
    statusCode: error.statusCode,
    body: JSON.stringify({ message: "Erro desconhecido, tente novamente." }),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Content-Type": "application/json"
    },
    isBase64Encoded: false
  });
}

const getItemFromDynamoDB = async (id) => {
  const params = {
    TableName: PRODUCTS_TABLE,
    Key: { [PRODUCTS_TABLE_PARTITION_KEY]: id }
  }

  return docClient.get(params).promise();
}

const removeProductFromTag = async (oldTag, id) => {
  const params = {
    TableName: PRODUCT_TAGS_TABLE,
    Key: { [PRODUCT_TAGS_TABLE_PARTITION_KEY]: oldTag },
    ExpressionAttributeNames: {
      "#p": "products"
    },
    ExpressionAttributeValues: {
      ":id": docClient.createSet([id]),
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
  const productOwnerId = event.requestContext.authorizer.id

  var response;
  try {
    response = await getItemFromDynamoDB(id)
    console.log(`Successfully retrieved item ${id} from dynamodb`);
  } catch (error) {
    handleError(callback, error)
  }

  if (response.Item.PRODUCT_OWNER_ID !== productOwnerId) {
    callback(null, {
      statusCode: 403,
      body: JSON.stringify({ message: "Permissão de alterar o item negada." }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        "Content-Type": "application/json"
      },
      isBase64Encoded: false
    });
  }

  const oldTags = response.Item?.PRODUCT_TAGS?.values
  if (oldTags) {
    for (const oldTag of oldTags) {
      try {
        await removeProductFromTag(oldTag, id)
      } catch (error) {
        handleError(callback, error)
      }
    }
  }

  try {
    await emptyS3Directory(IMAGES_BUCKET, `${id}/`);
  } catch (error) {
    handleError(callback, error)
  }

  console.log(`Successfully deleted product ${id} from S3 bucket`);

  const dynamodbParams = {
    Key: {
      [PRODUCTS_TABLE_PARTITION_KEY]: {
        "S": id
      },
    }, 
    TableName: PRODUCTS_TABLE
  };

  try {
    await deleteItemFromDynamoDB(dynamodbParams);
    console.log("Successfully deleted item from dynamodb");
  } catch(error) {
    handleError(callback, error)
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
