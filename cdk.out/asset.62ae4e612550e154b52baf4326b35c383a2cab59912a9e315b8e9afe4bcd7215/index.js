// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
// Set the region
const REGION = "us-east-1"
AWS.config.update({ region: REGION })

const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })
const S3Client = new AWS.S3()
const tableName = "products"
const bucketName = "e-commerce-images-bucket"

const updateItemOnDynamoDB = async (dynamodbParams) => {
  return await ddb.updateItem(dynamodbParams).promise();
}

const fieldToUpdate = {
  "name": {"#": "#NA", ":": ":na", "type": "S"},
  "description": {"#": "#DE", ":": ":de", "type": "S"},
  "price": {"#": "#PR", ":": ":pr", "type": "N"},
  "images": {"#": "#IM", ":": ":im", "type": "L"},
}

const createDynamoDBParams = (task) => {
  const ExpressionAttributeValues = {};
  const UpdateExpression = "SET";
  const productImages = task.images.map((image) => ({
    S: `https://${bucketName}.s3.${REGION}.amazonaws.com/${id}/${encodeS3URI(image.name)}`
  }));

  Object.keys(task).forEach((key) => {
    console.log(task.key);
    if (task.key) {
      console.log(task.key)
      const twoDotsName = fieldToUpdate[key][":"];
      const type = fieldToUpdate[key].type;
      ExpressionAttributeValues[twoDotsName][type] = task.key === "images" ? productImages : task.key;
      const hashtagName = fieldToUpdate[key]["#"];
      UpdateExpression += ` ${hashtagName} = ${twoDotsName},`; 
    }
  });

  UpdateExpression = UpdateExpression.slice(0, -1);
  
  return { UpdateExpression, ExpressionAttributeValues };
};

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


const main = async (event, context, callback) => {
  const task = JSON.parse(event.body)
  const id = task.id
  const images = task.images

  // if images is defined we remove all the old images
  if (images) {
    try {
      await emptyS3Directory(bucketName, `${id}/`);
      console.log(`Successfuly deleted product ${id} from S3 bucket`);
    } catch (error) {
      console.error("Error", error);

      callback({
        statusCode: 400,
        body: JSON.stringify(error),
        headers: {
          "Access-Control-Allow-Origin": "*", // Required for CORS support to work
          'Content-Type': 'application/json'
        },
        isBase64Encoded: false
      });
    }
  }

  // iterate over task and get which parameters will be updated
  const { UpdateExpression, ExpressionAttributeValues } = createDynamoDBParams(task);

  const dynamodbParams = {
    Key: {
      "id": {
        "S": id
      },
    },
    ExpressionAttributeValues,
    UpdateExpression,
    TableName: tableName
  };

  // update parameters on dynamodb
  try {
    await updateItemOnDynamoDB(dynamodbParams);
    console.log("Successfuly updated item on dynamodb");
  } catch(error) {
    console.error("Error", error);

    callback({
      statusCode: 400,
      body: JSON.stringify(error),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        'Content-Type': 'application/json'
      },
      isBase64Encoded: false
    });
  }

  // if images is defined, add the new images
  if (images) {
    images.forEach((image) => {
      const S3EncodedKey = `${id}/${encodeS3URI(image.name)}`
      const base64Data = new Buffer.from(image.content.replace(/^data:image\/\w+;base64,/, ""), 'base64');
      const type = image.content.split(';')[0].split('/')[1];
    
      const S3Params = {
        Bucket: bucketName,
        Key: S3EncodedKey, // File name you want to save as in S3
        Body: base64Data,
        ContentEncoding: 'base64', // required
        ContentType: `image/${type}` // required. Notice the back ticks
      } 
    
      // Uploading files to the bucket
      S3Client.upload(S3Params, function (err, data) {
        if (err) {
          console.error("Error", err)
  
          callback({
            statusCode: 400,
            body: JSON.stringify(err),
            headers: {
              "Access-Control-Allow-Origin": "*", // Required for CORS support to work
              'Content-Type': 'application/json'
            },
            isBase64Encoded: false
          });
          
          return;
        }
  
        console.log(`File uploaded to S3 bucket successfully. ${data.Location}`)
      })
    });
  }

  callback(null, {
    statusCode: 200,
    body: JSON.stringify("Success"),
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      'Content-Type': 'application/json'
    },
    isBase64Encoded: false
  });
}

module.exports = { main }
