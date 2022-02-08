const S3 = require("aws-sdk/clients/s3")
const { 
  REGION, 
  ADMINS_BUCKET,
  PRODUCTS_DUMP,
} = process.env;

const S3Client = new S3({ region: REGION })

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

const getS3Params = ({ accountId, fileName, fileContent }) => {
  const S3EncodedKey = `${accountId}/${fileName}`

  return {
    Bucket: ADMINS_BUCKET,
    Key: S3EncodedKey, // File name you want to save as in S3
    Body: fileContent,
    ContentType: "application/json",
    CacheControl: "no-cache",
  }
}

exports.handler = async (event) => {
  const isActive = event.requestContext.authorizer.is_active
  if (isActive === "false" || isActive === undefined || isActive === false) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Não é permitido salvar os seus produtos se a conta estiver desativada." }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        "Content-Type": "application/json"
      },
      isBase64Encoded: false
    };
  }

  const accountId = event.requestContext.authorizer.id
  const task = JSON.parse(event.body)
  const dumpProducts = task.dumpProducts

  const originalProfilePhotoS3Params = getS3Params({ accountId, fileName: PRODUCTS_DUMP, fileContent: dumpProducts })
  try {
    await S3Client.upload(originalProfilePhotoS3Params).promise();
  } catch (error) {
    return handleError({ message: "Erro ao adicionar uma cópia reserva dos produtos ao admin s3 bucket", statusCode: 500 })
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