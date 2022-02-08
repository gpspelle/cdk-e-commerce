const DynamoDB = require("aws-sdk/clients/dynamodb")
const { REGION, ADMINS_TABLE } = process.env;
const docClient = new DynamoDB.DocumentClient({ region: REGION })

exports.handler = async (event) => {
  const task = event.multiValueQueryStringParameters

  const params = {
    TableName: ADMINS_TABLE,
    ProjectionExpression: "id, phone_number, commercial_name, is_verified_email, #n, email, crop_profile_photo, about_me, about_products",
    ExclusiveStartKey: undefined,
    ExpressionAttributeNames: {
      "#n": "name"
    },
    FilterExpression: "is_active = :true",
    ExpressionAttributeValues: {
      ":true": true,
    },
  }

  if (task && task['productOwnerIds[]']) {
    const productOwnerIds = task['productOwnerIds[]'];
    const productOwnerIdsObject = {};
    var index = 0;
    productOwnerIds.forEach((productOwnerId) => {
        index++;
        const key = ":product_owner_id" + index;
        productOwnerIdsObject[key] = productOwnerId;
    });
  
    params.FilterExpression += " AND id IN (" + Object.keys(productOwnerIdsObject).toString() + ")";
    params.ExpressionAttributeValues = { ...params.ExpressionAttributeValues, ...productOwnerIdsObject };
  }

  const scanResults = []
  var items

  do {
    items = await docClient.scan(params).promise()
    items.Items.forEach((item) => scanResults.push(item))
    params.ExclusiveStartKey = items.LastEvaluatedKey
  } while (typeof items.LastEvaluatedKey !== "undefined")

  return {
    statusCode: 200,
    body: JSON.stringify(scanResults),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Access-Control-Allow-Credentials": true, // Required for cookies, authorization headers with HTTPS
    },
    isBase64Encoded: false,
  }
}