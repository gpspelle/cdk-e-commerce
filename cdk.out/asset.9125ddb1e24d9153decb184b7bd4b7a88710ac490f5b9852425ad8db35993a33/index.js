// Load the AWS SDK for Node.js
const AWS = require("aws-sdk")
// Set the region
const REGION = "us-east-1"
AWS.config.update({ region: REGION })

// Create the DynamoDB service object
const ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" })
const accountsTable = "accounts"

const handleError = (callback, error) => {
    console.error("Error", error);
  
    callback({
      statusCode: 500,
      body: JSON.stringify(error),
      headers: {
        "Access-Control-Allow-Origin": "*", // Required for CORS support to work
        'Content-Type': 'application/json'
      },
      isBase64Encoded: false
    });
}

var strongRegex = new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})");
const isValidadPassword = (password) => strongRegex.test(password)
const isValidEmail = (email) => {
    String(email)
    .toLowerCase()
    .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )
}   

const checkUserInput = (email, password) => { isValidEmail(email) && isValidadPassword(password) }

const main = (event, context, callback) => {
    const task = JSON.parse(event.body)
    const { email, name, commercialName, password} = task

    if (!checkUserInput(email, password)) {
        callback({
            statusCode: 400,
            body: JSON.stringify("Malformed user input, check the user email and if the password meet the basic requirements"),
            headers: {
              "Access-Control-Allow-Origin": "*", // Required for CORS support to work
              'Content-Type': 'application/json'
            },
            isBase64Encoded: false
        });
    }

    const dynamodbParams = {
        TableName: accountsTable,
        Item: {
            email: { S: email.toLowerCase() },
            name: { S: name },
            commercial_name: { S: commercialName },
            password: { S: password },
        },
    }

    // Call DynamoDB to add the item to the table
    try {
        await ddb.putItem(dynamodbParams).promise()
    } catch (error) {
        handleError(callback, error)
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
