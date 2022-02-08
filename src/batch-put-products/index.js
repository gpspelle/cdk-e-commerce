const DynamoDB = require("aws-sdk/clients/dynamodb")
// Set the region
const { 
  REGION, 
  PRODUCTS_TABLE,
} = process.env;

const ddb = new DynamoDB({ apiVersion: "2012-08-10", region: REGION })

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

const putItemOnDynamoDB = async (product) => {
  const params = {
    Item: product,
    TableName: PRODUCTS_TABLE
  };

  return ddb.putItem(params).promise();
}

exports.handler = async (event) => {
  const task = JSON.parse(event.body)
  const products = task.products
  const accountId = event.requestContext.authorizer.id

  products.forEach((product) => {
    if (product.PRODUCT_OWNER_ID.S !== accountId) {
      return handleError({ statusCode: 403, message: "Permissão de adicionar o produto negada " })
    }
  })

  const putPromises = products.map((product) =>
    putItemOnDynamoDB(product)
  )

  try {
    await Promise.all(putPromises)
    console.log("Produtos adicionados com sucesso")
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
