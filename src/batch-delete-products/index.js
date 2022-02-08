const DynamoDB = require("aws-sdk/clients/dynamodb")
// Set the region
const { 
  REGION, 
  PRODUCTS_TABLE,
  PRODUCTS_TABLE_PARTITION_KEY,
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

const getItemFromDynamoDB = async (id) => {
  const params = {
    Key: {
      [PRODUCTS_TABLE_PARTITION_KEY]: {
        "S": id
      },
    }, 
    TableName: PRODUCTS_TABLE
  };

  return ddb.getItem(params).promise();
}

const deleteItemFromDynamoDB = async (id) => {
  const params = {
    Key: {
      [PRODUCTS_TABLE_PARTITION_KEY]: {
        "S": id
      },
    }, 
    TableName: PRODUCTS_TABLE
  };

  return ddb.deleteItem(params).promise();
}

exports.handler = async (event) => {
  const isActive = event.requestContext.authorizer.is_active
  if (isActive === "false" || isActive === undefined || isActive === false) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Não é permitido deletar produtos se a conta estiver desativada." }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        "Content-Type": "application/json"
      },
      isBase64Encoded: false
    };
  }

  const task = JSON.parse(event.body)
  const productsIds = task.productsIds
  const accountId = event.requestContext.authorizer.id

  const getPromises = productsIds.map((id) =>
    getItemFromDynamoDB(id)
  )

  var items
  try {
    items = await Promise.all(getPromises)
    console.log("Items obtidos do dynamodb com sucesso")
  } catch (error) {
    console.error(error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Falha ao ler os produtos do dynamodb" }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        "Content-Type": "application/json"
      },
      isBase64Encoded: false
    };
  }

  items.forEach((item) => {
    if (item.Item.PRODUCT_OWNER_ID.S !== accountId) {
      return handleError({ statusCode: 403, message: "Permissão de deletar o produto negada " })
    }
  })

  const deletePromises = productsIds.map((id) =>
    deleteItemFromDynamoDB(id)
  )

  try {
    await Promise.all(deletePromises)
    console.log("Produtos deletados com sucesso")
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
