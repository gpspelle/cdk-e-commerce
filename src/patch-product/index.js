const DynamoDB = require("aws-sdk/clients/dynamodb")
const S3 = require("aws-sdk/clients/s3")
const { 
  REGION, 
  PRODUCTS_TABLE,
  PRODUCTS_TABLE_PARTITION_KEY,
  PRODUCT_TAGS_TABLE,
  PRODUCT_TAGS_TABLE_PARTITION_KEY,
  IMAGES_BUCKET,
  NO_TAGS_STRING,
} = process.env;

const docClient = new DynamoDB.DocumentClient({ region: REGION });
const S3Client = new S3({ region: REGION })

const handleError = (error) => {
  console.error(error);

  return {
    statusCode: error.statusCode,
    body: JSON.stringify({ message: error.message }),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Content-Type": "application/json"
    },
    isBase64Encoded: false
  };
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
  var removePrefix = " remove ";

  const attributes = Object.keys(item);
  
  if(attributes.length == 1) {
    return;
  }

  var productImages;
  var productImagesResized;
  if (item.reorderImages) {
    productImages = item.PRODUCT_IMAGES
    productImagesResized = item.PRODUCT_IMAGES_RESIZED
  } else if (item.PRODUCT_IMAGES) {
    productImages = item.PRODUCT_IMAGES.map((image) => `http://${IMAGES_BUCKET}.s3.${REGION}.amazonaws.com/${item[idAttributeName]}/${encodeS3URI(image.name.replace(/ /g, ""))}`);
    productImagesResized = item.PRODUCT_IMAGES.map((image) => `http://${IMAGES_BUCKET}.s3.${REGION}.amazonaws.com/${item[idAttributeName]}/resized-${encodeS3URI(image.name.replace(/ /g, ""))}`);
  }

  const removeAttributes = "removeAttributes"
  const reorderImages = "reorderImages"

  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes[i];

    if (attribute == removeAttributes || attribute == reorderImages) {
      continue;
    } else if (attribute != idAttributeName) {
      params["UpdateExpression"] += setPrefix + "#" + attribute + " = :" + attribute;

      if (attribute === "PRODUCT_IMAGES") {
        params["ExpressionAttributeValues"][":" + attribute] = productImages;
      } else if (attribute === "PRODUCT_IMAGES_RESIZED") {
        params["ExpressionAttributeValues"][":" + attribute] = productImagesResized;
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
      params["UpdateExpression"] += removePrefix + "#" + removeAttribute
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

const dealPriceIsHigherThanPrice = "O preço promocional deve ser menor do que o preço padrão do produto"
const priceShouldbePositive = "O preço do produto deve ser maior do que zero"
const dealPriceShouldBePositive = "O preço promocional do produto deve ser maior do que zero"

exports.handler = async (event) => {
  const task = JSON.parse(event.body)
  const id = task.id
  const tags = task.PRODUCT_TAGS
  const images = task.PRODUCT_IMAGES
  const productOwnerId = event.requestContext.authorizer.id
  const reorderImages = task.reorderImages
  const dealPrice = task.DEAL_PRICE
  const price = task.PRODUCT_PRICE

  var response;
  try {
    response = await getItemFromDynamoDB(id)
    console.log(`Item recuperado ${id} do dynamodb com sucesso`);
  } catch (error) {
    console.error(error)
    return handleError({ message: "Erro ao recuperar item do dynamodb", statusCode: error.statusCode })
  }

  if (response.Item.PRODUCT_OWNER_ID !== productOwnerId) {
    return {
      statusCode: 403,
      body: JSON.stringify({ message: "Permissão de alterar o item negada." }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        "Content-Type": "application/json"
      },
      isBase64Encoded: false
    };
  }

  const priceInt = parseInt(price, 10)

  if (priceInt <= 0) {
    return handleError({ message: priceShouldbePositive, statusCode: 500 })
  }
  
  const dealPriceInt = parseInt(dealPrice, 10)

  if (dealPriceInt <= 0) {
    return handleError({ message: dealPriceShouldBePositive, statusCode: 500 })
  }

  const isDealPriceDefined = typeof dealPrice !== undefined
  const isPriceDefined = typeof price !== undefined

  // changing the deal price
  if (isDealPriceDefined) {
    // changing the price, but the new deal price is higher than the new price
    if (isPriceDefined && dealPriceInt >= priceInt) {
      return handleError({ message: dealPriceIsHigherThanPrice, statusCode: 500 })
    } 
    // not changing the price, but the actual price is lower than the new deal price
    else if (!isPriceDefined && response.Item.PRODUCT_PRICE && dealPriceInt >= response.Item.PRODUCT_PRICE) {
      return handleError({ message: dealPriceIsHigherThanPrice, statusCode: 500 })
    }
  } 
  // changing the price, not changing the deal price, but the new price
  // is lower than the actual deal price
  else if (isPriceDefined && !isDealPriceDefined && response.Item.DEAL_PRICE && priceInt <= response.Item.DEAL_PRICE) {
    return handleError({ message: dealPriceIsHigherThanPrice, statusCode: 500 })
  }

  if (reorderImages) {
    const currentImagesOrder = response.Item.PRODUCT_IMAGES;
    task.PRODUCT_IMAGES = reorderImages.map(i => currentImagesOrder[i]);

    if (response.Item.PRODUCT_IMAGES_RESIZED) {
      const currentResizedImagesOrder = response.Item.PRODUCT_IMAGES_RESIZED;
      task.PRODUCT_IMAGES_RESIZED = reorderImages.map(i => currentResizedImagesOrder[i]);
    }
  }

  const oldTags = response.Item?.PRODUCT_TAGS?.values

  if (tags) {
    // remove old tags only if new tags are defined
    if (oldTags) {
      for (const oldTag of oldTags) {
        if (tags.includes(oldTag)) {
          continue;
        }
  
        try {
          await removeProductFromTag(oldTag, id)
        } catch (error) {
          console.error(error)
          return handleError({ message: "Erro ao remover produto de uma tag", statusCode: 400 })
        }
      }
    }

    for (const tag of tags) {
      if (oldTags && oldTags.includes(tag)) {
        continue;
      }
  
      try {
        await addProductToTag(tag, id)
      } catch (error) {
        console.error(error)
        return handleError({ message: "Erro ao adicionar produto a uma tag", statusCode: error.statusCode })
      }
    }
  }

  // if images is defined we remove all the old images
  if (images) {
    try {
      await emptyS3Directory(IMAGES_BUCKET, `${id}/`);
      console.log(`Item deletado ${id} do s3 bucket com sucesso`);
    } catch (error) {
      console.error(error)
      return handleError({ message: "Erro ao esvaziar s3 bucket com as imagens de um produto", statusCode: error.statusCode });
    }
  }

  // update parameters on dynamodb
  try {
    await updateItemOnDynamoDB(task, PRODUCTS_TABLE_PARTITION_KEY);
    console.log("Item atualizado no dynamodb com sucesso");
  } catch(error) {
    console.error(error)
    return handleError({ message: "Erro ao atualizar item no dynamodb", statusCode: error.statusCode });
  }

  // if images is defined, add the new images
  if (images) {
    var promises = [];

    // add normal images
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
      const promise = S3Client.upload(S3Params).promise();
      promises.push(promise)
    });

    try {
      await Promise.all(promises)
      console.log("Imagens adicionadas ao s3 bucket com sucesso.")
    } catch (error) {
      console.error(error)
      return handleError({ message: "Erro ao inserir imagem no s3 bucket", statusCode: 400 });
    }

    promises = []
    // add resized images
    images.forEach((image) => {
      const S3EncodedKey = `${id}/resized-${encodeS3URI(image.name.replace(/ /g, ""))}`
      const base64Data = new Buffer.from(image.contentResized.replace(/^data:image\/\w+;base64,/, ""), 'base64');
      const type = image.contentResized.split(';')[0].split('/')[1];
    
      const S3Params = {
        Bucket: IMAGES_BUCKET,
        Key: S3EncodedKey, // File name you want to save as in S3
        Body: base64Data,
        ContentEncoding: 'base64', // required
        ContentType: `image/${type}` // required. Notice the back ticks
      } 
    
      // Uploading files to the bucket
      const promise = S3Client.upload(S3Params).promise();
      promises.push(promise)
    });

    try {
      await Promise.all(promises)
      console.log("Imagens redimensionadas adicionadas ao s3 bucket com sucesso")
    } catch (error) {
      console.error(error)
      return handleError({ message: "Erro ao inserir imagem redimensionada no s3 bucket", statusCode: 400 });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify("Success"),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Content-Type": "application/json"
    },
    isBase64Encoded: false
  };
}