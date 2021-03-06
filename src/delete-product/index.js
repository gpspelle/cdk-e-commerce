const DynamoDB = require("aws-sdk/clients/dynamodb")
const S3 = require("aws-sdk/clients/s3")
// Set the region
const { 
  REGION, 
  PRODUCTS_TABLE,
  PRODUCTS_TABLE_PARTITION_KEY,
  PRODUCT_TAGS_TABLE,
  PRODUCT_TAGS_TABLE_PARTITION_KEY,
  IMAGES_BUCKET 
} = process.env;

const ddb = new DynamoDB({ apiVersion: "2012-08-10", region: REGION })
const docClient = new DynamoDB.DocumentClient({ region: REGION });
const S3Client = new S3({ region: REGION })

const handleError = (error) => {
  console.error(error);

  return {
    statusCode: error.statusCode,
    body: JSON.stringify({ message: error.message }),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      'Content-Type': 'application/json'
    },
    isBase64Encoded: false
  };
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


exports.handler = async (event) => {
  const isActive = event.requestContext.authorizer.is_active
  if (isActive === "false" || isActive === undefined || isActive === false) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "N??o ?? permitido deletar produtos se a conta estiver desativada." }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        "Content-Type": "application/json"
      },
      isBase64Encoded: false
    };
  }

  const task = JSON.parse(event.body)
  const id = task.id
  const productOwnerId = event.requestContext.authorizer.id

  var response;
  try {
    response = await getItemFromDynamoDB(id)
    console.log(`Item recuperado com sucesso do dynamodb, ${id}`);
  } catch (error) {
    return handleError(error)
  }

  if (response.Item.PRODUCT_OWNER_ID !== productOwnerId) {
    return {
      statusCode: 403,
      body: JSON.stringify({ message: "Permiss??o de alterar o item negada." }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        "Content-Type": "application/json"
      },
      isBase64Encoded: false
    };
  }

  const oldTags = response.Item?.PRODUCT_TAGS?.values
  if (oldTags) {
    for (const oldTag of oldTags) {
      try {
        await removeProductFromTag(oldTag, id)
      } catch (error) {
        return handleError(error)
      }
    }
  }

  try {
    await emptyS3Directory(IMAGES_BUCKET, `${id}/`);
    console.log(`Item deletado com sucesso do s3 bucket, ${id}`);
  } catch (error) {
    return handleError(error)
  }


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
    console.log("Item deletado com sucesso do dynamodb");
  } catch(error) {
    return handleError(error)
  }

  return {
    statusCode: 200,
    body: JSON.stringify("Success"),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      'Content-Type': 'application/json'
    },
    isBase64Encoded: false
  };
}
