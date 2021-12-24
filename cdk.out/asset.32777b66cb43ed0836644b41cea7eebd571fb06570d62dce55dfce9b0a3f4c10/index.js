// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
const { 
  REGION, 
  ADMINS_TABLE,
  ADMINS_TABLE_PARTITION_KEY,
} = process.env;
// Set the region
AWS.config.update({ region: REGION })

const docClient = new AWS.DynamoDB.DocumentClient();

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
    TableName: ADMINS_TABLE,
    Key: { [ADMINS_TABLE_PARTITION_KEY]: id }
  }

  return docClient.get(params).promise();
}

const updateItemOnDynamoDB = async (task, item) => {
  const params = {
      TableName: ADMINS_TABLE,
      Key: {},
      ExpressionAttributeValues: {},
      ExpressionAttributeNames: {},
      UpdateExpression: "",
  };

  params["Key"][ADMINS_TABLE_PARTITION_KEY] = item[ADMINS_TABLE_PARTITION_KEY];

  var prefix = "set ";
  const attributes = Object.keys(task);
  
  if(attributes.length == 1) {
    return;
  }

  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes[i];
    if (attribute != ADMINS_TABLE_PARTITION_KEY) {
      params["UpdateExpression"] += prefix + "#" + attribute + " = :" + attribute;
      params["ExpressionAttributeValues"][":" + attribute] = task[attribute]
      params["ExpressionAttributeNames"]["#" + attribute] = attribute;
      prefix = ", ";
    }
  }

  await docClient.update(params).promise();
}

const main = async (event, context, callback) => {
  const task = JSON.parse(event.body)
  const email = task[ADMINS_TABLE_PARTITION_KEY]
  const accountId = event.requestContext.authorizer.id
  
  var response;
  try {
    response = await getItemFromDynamoDB(email)
    console.log(`Successfully retrieved item ${email} from dynamodb`);
  } catch (error) {
    handleError(callback, error)
  }

  if (response.Item.id !== accountId) {
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

  // update parameters on dynamodb
  try {
    await updateItemOnDynamoDB(task, response.Item);
    console.log("Successfully updated item on dynamodb");
  } catch(error) {
    handleError(callback, error);
  }

  callback(null, {
    statusCode: 200,
    body: JSON.stringify({ message: "Conta modificada com sucesso." }),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Content-Type": "application/json"
    },
    isBase64Encoded: false
  });
}

module.exports = { main }
