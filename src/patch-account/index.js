const DynamoDB = require("aws-sdk/clients/dynamodb")
const S3 = require("aws-sdk/clients/s3")
const { v4: uuidv4 } = require("uuid")
const crypto = require("crypto");
const { 
  REGION, 
  ADMINS_TABLE,
  ADMINS_TABLE_PARTITION_KEY,
  HASH_ALG,
  ADMINS_BUCKET,
  SAME_ORIGINAL_PROFILE_PHOTO_STRING,
} = process.env;

const docClient = new DynamoDB.DocumentClient({ region: REGION });
const S3Client = new S3({ region: REGION })

async function emptyS3Directory(bucket, dir) {
  const listParams = {
      Bucket: bucket,
      Prefix: dir
  };

  const listedObjects = await S3Client.listObjectsV2(listParams).promise();

  if (listedObjects.Contents.length === 0) return;

  const deleteParams = {
      Bucket: bucket,
      Delete: { Objects: [] }
  };

  listedObjects.Contents.forEach(({ Key }) => {
      deleteParams.Delete.Objects.push({ Key });
  });

  await S3Client.deleteObjects(deleteParams).promise();

  if (listedObjects.IsTruncated) await emptyS3Directory(bucket, dir);
}

async function emptyS3Directory(bucket, dir, keepOriginalProfilePhoto) {
  const listParams = {
    Bucket: bucket,
    Prefix: dir
  };

  const listedObjects = await S3Client.listObjectsV2(listParams).promise();

  if (listedObjects.Contents.length === 0) return;

  const deleteParams = {
    Bucket: bucket,
    Delete: { Objects: [] }
  };

  listedObjects.Contents.forEach(({ Key }) => {
    if (keepOriginalProfilePhoto && Key.includes(originalProfilePhotoId)) {
      console.log("Não remover a foto original")
    } else {
      deleteParams.Delete.Objects.push({ Key });
    }
  });

  await S3Client.deleteObjects(deleteParams).promise();

  if (listedObjects.IsTruncated) await emptyS3Directory(bucket, dir, keepOriginalProfilePhoto);
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

const getS3Params = ({ accountId, imageName, imageContent }) => {
  const S3EncodedKey = `${accountId}/${imageName}`
  const base64Data = new Buffer.from(imageContent.replace(/^data:image\/\w+;base64,/, ""), 'base64');
  const type = imageContent.split(';')[0].split('/')[1];

  return {
    Bucket: ADMINS_BUCKET,
    Key: S3EncodedKey, // File name you want to save as in S3
    Body: base64Data,
    ContentEncoding: 'base64', // required
    ContentType: `image/${type}` // required. Notice the back ticks
  }
}

var strongRegex = new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})");
const isValidPassword = (password) => strongRegex.test(password)
const profilePhotoCropDataId = "crop-profile-photo"
const originalProfilePhotoId = "original-profile-photo"

exports.handler = async (event) => {
  var task = JSON.parse(event.body)
  const accountId = event.requestContext.authorizer.id
  const profilePhotoCropData = task.profilePhotoCropData
  const originalProfilePhoto = task.originalProfilePhoto
  const imageId = uuidv4()

  var response;
  try {
    response = await getItemFromDynamoDB(task)
    console.log("Item recuperado do dynamodb com sucesso");
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

  if (task.newPassword !== undefined && !isValidPassword(task.newPassword)) {
      return handleError({ message: "Nova senha inválida, leia atenciosamente os requisitos mínimos para criar uma senha válida.", statusCode: 400 });
  }

  // change password when the user is logged in
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
  // change password when the user forgot his password
  else if (task.password) {
    const newPassword = task.password
    const hashedNewPassword = crypto.createHash(HASH_ALG).update(newPassword).digest('hex');

    task = {
      // this is required because of a check of length 1 in the update function
      [ADMINS_TABLE_PARTITION_KEY]: response.Item[ADMINS_TABLE_PARTITION_KEY],
      password: hashedNewPassword
    }
  }

  // if profile photo is defined we empty the admins bucket
  const keepOriginalProfilePhoto = originalProfilePhoto === SAME_ORIGINAL_PROFILE_PHOTO_STRING
  if (profilePhotoCropData && originalProfilePhoto) {
    try {
      await emptyS3Directory(ADMINS_BUCKET, `${accountId}/`, keepOriginalProfilePhoto);
      console.log(`Item deletado ${accountId} do s3 bucket com sucesso`);
    } catch (error) {
      console.error(error)
      return handleError({ message: "Erro ao esvaziar s3 bucket com as imagens do vendedor", statusCode: 400 });
    }
  }

  // if profile photo is defined is defined, add the new images
  if (profilePhotoCropData && originalProfilePhoto) {

    const profilePhotoCropDataName = `${imageId}-${profilePhotoCropDataId}`

    const profilePhotoCropDataS3Params = getS3Params({ accountId, imageName: profilePhotoCropDataName, imageContent: profilePhotoCropData })
    const promiseProfilePhotoCropData = S3Client.upload(profilePhotoCropDataS3Params).promise();
    const promises = [promiseProfilePhotoCropData]

    var originalProfilePhotoName

    if (!keepOriginalProfilePhoto) {
      originalProfilePhotoName = `${imageId}-${originalProfilePhotoId}`
      const originalProfilePhotoS3Params = getS3Params({ imageId, accountId, imageName: originalProfilePhotoName, imageContent: originalProfilePhoto })
      const promiseOriginalProfilePhoto = S3Client.upload(originalProfilePhotoS3Params).promise();
      promises.push(promiseOriginalProfilePhoto)
    }

    try {
      await Promise.all(promises)
      console.log("Imagens adicionadas ao s3 bucket com sucesso.")
    } catch (error) {
      console.error(error)
      return handleError({ message: "Erro ao inserir imagem no s3 bucket", statusCode: 400 });
    }

    delete task.profilePhotoCropData
    delete task.originalProfilePhoto

    const profilePhotoCropDataS3Path = `https://${ADMINS_BUCKET}.s3.${REGION}.amazonaws.com/${accountId}/${profilePhotoCropDataName}`;
    task.crop_profile_photo = profilePhotoCropDataS3Path

    if (!keepOriginalProfilePhoto) {
      const originalProfilePhotoS3Path = `https://${ADMINS_BUCKET}.s3.${REGION}.amazonaws.com/${accountId}/${originalProfilePhotoName}`;
      task.original_profile_photo = originalProfilePhotoS3Path
    }
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