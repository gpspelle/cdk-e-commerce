const amazonPay = require('@amazonpay/amazon-pay-api-sdk-nodejs');
const DynamoDB = require("aws-sdk/clients/dynamodb")

const {
  REGION,
  AMAZON_PAY_REGION,
  AMAZON_PAY_RETURN_URL,
  AMAZON_PAY_SIGNATURE_KEY,
  ADMINS_TABLE,
  ADMINS_TABLE_PARTITION_KEY,
} = process.env;

const docClient = new DynamoDB.DocumentClient({ region: REGION });

const getAdminFromDynamoDB = async (task) => {
  const params = {
    TableName: ADMINS_TABLE,
    Key: { [ADMINS_TABLE_PARTITION_KEY]: task[ADMINS_TABLE_PARTITION_KEY] }
  }

  return docClient.get(params).promise();
}

const updateAdminAmazonPaySignatureOnDynamoDB = async (task, item) => {
  const params = {
    TableName: ADMINS_TABLE,
    Key: {},
    ExpressionAttributeValues: {},
    ExpressionAttributeNames: {},
    UpdateExpression: "",
  };

  params["Key"][ADMINS_TABLE_PARTITION_KEY] = item[ADMINS_TABLE_PARTITION_KEY];
  params["UpdateExpression"] = "set #" + AMAZON_PAY_SIGNATURE_KEY + " = :" + AMAZON_PAY_SIGNATURE_KEY;
  params["ExpressionAttributeValues"][":" + AMAZON_PAY_SIGNATURE_KEY] = task[AMAZON_PAY_SIGNATURE_KEY]
  params["ExpressionAttributeNames"]["#" + AMAZON_PAY_SIGNATURE_KEY] = AMAZON_PAY_SIGNATURE_KEY;

  await docClient.update(params).promise();
}

const handleError = (error) => {
  console.error(error);

  return {
    statusCode: error.statusCode,
    body: JSON.stringify({ message: error.message || "Erro desconhecido, tente novamente." }),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Content-Type": "application/json"
    },
    isBase64Encoded: false
  };
}

exports.handler = async (event) => {

  const accountId = event.requestContext.authorizer.id
  const task = JSON.parse(event.body)

  let response;
  try {
    response = await getAdminFromDynamoDB(task)
    console.log("Admin recuperado do dynamodb com sucesso");
  } catch (error) {
    return handleError(error)
  }

  if (response.Item.id !== accountId && response.Item[ADMINS_TABLE_PARTITION_KEY] !== accountId) {
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

  const { amazon_pay_public_key, amazon_pay_private_key, amazon_pay_store_id } = response.Item

  const config = {
    publicKeyId: amazon_pay_public_key,
    privateKey: amazon_pay_private_key,
    region: AMAZON_PAY_REGION,
    sandbox: true
  };

  const amazonPayClient = new amazonPay.AmazonPayClient(config);
  const payload = {
    webCheckoutDetails: {
      checkoutReviewReturnUrl: AMAZON_PAY_RETURN_URL
    },
    storeId: amazon_pay_store_id
  };

  let signature;
  try {
    signature = amazonPayClient.generateButtonSignature(payload);
  } catch (error) {
    console.error(error);

    return {
      statusCode: error.statusCode,
      body: JSON.stringify({ message: "Erro desconhecido, tente novamente." }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      },
      isBase64Encoded: false,
    }
  }

  try {
    await updateAdminAmazonPaySignatureOnDynamoDB({ [AMAZON_PAY_SIGNATURE_KEY]: signature }, response.Item);
    console.log("Assinatura da Amazon Pay atualizada no dynamodb com sucesso");

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Amazon Pay configurado com sucesso" }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        "Content-Type": "application/json"
      },
      isBase64Encoded: false,
    }
  } catch(error) {
    return handleError(error);
  }
}