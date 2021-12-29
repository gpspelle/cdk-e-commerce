// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
const crypto = require("crypto");
const { 
  REGION, 
  ADMINS_TABLE,
  ADMINS_TABLE_PARTITION_KEY,
  HASH_ALG,
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

const getItemFromDynamoDB = async (task) => {
  const params = {
    TableName: ADMINS_TABLE,
    Key: { [ADMINS_TABLE_PARTITION_KEY]: task[ADMINS_TABLE_PARTITION_KEY] }
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

  var setPrefix = "set ";
  var removePrefix = "remove ";
  const attributes = Object.keys(task);
  
  if(attributes.length == 1) {
    return;
  }

  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes[i];

    if (attribute == "removeAttributes") {
      task[attribute].forEach((removeAttribute) => {
        params["UpdateExpression"] += removePrefix + "#" + removeAttribute + " = :" + removeAttribute;
        params["ExpressionAttributeValues"][":" + removeAttribute] = task[removeAttribute]
        params["ExpressionAttributeNames"]["#" + removeAttribute] = removeAttribute;
        removePrefix = ", ";
      })
    } else if (attribute != ADMINS_TABLE_PARTITION_KEY) {
      params["UpdateExpression"] += setPrefix + "#" + attribute + " = :" + attribute;
      params["ExpressionAttributeValues"][":" + attribute] = task[attribute]
      params["ExpressionAttributeNames"]["#" + attribute] = attribute;
      setPrefix = ", ";
    }
  }

  await docClient.update(params).promise();
}

const main = async (event, context, callback) => {
  var task = JSON.parse(event.body)
  const accountId = event.requestContext.authorizer.id
  
  var response;
  try {
    response = await getItemFromDynamoDB(task)
    console.log(`Successfully retrieved item from dynamodb`);
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

  if (task.oldPassword && task.newPassword) {
    const oldPasswordCandidate = task.oldPassword;
    const hashedOldPasswordCandidate = crypto.createHash(HASH_ALG).update(oldPasswordCandidate).digest('hex');
    if (response.Item.password !== hashedOldPasswordCandidate) {
      callback(null, {
        statusCode: 403,
        body: JSON.stringify({ message: "Senha incorreta." }),
        headers: {
          "Access-Control-Allow-Origin": "*", // Required for CORS support to work
          "Content-Type": "application/json"
        },
        isBase64Encoded: false
      });
    }

    const newPassword = task.newPassword
    const hashedNewPassword = crypto.createHash(HASH_ALG).update(newPassword).digest('hex');

    task = {
      // this is required because of a check of length 1 in the update function
      [ADMINS_TABLE_PARTITION_KEY]: response.Item[ADMINS_TABLE_PARTITION_KEY],
      password: hashedNewPassword
    }
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
