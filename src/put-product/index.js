const DynamoDB = require("aws-sdk/clients/dynamodb")
const S3 = require("aws-sdk/clients/s3")
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

// Create the DynamoDB service object
const ddb = new DynamoDB({ apiVersion: "2012-08-10", region: REGION })
var docClient = new DynamoDB.DocumentClient({ region: REGION });
const S3Client = new S3({ region: REGION })

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
const priceShouldbePositive = "O preço do produto deve ser maior do que zero"
const dealPriceShouldBePositive = "O preço promocional do produto deve ser maior do que zero"
const productStockCantBeNegativeOrZero = "O estoque não pode ser negativo ou zero"
const atLeastOneProductSellTypeIsRequired = "Pelo menos um tipo de venda é necessário para o produto"

exports.handler = async (event) => {
  const isActive = event.requestContext.authorizer.is_active
  if (isActive === "false" || isActive === undefined || isActive === false) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Não é permitido adicionar produtos se a conta estiver desativada." }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        "Content-Type": "application/json"
      },
      isBase64Encoded: false
    };
  }

  const task = JSON.parse(event.body)
  const name = task.name
  const description = task.description
  const price = task.price
  const tags = task.tags
  const images = task.images
  const coverImage = task.coverImage
  const productType = task.productType
  const productStock = task.productStock
  const productSellTypes = task.productSellTypes
  const productOwnerId = event.requestContext.authorizer.id

  const id = uuidv4()

  const productImages = images.map((image) => ({
      S: `http://${IMAGES_BUCKET}.s3.${REGION}.amazonaws.com/${id}/${encodeS3URI(image.name.replace(/ /g, ""))}`
  }))

  const productImagesResized = images.map((image) => ({
    S: `http://${IMAGES_BUCKET}.s3.${REGION}.amazonaws.com/${id}/resized-${encodeS3URI(image.name.replace(/ /g, ""))}`
  }))

  const productSellTypesInDynamodbNotation = productSellTypes.map((productSellType) => ({
    S: productSellType
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
      PRODUCT_STOCK: { N: productStock },
      PRODUCT_SELL_TYPES: { L: productSellTypesInDynamodbNotation },
    },
  }

  if (productSellTypes === undefined || productSellTypes.length === undefined || productSellTypes.length === 0) {
    return handleError({ message: atLeastOneProductSellTypeIsRequired, statusCode: 500 })
  }

  const productStockInt = parseInt(productStock, 10)

  if (productStockInt <= 0) {
    return handleError({ message: productStockCantBeNegativeOrZero, statusCode: 500 })
  }

  const priceInt = parseInt(price, 10)

  if (priceInt <= 0) {
    return handleError({ message: priceShouldbePositive, statusCode: 500 })
  }

  if (productType === "DEAL") {
    const dealPrice = task.dealPrice
    dynamodbParams.Item.DEAL_PRICE = { N: dealPrice }

    const dealPriceInt = parseInt(dealPrice, 10)

    if (dealPriceInt <= 0) {
      return handleError({ message: dealPriceShouldBePositive, statusCode: 500 })
    }

    if (dealPriceInt >= priceInt) {
      return handleError({ message: dealPriceIsHigherThanPrice, statusCode: 500 })
    }
  } else if (productType === "LIGHTNING_DEAL") {
    const lightningDealStartTime = task.lightningDealStartTime
    const lightningDealDuration = task.lightningDealDuration
    const lightningDealEndTime = task.lightningDealEndTime
    const dealPrice = task.dealPrice

    const dealPriceInt = parseInt(dealPrice, 10)

    if (dealPriceInt <= 0) {
      return handleError({ message: dealPriceShouldBePositive, statusCode: 500 })
    }

    if (dealPriceInt >= priceInt) {
      return handleError({ message: dealPriceIsHigherThanPrice, statusCode: 500 })
    }

    dynamodbParams.Item.LIGHTNING_DEAL_START_TIME = { S: lightningDealStartTime }
    dynamodbParams.Item.LIGHTNING_DEAL_END_TIME = { S: lightningDealEndTime }
    dynamodbParams.Item.LIGHTNING_DEAL_DURATION = { S: lightningDealDuration }
    dynamodbParams.Item.DEAL_PRICE = { N: dealPrice }
  }

  // Call DynamoDB to add the item to the table
  try {
    await ddb.putItem(dynamodbParams).promise()
  } catch (error) {
    console.error(error)
    return handleError({ message: "Erro ao inserir item no dynamodb", statusCode: 400 })
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