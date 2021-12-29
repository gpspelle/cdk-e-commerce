var AWS = require("aws-sdk");
const { 
    REGION,
    PRODUCTS_TABLE,
    PRODUCTS_TABLE_PARTITION_KEY, 
} = process.env;
// Set the region
AWS.config.update({ region: REGION });
const docClient = new AWS.DynamoDB.DocumentClient()

const updateExpiredLightningDeal = async (params, key) => {
    params.Key = { [PRODUCTS_TABLE_PARTITION_KEY]: key }
    await docClient.update(params).promise()
}

const main = async () => {
  const now = new Date()
  const nowISOString = now.toISOString()

  const getLightningDealsParams = {
    TableName: PRODUCTS_TABLE,
    ExclusiveStartKey: undefined,
    ExpressionAttributeNames: {
        "#pt": "PRODUCT_TYPE",
        "#et": "LIGHTING_DEAL_END_TIME"
    },
    ExpressionAttributeValues: {
        ":ld": "LIGHTING_DEAL",
        ":now": nowISOString
    },
    FilterExpression: "#pt = :ld AND #et <= :now",
  }

  const scanResults = []
  var items
  do {
    items = await docClient.scan(getLightningDealsParams).promise()
    items.Items.forEach((item) => scanResults.push(item))
    getLightningDealsParams.ExclusiveStartKey = items.LastEvaluatedKey
  } while (typeof items.LastEvaluatedKey !== "undefined");


  const updateLightningDealsParams = {
    TableName: PRODUCTS_TABLE,
    ExpressionAttributeNames: {
        "#pt": "PRODUCT_TYPE",
        "#dp": "DEAL_PRICE",
        "#ldp": "LIGHTING_DEAL_DURATION",
        "#ldst": "LIGHTING_DEAL_START_TIME",
        "#et": "LIGHTING_DEAL_END_TIME"
    },
    ExpressionAttributeValues: {
        ":n": "NORMAL",
        ":empty": "",
    },
    UpdateExpression: "SET #pt = :n, #dp = :empty, #ldp = :empty, #ldst = :empty, #et = :empty"
  }

  scanResults.forEach(async (item) => {
    await updateExpiredLightningDeal(updateLightningDealsParams, item[PRODUCTS_TABLE_PARTITION_KEY])
  })

  console.log(`${scanResults.length} ofertas relâmpago expiradas foram atualizados com sucesso.`)
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Sucesso." }),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Content-Type": "application/json"
    },
    isBase64Encoded: false
  }
}

module.exports = { main };
