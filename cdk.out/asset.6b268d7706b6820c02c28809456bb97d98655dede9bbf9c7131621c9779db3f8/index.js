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

const scanItemFromDynamoDB = async (id) => {
  const params = {
    TableName: ADMINS_TABLE,
    FilterExpression: "#id = :id",
    ExpressionAttributeNames: {
      "#id": "id",
    },
    ExpressionAttributeValues: {
      ":id": id 
    }
  }

  return docClient.scan(params).promise();
}

const updateItemOnDynamoDBByKey = async (item, key) => {
  const params = {
      TableName: ADMINS_TABLE,
      Key: {},
      ExpressionAttributeValues: {},
      ExpressionAttributeNames: {},
      UpdateExpression: "",
  };

  params["Key"][ADMINS_TABLE_PARTITION_KEY] = key;

  var prefix = "set ";
  const attributes = Object.keys(item);
  
  if(attributes.length == 1) {
    return;
  }

  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes[i];
    if (attribute != idAttributeName) {
      params["UpdateExpression"] += prefix + "#" + attribute + " = :" + attribute;
      params["ExpressionAttributeValues"][":" + attribute] = item[attribute]
      params["ExpressionAttributeNames"]["#" + attribute] = attribute;
      prefix = ", ";
    }
  }

  await docClient.update(params).promise();
}

const main = async (event, context, callback) => {
  const task = JSON.parse(event.body)
  const id = task.id
  const accountId = event.requestContext.authorizer.id
  
  var response;
  try {
    response = await scanItemFromDynamoDB(id)
    console.log(`Successfully retrieved item ${id} from dynamodb`);
  } catch (error) {
    handleError(callback, error)
  }

  console.log(response)

  if (response.Items[0].id !== accountId) {
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
    const email = response.Items[0].email;
    await updateItemOnDynamoDBByKey(task, email);
    console.log("Successfully updated item on dynamodb");
  } catch(error) {
    handleError(callback, error);
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
