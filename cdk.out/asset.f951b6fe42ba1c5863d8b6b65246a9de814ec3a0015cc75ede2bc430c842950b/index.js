// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
const { 
  REGION, 
  PRODUCTS_TABLE,
  PRODUCTS_TABLE_PARTITION_KEY,
  PRODUCT_TAGS_TABLE,
  PRODUCT_TAGS_TABLE_PARTITION_KEY,
  IMAGES_BUCKET,
  NO_TAGS_STRING,
} = process.env;
// Set the region
AWS.config.update({ region: REGION })

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

  await docClient.update(params).promise()
}

const addProductToTag = async (tag, id) => {
  const params = {
    TableName: PRODUCT_TAGS_TABLE,
    Key: { [PRODUCT_TAGS_TABLE_PARTITION_KEY]: tag },
    ExpressionAttributeNames: {
      "#p": "products"
    },
    ExpressionAttributeValues: {
      ":id": docClient.createSet([id]),
    },
    UpdateExpression: "ADD #p :id",
  }

  await docClient.update(params).promise()
}


const getItemFromDynamoDB = async (id) => {
  const params = {
    TableName: PRODUCTS_TABLE,
    Key: { [PRODUCTS_TABLE_PARTITION_KEY]: id }
  }

  return docClient.get(params).promise();
}

const updateItemOnDynamoDB = async (item, idAttributeName) => {
  const params = {
      TableName: PRODUCTS_TABLE,
      Key: {},
      ExpressionAttributeValues: {},
      ExpressionAttributeNames: {},
      UpdateExpression: "",
  };

  params["Key"][idAttributeName] = item[idAttributeName];

  var setPrefix = "set ";
  var removePrefix = "remove ";

  const attributes = Object.keys(item);
  
  if(attributes.length == 1) {
    return;
  }

  var productImages;
  if (item.PRODUCT_IMAGES) {
    productImages = item.PRODUCT_IMAGES.map((image) => `https://${IMAGES_BUCKET}.s3.${REGION}.amazonaws.com/${item[idAttributeName]}/${encodeS3URI(image.name.replace(/ /g, ""))}`);
  }

  const removeAttributes = "removeAttributes"

  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes[i];

    if (attribute == removeAttributes) {
      continue;
    } else if (attribute != idAttributeName) {
      params["UpdateExpression"] += setPrefix + "#" + attribute + " = :" + attribute;

      if (attribute === "PRODUCT_IMAGES") {
        params["ExpressionAttributeValues"][":" + attribute] = productImages;
      } else if (attribute === "PRODUCT_TAGS") {
        params["ExpressionAttributeValues"][":" + attribute] = item[attribute].length > 0 ? docClient.createSet(item[attribute]) : docClient.createSet([NO_TAGS_STRING]);
      } else {
        params["ExpressionAttributeValues"][":" + attribute] = item[attribute]
      }

      params["ExpressionAttributeNames"]["#" + attribute] = attribute;
      setPrefix = ", ";
    }
  }

  if (item[removeAttributes]) {
    item.removeAttributes.forEach((removeAttribute) => {
      params["UpdateExpression"] += removePrefix + "#" + removeAttribute + " = :" + removeAttribute;
      params["ExpressionAttributeValues"][":" + removeAttribute] = item[removeAttribute]
      params["ExpressionAttributeNames"]["#" + removeAttribute] = removeAttribute;
      removePrefix = ", ";
    })
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
  const tags = task.PRODUCT_TAGS
  const images = task.PRODUCT_IMAGES
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
      if (tags && tags.includes(oldTag)) {
        continue;
      }

      try {
        await removeProductFromTag(oldTag, id)
      } catch (error) {
        handleError(callback, error)
      }
    }
  }

  if (tags) {
    for (const tag of tags) {
      if (oldTags && oldTags.includes(tag)) {
        continue;
      }
  
      try {
        await addProductToTag(tag, id)
      } catch (error) {
        handleError(callback, error)
      }
    }
  }

  // if images is defined we remove all the old images
  if (images) {
    try {
      await emptyS3Directory(IMAGES_BUCKET, `${id}/`);
      console.log(`Successfully deleted product ${id} from S3 bucket`);
    } catch (error) {
      handleError(callback, error);
    }
  }

  // update parameters on dynamodb
  try {
    await updateItemOnDynamoDB(task, PRODUCTS_TABLE_PARTITION_KEY);
    console.log("Successfully updated item on dynamodb");
  } catch(error) {
    handleError(callback, error);
  }

  // if images is defined, add the new images
  if (images) {
    images.forEach((image) => {
      const S3EncodedKey = `${id}/${encodeS3URI(image.name.replace(/ /g, ""))}`
      const base64Data = new Buffer.from(image.content.replace(/^data:image\/\w+;base64,/, ""), 'base64');
      const type = image.content.split(';')[0].split('/')[1];
    
      const S3Params = {
        Bucket: IMAGES_BUCKET,
        Key: S3EncodedKey, // File name you want to save as in S3
        Body: base64Data,
        ContentEncoding: 'base64', // required
        ContentType: `image/${type}` // required. Notice the back ticks
      } 
    
      // Uploading files to the bucket
      S3Client.upload(S3Params, function (error, data) {
        if (error) {
          handleError(callback, error);
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
      "Content-Type": "application/json"
    },
    isBase64Encoded: false
  });
}

module.exports = { main }
