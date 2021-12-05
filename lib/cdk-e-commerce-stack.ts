import * as dynamodb from "@aws-cdk/aws-dynamodb"
import * as apigateway from "@aws-cdk/aws-apigateway"
import * as lambda from "@aws-cdk/aws-lambda"
import * as s3 from "@aws-cdk/aws-s3"
import * as cdk from "@aws-cdk/core"
import * as path from "path"

export class ECommerceStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // 👇 create Dynamodb table for products
    const productsTable = new dynamodb.Table(this, `${id}-products-table`, {
      tableName: "products",
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: true,
    })

    console.log("products table name 👉", productsTable.tableName)
    console.log("products table arn 👉", productsTable.tableArn)
   
    // 👇 create Dynamodb table for admins
    const adminsTable = new dynamodb.Table(this, `${id}-admins-table`, {
      tableName: "admins",
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: true,
    })

    console.log("admins table name 👉", adminsTable.tableName)
    console.log("admins table arn 👉", adminsTable.tableArn)

    // 👇 create Api Gateway
    const api = new apigateway.RestApi(this, "api", {
      description: "e-commerce api gateway",
      deployOptions: {
        stageName: "dev",
      },
      // 👇 enable CORS
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ['*'],
      },
    })

    // 👇 create an Output for the API URL
    new cdk.CfnOutput(this, "apiUrl", { value: api.url })

    // 👇 define POST login function
    const postLoginLambda = new lambda.Function(this, "post-login-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/post-login")),
    })

    // 👇 add a /login resource
    const login = api.root.addResource("login")

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
    })

    // 👇 add a /products resource
    const products = api.root.addResource("products")

    // 👇 integrate GET /products with getProductsLambda
    products.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getProductsLambda)
    )

    // 👇 grant the lambda role read permissions to the products table
    productsTable.grantReadData(getProductsLambda)

    // 👇 define PUT product function
    const putProductLambda = new lambda.Function(this, "put-product-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.main",
      timeout: cdk.Duration.seconds(100),
      code: lambda.Code.fromAsset(path.join(__dirname, "/../src/put-product")),
    })

    // 👇 add a /product resource
    const product = api.root.addResource("product")

    // 👇 integrate PUT /product with putProductLambda
    product.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(putProductLambda)
    )

    // 👇 grant the lambda role write permissions to the products table
    productsTable.grantWriteData(putProductLambda)

    // 👇 create bucket
    const s3Bucket = new s3.Bucket(this, "s3-bucket", {
      bucketName: "e-commerce-images-bucket",
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

    // 👇 grant access to bucket
    s3Bucket.grantWrite(putProductLambda)
  }
}
