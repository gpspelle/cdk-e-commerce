import * as dynamodb from "@aws-cdk/aws-dynamodb"
import * as apigateway from "@aws-cdk/aws-apigateway"
import * as apigatewayv2 from "@aws-cdk/aws-apigatewayv2"
import * as lambda from "@aws-cdk/aws-lambda"
import * as iam from "@aws-cdk/aws-iam"
import * as s3 from "@aws-cdk/aws-s3"
import * as cdk from "@aws-cdk/core"
import * as path from "path"
import { HttpLambdaAuthorizer, HttpLambdaResponseType } from '@aws-cdk/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations';
import { DynamoEventSource } from '@aws-cdk/aws-lambda-event-sources'
import { 
  SES_EMAIL_FROM, 
  REGION, 
  SECRET, 
  ACCOUNT, 
} from '../.env'
import {
  STAGE, 
  ADMINS_TABLE,
  PRODUCT_TAGS_TABLE,
  HASH_ALG,
  IMAGES_BUCKET,
  PRODUCTS_TABLE,
  ACCESS_TOKEN_NAME,
  PRODUCTS_TABLE_PARTITION_KEY,
  ADMINS_TABLE_PARTITION_KEY,
  PRODUCT_TAGS_TABLE_PARTITION_KEY,
  EMAIL_VERIFICATION_LINK_ENDPOINT,
  NO_TAGS_STRING,
} from "../constants";

import { AuthorizationType } from "@aws-cdk/aws-apigateway"
import { StreamViewType } from '@aws-cdk/aws-dynamodb'

export class ECommerceStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // 👇 create Dynamodb table for products
    const productsTable = new dynamodb.Table(this, `${id}-products-table`, {
      tableName: PRODUCTS_TABLE,
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: { name: PRODUCTS_TABLE_PARTITION_KEY, type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: true,
    })

    console.log("products table name 👉", productsTable.tableName)
    console.log("products table arn 👉", productsTable.tableArn)
   
    // 👇 create Dynamodb table for admins
    const adminsTable = new dynamodb.Table(this, `${id}-admins-table`, {
      tableName: ADMINS_TABLE,
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: { name: ADMINS_TABLE_PARTITION_KEY, type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: true,
      stream: StreamViewType.NEW_IMAGE,
    })

    console.log("admins table name 👉", adminsTable.tableName)
    console.log("admins table arn 👉", adminsTable.tableArn)

    // 👇 create Dynamodb table for product categories
    const productTagsTable = new dynamodb.Table(this, `${id}-product-tags-table`, {
      tableName: PRODUCT_TAGS_TABLE,
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: { name: PRODUCT_TAGS_TABLE_PARTITION_KEY, type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: true,
    })

    console.log("product tags table name 👉", productTagsTable.tableName)
    console.log("product tags table arn 👉", productTagsTable.tableArn)

    // 👇 create Rest Api Gateway
    const restApi = new apigateway.RestApi(this, "api", {
      description: "e-commerce rest api gateway",
      deployOptions: {
        stageName: STAGE,
      },
      // 👇 enable CORS
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key", ACCESS_TOKEN_NAME],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ['*'],
      },
    })

    // 👇 create an Output for the API URL
    new cdk.CfnOutput(this, "restApiUrl", { value: restApi.url })

    // 👇 define adminAuth lambda function
    const adminAuthLambdaFunction = new lambda.Function(this, "admin-auth-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/admin-auth")),
      environment: {
        SECRET,
        REGION,
        ACCOUNT,
        STAGE,
        API_ID: restApi.restApiId,
      }
    })

    const adminAuth = new apigateway.TokenAuthorizer(this, "jwt-token-admin-auth", {
      handler: adminAuthLambdaFunction,
      identitySource: `method.request.header.${ACCESS_TOKEN_NAME}`
    })

    // 👇 create HTTP Api Gateway
    const httpApi = new apigatewayv2.HttpApi(this, "http-api", {
      description: "e-commerce http api gateway",
    })

    // 👇 create an Output for the API URL
    new cdk.CfnOutput(this, "httpApiUrl", { value: httpApi.apiEndpoint })

    // 👇 add a /account resource
    const account = restApi.root.addResource("account")

    // 👇 add a /account resource
    const accounts = restApi.root.addResource("accounts")

    // 👇 add a /login resource
    const login = restApi.root.addResource("login")

    // 👇 add a /product resource
    const product = restApi.root.addResource("product")

    // 👇 add a /products resource
    const products = restApi.root.addResource("products")

    // 👇 add a /customer-product resource
    const customerProduct = restApi.root.addResource("customer-product")

    // 👇 add a /customer-products resource
    const customerProducts = restApi.root.addResource("customer-products")

    // 👇 add a /tags resource
    const tags = restApi.root.addResource("tags")

    // 👇 define PUT account function
    const putAccountLambda = new lambda.Function(this, "put-account-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/put-account")),
      environment: {
        REGION,
        ADMINS_TABLE,
        ADMINS_TABLE_PARTITION_KEY,
        HASH_ALG,
      }
    })

    // 👇 integrate PUT /account with putAccountLambda
    account.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(putAccountLambda)
    )

    // 👇 grant the lambda role put permissions to the admins table
    adminsTable.grantWriteData(putAccountLambda)

    // 👇 define PUT account function
    const getAccountsLambda = new lambda.Function(this, "get-accounts-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-accounts")),
      environment: {
        REGION,
        ADMINS_TABLE,
      }
    })

    // 👇 integrate GET /accounts with getAccountsLambda
    accounts.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getAccountsLambda)
    )

    // 👇 grant the lambda role read permissions to the admins table
    adminsTable.grantReadData(getAccountsLambda)

    // 👇 define POST login function
    const postLoginLambda = new lambda.Function(this, "post-login-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/post-login")),
      environment: {
        SECRET,
        REGION,
        ADMINS_TABLE,
        ADMINS_TABLE_PARTITION_KEY,
        HASH_ALG
      }
    })

    // 👇 integrate POST /login with postLoginLambda
    login.addMethod(
      "POST",
      new apigateway.LambdaIntegration(postLoginLambda)
    )

    // 👇 grant the lambda role read permissions to the admins table
    adminsTable.grantReadData(postLoginLambda)

    // 👇 define GET products function
    const getProductsLambda = new lambda.Function(this, "get-products-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-products")),
      environment: {
        REGION,
        PRODUCTS_TABLE
      }
    })

    // 👇 integrate GET /products with getProductsLambda
    products.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getProductsLambda),
      {
        authorizationType: AuthorizationType.CUSTOM,
        authorizer: adminAuth,
      }
    )

    // 👇 grant the lambda role read permissions to the products table
    productsTable.grantReadData(getProductsLambda)

    // 👇 define GET customer product function
    const getCustomerProductLambda = new lambda.Function(this, "get-customer-product-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-customer-product")),
      environment: {
        REGION,
        PRODUCTS_TABLE
      }
    })

    // 👇 integrate GET /customer-product with getCustomerProductLambda
    customerProduct.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getCustomerProductLambda)
    )

    // 👇 grant the lambda role read permissions to the products table
    productsTable.grantReadData(getCustomerProductLambda)

    // 👇 define GET customer products function
    const getCustomerProductsLambda = new lambda.Function(this, "get-customer-products-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-customer-products")),
      environment: {
        REGION,
        PRODUCTS_TABLE
      }
    })

    // 👇 integrate GET /customer-products with getCustomerProductsLambda
    customerProducts.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getCustomerProductsLambda)
    )

    // 👇 grant the lambda role read permissions to the products table
    productsTable.grantReadData(getCustomerProductsLambda)

    // 👇 define PUT product function
    const putProductLambda = new lambda.Function(this, "put-product-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      timeout: cdk.Duration.seconds(100),
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/put-product")),
      environment: {
        REGION,
        PRODUCTS_TABLE,
        PRODUCTS_TABLE_PARTITION_KEY,
        PRODUCT_TAGS_TABLE,
        PRODUCT_TAGS_TABLE_PARTITION_KEY,
        IMAGES_BUCKET,
        NO_TAGS_STRING,
      }
    })

    // 👇 integrate PUT /product with putProductLambda
    product.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(putProductLambda),
      {
        authorizationType: AuthorizationType.CUSTOM,
        authorizer: adminAuth,
      }
    )

    // 👇 grant the lambda role write permissions to the products table
    productsTable.grantWriteData(putProductLambda)
    
    // 👇 grant the lambda role write permissions to the product tags table
    productTagsTable.grantWriteData(putProductLambda)

    // 👇 define DELETE product function
    const deleteProductLambda = new lambda.Function(this, "delete-product-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      timeout: cdk.Duration.seconds(100),
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/delete-product")),
      environment: {
        REGION,
        PRODUCTS_TABLE,
        PRODUCTS_TABLE_PARTITION_KEY,
        PRODUCT_TAGS_TABLE,
        PRODUCT_TAGS_TABLE_PARTITION_KEY,
        IMAGES_BUCKET,
      }
    })

    // 👇 integrate DELETE /product with deleteProductLambda
    product.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(deleteProductLambda),
      {
        authorizationType: AuthorizationType.CUSTOM,
        authorizer: adminAuth,
      }
    )

    // 👇 grant the lambda role write permissions to the products table
    productsTable.grantReadWriteData(deleteProductLambda)

    // 👇 grant the lambda role write permissions to the product tags table
    productTagsTable.grantWriteData(deleteProductLambda)

    // 👇 define PATCH product function
    const patchProductLambda = new lambda.Function(this, "patch-product-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      timeout: cdk.Duration.seconds(100),
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/patch-product")),
      environment: {
        REGION,
        PRODUCTS_TABLE,
        PRODUCTS_TABLE_PARTITION_KEY,
        PRODUCT_TAGS_TABLE,
        PRODUCT_TAGS_TABLE_PARTITION_KEY,
        IMAGES_BUCKET,
        NO_TAGS_STRING,
      }
    })

    // 👇 integrate PATCH /product with patchProductLambda
    product.addMethod(
      "PATCH",
      new apigateway.LambdaIntegration(patchProductLambda),
      {
        authorizationType: AuthorizationType.CUSTOM,
        authorizer: adminAuth,
      }
    )

    // 👇 grant the lambda role write permissions to the products table
    productsTable.grantReadWriteData(patchProductLambda)

    // 👇 grant the lambda role write permissions to the product tags table
    productTagsTable.grantWriteData(patchProductLambda)

    // 👇 define PUT tags function
    const putTagsLambda = new lambda.Function(this, "put-tags-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      timeout: cdk.Duration.seconds(100),
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/put-tags")),
      environment: {
        REGION,
        PRODUCT_TAGS_TABLE,
        PRODUCT_TAGS_TABLE_PARTITION_KEY,
      }
    })

    // 👇 grant the lambda role write permissions to the product tags table
    productTagsTable.grantWriteData(putTagsLambda)

    // 👇 integrate PUT /tags with putTagsLambda
    tags.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(putTagsLambda)
    )

    // 👇 define GET tags function
    const getTagsLambda = new lambda.Function(this, "get-tags-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      timeout: cdk.Duration.seconds(100),
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-tags")),
      environment: {
        REGION,
        PRODUCT_TAGS_TABLE,
        PRODUCT_TAGS_TABLE_PARTITION_KEY,
        NO_TAGS_STRING,
      }
    })

    // 👇 integrate GET /tags with getTagsLambda
    tags.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getTagsLambda)
    )

    // 👇 grant the lambda role read permissions to the product tags table
    productTagsTable.grantReadData(getTagsLambda)

    // 👇 create bucket
    const s3Bucket = new s3.Bucket(this, "s3-bucket", {
      bucketName: IMAGES_BUCKET,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      publicReadAccess: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(90),
          expiration: cdk.Duration.days(365),
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    })

    // 👇 grant write access to bucket
    s3Bucket.grantWrite(putProductLambda)
    // 👇 grant read and write access to bucket
    s3Bucket.grantReadWrite(deleteProductLambda)
    // 👇 grant read and write access to bucket
    s3Bucket.grantReadWrite(patchProductLambda)

    // 👇 create the lambda that sends emails
    const mailerFunction = new lambda.Function(this, 'mailer-function', {
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(3),
      handler: 'index.main',
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/email-verification")),
      environment: {
        SES_EMAIL_FROM,
        REGION,
        API_ENDPOINT: httpApi.apiEndpoint,
        SECRET,
        ACCESS_TOKEN_NAME,
        EMAIL_VERIFICATION_LINK_ENDPOINT,
      }
    })

    // 👇 Add permissions to the Lambda function to send Emails
    mailerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ses:SendEmail',
          'ses:SendRawEmail',
          'ses:SendTemplatedEmail',
        ],
        resources: [
          `arn:aws:ses:${REGION}:${
            ACCOUNT
          }:identity/${SES_EMAIL_FROM}`,
        ],
      }),
    )

    mailerFunction.addEventSource(
      new DynamoEventSource(adminsTable, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 1,
        bisectBatchOnError: true,
        retryAttempts: 10,
      }),
    )

    // 👇 define emailAuth lambda function
    const emailAuthLambdaFunction = new lambda.Function(this, "email-auth-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/email-verification-auth")),
      environment: {
        SECRET,
        ACCESS_TOKEN_NAME,
      }
    })

    // 👇 create the lambda that sends emails
    const getVerificationEmailLambdaFunction = new lambda.Function(this, 'get-verification-email', {
      runtime: lambda.Runtime.NODEJS_14_X,
      timeout: cdk.Duration.seconds(5),
      handler: 'index.main',
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-verification-email")),
      environment: {
        REGION,
        ADMINS_TABLE,
        ADMINS_TABLE_PARTITION_KEY,
      }
    })

    adminsTable.grantWriteData(getVerificationEmailLambdaFunction)

    const emailVerificationIntegration = new HttpLambdaIntegration('EmailVerificationIntegration', getVerificationEmailLambdaFunction);

    const emailAuth = new HttpLambdaAuthorizer('EmailVerificationAuthorizer', emailAuthLambdaFunction, {
      responseTypes: [HttpLambdaResponseType.SIMPLE],
      identitySource: [`$request.querystring.${ACCESS_TOKEN_NAME}`],
    });

    httpApi.addRoutes({
      path: `/${EMAIL_VERIFICATION_LINK_ENDPOINT}`,
      methods: [ apigatewayv2.HttpMethod.GET ],
      integration: emailVerificationIntegration,
      authorizer: emailAuth,
    });
  }
}
