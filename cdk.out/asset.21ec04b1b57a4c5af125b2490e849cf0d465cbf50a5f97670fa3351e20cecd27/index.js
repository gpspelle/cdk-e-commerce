// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
const { v4: uuidv4 } = require("uuid")
const { 
  REGION, 
  PRODUCTS_TABLE,
  PRODUCTS_TABLE_PARTITION_KEY,
  PRODUCT_TAGS_TABLE,
  PRODUCT_TAGS_TABLE_PARTITION_KEY,
  IMAGES_BUCKET,
  NO_TAGS_STRING
} = process.env;
// Set the region
AWS.config.update({ region: REGION })

// Create the DynamoDB service object
const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })
var docClient = new AWS.DynamoDB.DocumentClient();
const S3Client = new AWS.S3()

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

const dealPriceIsHigherThanPrice = "O preço promocional deve ser menor do que o preço padrão do produto"

const main = async (event) => {
  const task = JSON.parse(event.body)
  const name = task.name
  const description = task.description
  const price = task.price
  const tags = task.tags
  const images = task.images
  const coverImage = task.coverImage
  const productType = task.productType
  const productOwnerId = event.requestContext.authorizer.id
  const id = uuidv4()

  const productImages = images.map((image) => ({
      S: `https://${IMAGES_BUCKET}.s3.${REGION}.amazonaws.com/${id}/${encodeS3URI(image.name.replace(/ /g, ""))}`
  }))

  const productImagesResized = images.map((image) => ({
    S: `https://${IMAGES_BUCKET}.s3.${REGION}.amazonaws.com/${id}/resized-${encodeS3URI(image.name.replace(/ /g, ""))}`
  }))

  const dynamodbParams = {
    TableName: PRODUCTS_TABLE,
    Item: {
      [PRODUCTS_TABLE_PARTITION_KEY]: { S: id },
      PRODUCT_OWNER_ID: { S: productOwnerId },
      PRODUCT_NAME: { S: name },
      PRODUCT_DESCRIPTION: { S: description },
      PRODUCT_PRICE: { N: price },
      PRODUCT_IMAGES: { L: productImages },
      PRODUCT_IMAGES_RESIZED: { L: productImagesResized },
      PRODUCT_COVER_IMAGE: { S: coverImage },
      PRODUCT_TAGS: { SS: tags.length > 0 ? tags : [NO_TAGS_STRING] },
      PRODUCT_TYPE: { S: productType },
    },
  }

  if (productType === "DEAL") {
    const dealPrice = task.dealPrice
    dynamodbParams.Item.DEAL_PRICE = { N: dealPrice }

    console.log(dealPrice, price, typeof dealPrice, typeof price)
    if (dealPrice >= price) {
      return handleError({ message: dealPriceIsHigherThanPrice, statusCode: 500 })
    }
  } else if (productType === "LIGHTING_DEAL") {
    const lightingDealStartTime = task.lightingDealStartTime
    const lightingDealDuration = task.lightingDealDuration
    const lightingDealEndTime = task.lightingDealEndTime
    const dealPrice = task.dealPrice

    if (dealPrice >= price) {
      return handleError({ message: dealPriceIsHigherThanPrice, statusCode: 500 })
    }

    dynamodbParams.Item.LIGHTING_DEAL_START_TIME = { S: lightingDealStartTime }
    dynamodbParams.Item.LIGHTING_DEAL_END_TIME = { S: lightingDealEndTime }
    dynamodbParams.Item.LIGHTING_DEAL_DURATION = { S: lightingDealDuration }
    dynamodbParams.Item.DEAL_PRICE = { N: dealPrice }
  }

  // Call DynamoDB to add the item to the table
  try {
    await ddb.putItem(dynamodbParams).promise()
  } catch (error) {
    console.error(error)
    return handleError({ message: "Erro ao inserir item no dynamodb", statusCode: error.statusCode })
  }

  var promises = [];
  tags.forEach((tag) => {
    const updateTagsParams = {
      TableName: PRODUCT_TAGS_TABLE,
      Key: {
        [PRODUCT_TAGS_TABLE_PARTITION_KEY]: tag
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

    const promise = docClient.update(updateTagsParams).promise();
    promises.push(promise)
  })

  try {
    await Promise.all(promises)
    console.log("A tag dos produtos foram adicionadas na tabela de tags")
  } catch (error) {
    console.error(error)
    return handleError({ message: "Erro ao adicionar produto na tabela de tags", statusCode: 400 })
  }

  promises = [];

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
    promises.push(promise);
  })

  try {
    await Promise.all(promises);
    console.log("Imagens adicionadas ao s3 bucket com sucesso")
  } catch (error) {
    console.error(error)
    return handleError({ message: "Erro ao adicionar imagem no s3 bucket", statusCode: 400 })
  }

  promises = [];

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
    promises.push(promise);
  })

  try {
    await Promise.all(promises)
    console.log("Imagens redimensionadas adicionadas ao s3 bucket com sucesso")
  } catch (error) {
    console.error(error)
    return handleError({ message: "Erro ao adicionar imagem redimensionada no s3 bucket", statusCode: 400 })
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

module.exports = { main }
