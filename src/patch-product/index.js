// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
// Set the region
const REGION = "us-east-1"
AWS.config.update({ region: REGION })

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

const removeProductFromTag = async (oldTag, id) => {
  const params = {
    TableName: productTagsTable,
    Key: { TAG_NAME: oldTag },
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
    TableName: productTagsTable,
    Key: { TAG_NAME: tag },
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
    TableName: productsTable,
    Key: { id }
  }

  return docClient.get(params).promise();
}

const updateItemOnDynamoDB = async (item, idAttributeName) => {
  const params = {
      TableName: productsTable,
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
    productImages = item.PRODUCT_IMAGES.map((image) => `https://${bucketName}.s3.${REGION}.amazonaws.com/${item[idAttributeName]}/${encodeS3URI(image.name.replace(/ /g, ""))}`);
  }

  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes[i];
    if (attribute != idAttributeName) {
      params["UpdateExpression"] += prefix + "#" + attribute + " = :" + attribute;

      if (attribute === "PROUCT_IMAGES") {
        params["ExpressionAttributeValues"][":" + attribute] = productImages;
      } else if (attribute === "PRODUCT_TAGS") {
        params["ExpressionAttributeValues"][":" + attribute] = docClient.createSet(item[attribute]);
      } else {
        params["ExpressionAttributeValues"][":" + attribute] = item[attribute]
      }

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
  const tags = task.PRODUCT_TAGS
  const images = task.PRODUCT_IMAGES

  if (tags) {
    var response;
    try {
      response = await getItemFromDynamoDB(id)
      console.log(`Successfuly retrieved item ${id} from dynamodb`);
    } catch (error) {
      handleError(callback, error)
    }

    const oldTags = response.Item?.PRODUCT_TAGS?.values

    if (oldTags) {
      for (const oldTag of oldTags) {
        if (tags.includes(oldTag)) {
          continue;
        }
  
        try {
          await removeProductFromTag(oldTag, id)
        } catch (error) {
          handleError(callback, error)
        }
      }
    }

    for (const tag of tags) {
      if (oldTags.includes(tag)) {
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
      await emptyS3Directory(bucketName, `${id}/`);
      console.log(`Successfuly deleted product ${id} from S3 bucket`);
    } catch (error) {
      handleError(callback, error);
    }
  }

  // update parameters on dynamodb
  try {
    await updateItemOnDynamoDB(task, "id");
    console.log("Successfuly updated item on dynamodb");
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
        Bucket: bucketName,
        Key: S3EncodedKey, // File name you want to save as in S3
        Body: base64Data,
        ContentEncoding: 'base64', // required
        ContentType: `image/${type}` // required. Notice the back ticks
      } 
    
      // Uploading files to the bucket
      S3Client.upload(S3Params, function (err, data) {
        if (err) {
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
      'Content-Type': 'application/json'
    },
    isBase64Encoded: false
  });
}

module.exports = { main }
