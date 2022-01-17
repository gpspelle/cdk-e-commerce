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

const handleError = (error) => {
  console.error(error);

  return {
    statusCode: error.statusCode,
    body: JSON.stringify({ message: "Erro desconhecido, tente novamente." }),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Content-Type": "application/json"
    },
    isBase64Encoded: false
  };
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
  const attributes = Object.keys(task);
  
  if(attributes.length == 1) {
    return;
  }

  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes[i];
    if (attribute != ADMINS_TABLE_PARTITION_KEY) {
      params["UpdateExpression"] += setPrefix + "#" + attribute + " = :" + attribute;
      params["ExpressionAttributeValues"][":" + attribute] = task[attribute]
      params["ExpressionAttributeNames"]["#" + attribute] = attribute;
      setPrefix = ", ";
    }
  }

  await docClient.update(params).promise();
}

const isValidEmail = (email) =>
    String(email)
    .toLowerCase()
    .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )
const isValidPhoneNumber = (phoneNumber) => String(phoneNumber).match(/^\+?[1-9]\d{1,14}$/)
var strongRegex = new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})");
const isValidPassword = (password) => strongRegex.test(password)

const main = async (event) => {
  var task = JSON.parse(event.body)
  const accountId = event.requestContext.authorizer.id
  
  var response;
  try {
    response = await getItemFromDynamoDB(task)
    console.log("Item recuperado do dynamodb com sucesso");
  } catch (error) {
    return handleError(error)
  }

  if (response.Item.id !== accountId) {
    return {
      statusCode: 403,
      body: JSON.stringify({ message: "Permissão de alterar a conta negada." }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        "Content-Type": "application/json"
      },
      isBase64Encoded: false
    };
  }

  if (task.password !== undefined && !isValidEmail(email)) {
    return handleError({ message: "Email inválido", statusCode: 400 });
  }

  if (task.phoneNumber !== undefined && !isValidPhoneNumber(phoneNumber)) {
      return handleError({ message: "Número de telefone inválido", statusCode: 400 });
  }

  if (task.newPassword !== undefined && !isValidPassword(password)) {
      return handleError({ message: "Senha inválida, leia atenciosamente os requisitos mínimos para criar uma senha válida.", statusCode: 400 });
  }

  if (task.oldPassword && task.newPassword) {
    const oldPasswordCandidate = task.oldPassword;
    const hashedOldPasswordCandidate = crypto.createHash(HASH_ALG).update(oldPasswordCandidate).digest('hex');
    if (response.Item.password !== hashedOldPasswordCandidate) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: "Senha incorreta." }),
        headers: {
          "Access-Control-Allow-Origin": "*", // Required for CORS support to work
          "Content-Type": "application/json"
        },
        isBase64Encoded: false
      };
    }

    const newPassword = task.newPassword
    const hashedNewPassword = crypto.createHash(HASH_ALG).update(newPassword).digest('hex');

    task = {
      ...task,
      // this is required because of a check of length 1 in the update function
      [ADMINS_TABLE_PARTITION_KEY]: response.Item[ADMINS_TABLE_PARTITION_KEY],
      password: hashedNewPassword
    }

    delete task.oldPassword
    delete task.newPassword
  }

  // update parameters on dynamodb
  try {
    await updateItemOnDynamoDB(task, response.Item);
    console.log("Item atualizado no dynamodb com sucesso");
  } catch(error) {
    return handleError(error);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Conta modificada com sucesso." }),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Content-Type": "application/json"
    },
    isBase64Encoded: false
  };
}

module.exports = { main }
