"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ECommerceStack = void 0;
const dynamodb = require("@aws-cdk/aws-dynamodb");
const apigateway = require("@aws-cdk/aws-apigateway");
const lambda = require("@aws-cdk/aws-lambda");
const iam = require("@aws-cdk/aws-iam");
const s3 = require("@aws-cdk/aws-s3");
const cdk = require("@aws-cdk/core");
const events = require("@aws-cdk/aws-events");
const targets = require("@aws-cdk/aws-events-targets");
const aws_apigatewayv2_1 = require("@aws-cdk/aws-apigatewayv2");
const aws_apigatewayv2_authorizers_1 = require("@aws-cdk/aws-apigatewayv2-authorizers");
const aws_apigatewayv2_integrations_1 = require("@aws-cdk/aws-apigatewayv2-integrations");
const aws_lambda_event_sources_1 = require("@aws-cdk/aws-lambda-event-sources");
const path = require("path");
const _env_1 = require("../.env");
const constants_1 = require("../constants");
const amplify = require("@aws-cdk/aws-amplify");
const codebuild = require("@aws-cdk/aws-codebuild");
class ECommerceStack extends cdk.Stack {
    constructor(scope, id, props) {
        var _a, _b;
        super(scope, id, props);
        // this as string causes an error at compile time if it is not a string
        const ACCOUNT = (_a = props === null || props === void 0 ? void 0 : props.env) === null || _a === void 0 ? void 0 : _a.account;
        const REGION = (_b = props === null || props === void 0 ? void 0 : props.env) === null || _b === void 0 ? void 0 : _b.region;
        const SES_EMAIL_FROM = props === null || props === void 0 ? void 0 : props.sesEmailFrom;
        const IMAGES_BUCKET = props === null || props === void 0 ? void 0 : props.imagesBucket;
        const CUSTOM_DOMAIN = props === null || props === void 0 ? void 0 : props.customDomain;
        const ADMINS_BUCKET = props === null || props === void 0 ? void 0 : props.adminsBucket;
        // 👇 create Dynamodb table for products
        const productsTable = new dynamodb.Table(this, `${id}-products-table`, {
            tableName: constants_1.PRODUCTS_TABLE,
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: { name: constants_1.PRODUCTS_TABLE_PARTITION_KEY, type: dynamodb.AttributeType.STRING },
            pointInTimeRecovery: true,
        });
        console.log("products table name 👉", productsTable.tableName);
        console.log("products table arn 👉", productsTable.tableArn);
        // 👇 create Dynamodb table for admins
        const adminsTable = new dynamodb.Table(this, `${id}-admins-table`, {
            tableName: constants_1.ADMINS_TABLE,
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: { name: constants_1.ADMINS_TABLE_PARTITION_KEY, type: dynamodb.AttributeType.STRING },
            pointInTimeRecovery: true,
            stream: dynamodb.StreamViewType.NEW_IMAGE,
        });
        console.log("admins table name 👉", adminsTable.tableName);
        console.log("admins table arn 👉", adminsTable.tableArn);
        // 👇 create Dynamodb table for product categories
        const productTagsTable = new dynamodb.Table(this, `${id}-product-tags-table`, {
            tableName: constants_1.PRODUCT_TAGS_TABLE,
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: { name: constants_1.PRODUCT_TAGS_TABLE_PARTITION_KEY, type: dynamodb.AttributeType.STRING },
            pointInTimeRecovery: true,
        });
        console.log("product tags table name 👉", productTagsTable.tableName);
        console.log("product tags table arn 👉", productTagsTable.tableArn);
        // 👇 create Rest Api Gateway
        const restApi = new apigateway.RestApi(this, "api", {
            description: "e-commerce rest api gateway",
            deployOptions: {
                stageName: constants_1.STAGE,
            },
            // 👇 enable CORS
            defaultCorsPreflightOptions: {
                allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key", constants_1.ACCESS_TOKEN_NAME],
                allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
                allowCredentials: true,
                allowOrigins: ['*'],
            },
            minimumCompressionSize: 3500,
        });
        // 👇 create an Output for the API URL
        new cdk.CfnOutput(this, "restApiUrl", { value: restApi.url });
        // 👇 define adminAuth lambda function
        const adminAuthLambdaFunction = new lambda.Function(this, "admin-auth-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/admin-auth/dist")),
            environment: {
                SECRET: _env_1.SECRET,
                REGION,
                ACCOUNT,
                STAGE: constants_1.STAGE,
                API_ID: restApi.restApiId,
                ACCESS_TOKEN_NAME: constants_1.ACCESS_TOKEN_NAME,
            }
        });
        const adminAuth = new apigateway.TokenAuthorizer(this, "jwt-token-admin-auth", {
            handler: adminAuthLambdaFunction,
            identitySource: `method.request.header.${constants_1.ACCESS_TOKEN_NAME}`
        });
        // 👇 define emailAuth lambda function
        const emailAuthLambdaFunction = new lambda.Function(this, "email-auth-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/email-auth/dist")),
            environment: {
                SECRET: _env_1.SECRET,
                ACCESS_TOKEN_NAME: constants_1.ACCESS_TOKEN_NAME,
            }
        });
        const emailAuth = new aws_apigatewayv2_authorizers_1.HttpLambdaAuthorizer('EmailVerificationAuthorizer', emailAuthLambdaFunction, {
            responseTypes: [aws_apigatewayv2_authorizers_1.HttpLambdaResponseType.SIMPLE],
            identitySource: [`$request.querystring.${constants_1.ACCESS_TOKEN_NAME}`],
        });
        // 👇 create HTTP Api Gateway
        const httpApi = new aws_apigatewayv2_1.HttpApi(this, "http-api", {
            description: "e-commerce http api gateway",
            corsPreflight: {
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                ],
                allowMethods: [
                    aws_apigatewayv2_1.CorsHttpMethod.OPTIONS,
                    aws_apigatewayv2_1.CorsHttpMethod.GET,
                    aws_apigatewayv2_1.CorsHttpMethod.POST,
                    aws_apigatewayv2_1.CorsHttpMethod.PUT,
                    aws_apigatewayv2_1.CorsHttpMethod.PATCH,
                    aws_apigatewayv2_1.CorsHttpMethod.DELETE,
                ],
                allowCredentials: false,
                allowOrigins: ['*'],
            },
        });
        const eCommerceAmplifyApp = new amplify.App(this, 'eCommerceAmplifyApp', {
            sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
                owner: 'gpspelle',
                repository: 'e-commerce',
                oauthToken: cdk.SecretValue.secretsManager('github-access-token'),
            }),
            buildSpec: codebuild.BuildSpec.fromObjectToYaml({
                version: '1.0',
                frontend: {
                    phases: {
                        preBuild: {
                            commands: [
                                'npm install'
                            ]
                        },
                        build: {
                            commands: [
                                'npm run build'
                            ]
                        }
                    },
                    artifacts: {
                        baseDirectory: 'build',
                        files: [
                            '**/*'
                        ]
                    },
                    cache: {
                        paths: [
                            'node_modules/**/*'
                        ]
                    }
                }
            }),
            environmentVariables: {
                "REACT_APP_REST_API": restApi.url,
            }
        });
        // fixes https://github.com/aws-amplify/amplify-cli/issues/3606
        const fixReactRouterDom403CloudFrontIssueCustomRule = new amplify.CustomRule({
            source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|ttf|map|json)$)([^.]+$)/>',
            target: '/index.html',
            status: amplify.RedirectStatus.REWRITE,
        });
        eCommerceAmplifyApp.addCustomRule(fixReactRouterDom403CloudFrontIssueCustomRule);
        const eCommerceBranch = eCommerceAmplifyApp.addBranch("master");
        if (CUSTOM_DOMAIN !== undefined) {
            const eCommerceDomain = new amplify.Domain(this, "e-commerce-domain", {
                app: eCommerceAmplifyApp,
                domainName: CUSTOM_DOMAIN,
            });
            eCommerceDomain.mapRoot(eCommerceBranch);
        }
        const eCommerceAdminAmplifyApp = new amplify.App(this, 'eCommerceAdminAmplifyApp', {
            sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
                owner: 'gpspelle',
                repository: 'admin-e-commerce',
                oauthToken: cdk.SecretValue.secretsManager('github-access-token'),
            }),
            buildSpec: codebuild.BuildSpec.fromObjectToYaml({
                version: '1.0',
                frontend: {
                    phases: {
                        preBuild: {
                            commands: [
                                'npm install'
                            ]
                        },
                        build: {
                            commands: [
                                'npm run build'
                            ]
                        }
                    },
                    artifacts: {
                        baseDirectory: 'build',
                        files: [
                            '**/*'
                        ]
                    },
                    cache: {
                        paths: [
                            'node_modules/**/*'
                        ]
                    }
                }
            }),
            environmentVariables: {
                "REACT_APP_REST_API": restApi.url,
                "REACT_APP_HTTP_API": httpApi.apiEndpoint,
                "REACT_APP_ACCESS_TOKEN_NAME": constants_1.ACCESS_TOKEN_NAME,
                "REACT_APP_NO_TAGS_STRING": constants_1.NO_TAGS_STRING,
            }
        });
        eCommerceAdminAmplifyApp.addCustomRule(fixReactRouterDom403CloudFrontIssueCustomRule);
        const eCommerceAdminBranch = eCommerceAdminAmplifyApp.addBranch("master");
        if (CUSTOM_DOMAIN !== undefined) {
            const eCommerceAdminDomain = new amplify.Domain(this, "e-commerce-admin-domain", {
                app: eCommerceAdminAmplifyApp,
                domainName: CUSTOM_DOMAIN,
            });
            eCommerceAdminDomain.mapSubDomain(eCommerceAdminBranch, "admin");
        }
        // 👇 create an Output for the API URL
        new cdk.CfnOutput(this, "httpApiUrl", { value: httpApi.apiEndpoint });
        // 👇 add a /account resource
        const account = restApi.root.addResource("account");
        // 👇 add a /account resource
        const accounts = restApi.root.addResource("accounts");
        // 👇 add a /login resource
        const login = restApi.root.addResource("login");
        // 👇 add a /product resource
        const product = restApi.root.addResource("product");
        // 👇 add a /products resource
        const products = restApi.root.addResource("products");
        // 👇 add a /customer-product resource
        const customerProduct = restApi.root.addResource("customer-product");
        // 👇 add a /customer-products resource
        const customerProducts = restApi.root.addResource("customer-products");
        // 👇 add a /tags resource
        const tags = restApi.root.addResource("tags");
        // 👇 define PUT account function
        const putAccountLambda = new lambda.Function(this, "put-account-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/put-account/dist")),
            environment: {
                REGION,
                ADMINS_TABLE: constants_1.ADMINS_TABLE,
                ADMINS_TABLE_PARTITION_KEY: constants_1.ADMINS_TABLE_PARTITION_KEY,
                HASH_ALG: constants_1.HASH_ALG,
            }
        });
        // 👇 integrate PUT /account with putAccountLambda
        account.addMethod("PUT", new apigateway.LambdaIntegration(putAccountLambda));
        // 👇 grant the lambda role put permissions to the admins table
        adminsTable.grantWriteData(putAccountLambda);
        // 👇 define PATCH account function
        const patchAccountLambda = new lambda.Function(this, "patch-account-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/patch-account/dist")),
            environment: {
                REGION,
                ADMINS_TABLE: constants_1.ADMINS_TABLE,
                ADMINS_TABLE_PARTITION_KEY: constants_1.ADMINS_TABLE_PARTITION_KEY,
                HASH_ALG: constants_1.HASH_ALG,
                ADMINS_BUCKET,
                SAME_ORIGINAL_PROFILE_PHOTO_STRING: constants_1.SAME_ORIGINAL_PROFILE_PHOTO_STRING,
            }
        });
        // 👇 integrate PATCH /account with patchAccountLambda
        account.addMethod("PATCH", new apigateway.LambdaIntegration(patchAccountLambda), {
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            authorizer: adminAuth,
        });
        // 👇 grant the lambda role put permissions to the admins table
        adminsTable.grantReadWriteData(patchAccountLambda);
        // 👇 define GET account function
        const getAccountLambda = new lambda.Function(this, "get-account-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-account/dist")),
            environment: {
                REGION,
                ADMINS_TABLE: constants_1.ADMINS_TABLE,
            }
        });
        // 👇 integrate GET /account with getAccountLambda
        account.addMethod("GET", new apigateway.LambdaIntegration(getAccountLambda), {
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            authorizer: adminAuth,
        });
        // 👇 grant the lambda role get permissions to the admins table
        adminsTable.grantReadData(getAccountLambda);
        // 👇 define PUT account function
        const getAccountsLambda = new lambda.Function(this, "get-accounts-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-accounts/dist")),
            environment: {
                REGION,
                ADMINS_TABLE: constants_1.ADMINS_TABLE,
            }
        });
        // 👇 integrate GET /accounts with getAccountsLambda
        accounts.addMethod("GET", new apigateway.LambdaIntegration(getAccountsLambda));
        // 👇 grant the lambda role read permissions to the admins table
        adminsTable.grantReadData(getAccountsLambda);
        // 👇 define POST login function
        const postLoginLambda = new lambda.Function(this, "post-login-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/post-login/dist")),
            environment: {
                SECRET: _env_1.SECRET,
                REGION,
                ADMINS_TABLE: constants_1.ADMINS_TABLE,
                ADMINS_TABLE_PARTITION_KEY: constants_1.ADMINS_TABLE_PARTITION_KEY,
                HASH_ALG: constants_1.HASH_ALG
            }
        });
        // 👇 integrate POST /login with postLoginLambda
        login.addMethod("POST", new apigateway.LambdaIntegration(postLoginLambda));
        // 👇 grant the lambda role read permissions to the admins table
        adminsTable.grantReadData(postLoginLambda);
        // 👇 define GET products function
        const getProductsLambda = new lambda.Function(this, "get-products-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            timeout: cdk.Duration.seconds(100),
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-products/dist")),
            environment: {
                REGION,
                PRODUCTS_TABLE: constants_1.PRODUCTS_TABLE
            }
        });
        // 👇 integrate GET /products with getProductsLambda
        products.addMethod("GET", new apigateway.LambdaIntegration(getProductsLambda), {
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            authorizer: adminAuth,
        });
        // 👇 grant the lambda role read permissions to the products table
        productsTable.grantReadData(getProductsLambda);
        // 👇 define GET customer product function
        const getCustomerProductLambda = new lambda.Function(this, "get-customer-product-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-customer-product/dist")),
            environment: {
                REGION,
                PRODUCTS_TABLE: constants_1.PRODUCTS_TABLE,
                PRODUCTS_TABLE_PARTITION_KEY: constants_1.PRODUCTS_TABLE_PARTITION_KEY,
            }
        });
        // 👇 integrate GET /customer-product with getCustomerProductLambda
        customerProduct.addMethod("GET", new apigateway.LambdaIntegration(getCustomerProductLambda));
        // 👇 grant the lambda role read permissions to the products table
        productsTable.grantReadData(getCustomerProductLambda);
        // 👇 define GET customer products function
        const getCustomerProductsLambda = new lambda.Function(this, "get-customer-products-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            timeout: cdk.Duration.seconds(100),
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-customer-products/dist")),
            environment: {
                REGION,
                PRODUCTS_TABLE: constants_1.PRODUCTS_TABLE
            }
        });
        // 👇 integrate GET /customer-products with getCustomerProductsLambda
        customerProducts.addMethod("GET", new apigateway.LambdaIntegration(getCustomerProductsLambda));
        // 👇 grant the lambda role read permissions to the products table
        productsTable.grantReadData(getCustomerProductsLambda);
        // 👇 define PUT product function
        const putProductLambda = new lambda.Function(this, "put-product-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            timeout: cdk.Duration.seconds(100),
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/put-product/dist")),
            environment: {
                REGION,
                PRODUCTS_TABLE: constants_1.PRODUCTS_TABLE,
                PRODUCTS_TABLE_PARTITION_KEY: constants_1.PRODUCTS_TABLE_PARTITION_KEY,
                PRODUCT_TAGS_TABLE: constants_1.PRODUCT_TAGS_TABLE,
                PRODUCT_TAGS_TABLE_PARTITION_KEY: constants_1.PRODUCT_TAGS_TABLE_PARTITION_KEY,
                IMAGES_BUCKET,
                NO_TAGS_STRING: constants_1.NO_TAGS_STRING,
            }
        });
        // 👇 integrate PUT /product with putProductLambda
        product.addMethod("PUT", new apigateway.LambdaIntegration(putProductLambda), {
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            authorizer: adminAuth,
        });
        // 👇 grant the lambda role write permissions to the products table
        productsTable.grantWriteData(putProductLambda);
        // 👇 grant the lambda role write permissions to the product tags table
        productTagsTable.grantWriteData(putProductLambda);
        // 👇 define DELETE product function
        const deleteProductLambda = new lambda.Function(this, "delete-product-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            timeout: cdk.Duration.seconds(100),
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/delete-product/dist")),
            environment: {
                REGION,
                PRODUCTS_TABLE: constants_1.PRODUCTS_TABLE,
                PRODUCTS_TABLE_PARTITION_KEY: constants_1.PRODUCTS_TABLE_PARTITION_KEY,
                PRODUCT_TAGS_TABLE: constants_1.PRODUCT_TAGS_TABLE,
                PRODUCT_TAGS_TABLE_PARTITION_KEY: constants_1.PRODUCT_TAGS_TABLE_PARTITION_KEY,
                IMAGES_BUCKET,
            }
        });
        // 👇 integrate DELETE /product with deleteProductLambda
        product.addMethod("DELETE", new apigateway.LambdaIntegration(deleteProductLambda), {
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            authorizer: adminAuth,
        });
        // 👇 grant the lambda role write permissions to the products table
        productsTable.grantReadWriteData(deleteProductLambda);
        // 👇 grant the lambda role write permissions to the product tags table
        productTagsTable.grantWriteData(deleteProductLambda);
        // 👇 define PATCH product function
        const patchProductLambda = new lambda.Function(this, "patch-product-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            timeout: cdk.Duration.seconds(100),
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/patch-product/dist")),
            environment: {
                REGION,
                PRODUCTS_TABLE: constants_1.PRODUCTS_TABLE,
                PRODUCTS_TABLE_PARTITION_KEY: constants_1.PRODUCTS_TABLE_PARTITION_KEY,
                PRODUCT_TAGS_TABLE: constants_1.PRODUCT_TAGS_TABLE,
                PRODUCT_TAGS_TABLE_PARTITION_KEY: constants_1.PRODUCT_TAGS_TABLE_PARTITION_KEY,
                IMAGES_BUCKET,
                NO_TAGS_STRING: constants_1.NO_TAGS_STRING,
            }
        });
        // 👇 integrate PATCH /product with patchProductLambda
        product.addMethod("PATCH", new apigateway.LambdaIntegration(patchProductLambda), {
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            authorizer: adminAuth,
        });
        // 👇 grant the lambda role write permissions to the products table
        productsTable.grantReadWriteData(patchProductLambda);
        // 👇 grant the lambda role write permissions to the product tags table
        productTagsTable.grantWriteData(patchProductLambda);
        // 👇 define PUT tags function
        const putTagsLambda = new lambda.Function(this, "put-tags-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            timeout: cdk.Duration.seconds(100),
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/put-tags/dist")),
            environment: {
                REGION,
                PRODUCT_TAGS_TABLE: constants_1.PRODUCT_TAGS_TABLE,
                PRODUCT_TAGS_TABLE_PARTITION_KEY: constants_1.PRODUCT_TAGS_TABLE_PARTITION_KEY,
            }
        });
        // 👇 grant the lambda role write permissions to the product tags table
        productTagsTable.grantWriteData(putTagsLambda);
        // 👇 integrate PUT /tags with putTagsLambda
        tags.addMethod("PUT", new apigateway.LambdaIntegration(putTagsLambda));
        // 👇 define GET tags function
        const getTagsLambda = new lambda.Function(this, "get-tags-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            timeout: cdk.Duration.seconds(100),
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-tags/dist")),
            environment: {
                REGION,
                PRODUCT_TAGS_TABLE: constants_1.PRODUCT_TAGS_TABLE,
                PRODUCT_TAGS_TABLE_PARTITION_KEY: constants_1.PRODUCT_TAGS_TABLE_PARTITION_KEY,
                NO_TAGS_STRING: constants_1.NO_TAGS_STRING,
            }
        });
        // 👇 integrate GET /tags with getTagsLambda
        tags.addMethod("GET", new apigateway.LambdaIntegration(getTagsLambda));
        // 👇 grant the lambda role read permissions to the product tags table
        productTagsTable.grantReadData(getTagsLambda);
        // 👇 create images bucket
        const imagesS3Bucket = new s3.Bucket(this, "s3-bucket", {
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
        });
        // 👇 grant write access to bucket
        imagesS3Bucket.grantWrite(putProductLambda);
        // 👇 grant read and write access to bucket
        imagesS3Bucket.grantReadWrite(deleteProductLambda);
        // 👇 grant read and write access to bucket
        imagesS3Bucket.grantReadWrite(patchProductLambda);
        // 👇 create admins bucket
        const adminsS3Bucket = new s3.Bucket(this, "s3-admins-bucket", {
            bucketName: ADMINS_BUCKET,
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
        });
        // 👇 grant read and write access to bucket
        adminsS3Bucket.grantReadWrite(patchAccountLambda);
        // 👇 create the lambda that sends verification emails
        const sendVerificationEmailLambdaFunction = new lambda.Function(this, 'send-verification-email-lambda', {
            runtime: lambda.Runtime.NODEJS_14_X,
            memorySize: 128,
            timeout: cdk.Duration.seconds(3),
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/send-verification-email/dist")),
            environment: {
                SES_EMAIL_FROM,
                REGION,
                API_ENDPOINT: httpApi.apiEndpoint,
                SECRET: _env_1.SECRET,
                ACCESS_TOKEN_NAME: constants_1.ACCESS_TOKEN_NAME,
                EMAIL_VERIFICATION_LINK_ENDPOINT: constants_1.EMAIL_VERIFICATION_LINK_ENDPOINT,
                EMAIL_SIGNATURE: constants_1.EMAIL_SIGNATURE,
            }
        });
        // 👇 Add permissions to the Lambda function to send verification emails
        sendVerificationEmailLambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ses:SendEmail',
                'ses:SendRawEmail',
                'ses:SendTemplatedEmail',
            ],
            resources: [
                `arn:aws:ses:${REGION}:${ACCOUNT}:identity/*`,
            ],
        }));
        sendVerificationEmailLambdaFunction.addEventSource(new aws_lambda_event_sources_1.DynamoEventSource(adminsTable, {
            startingPosition: lambda.StartingPosition.TRIM_HORIZON,
            batchSize: 1,
            bisectBatchOnError: true,
            retryAttempts: 10,
        }));
        const sendVerificationEmailIntegration = new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('SendVerificationEmailIntegration', sendVerificationEmailLambdaFunction);
        httpApi.addRoutes({
            path: `/send-verify-email`,
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: sendVerificationEmailIntegration,
            authorizer: emailAuth,
        });
        // 👇 create the lambda that apply email verification
        const getVerificationEmailLambdaFunction = new lambda.Function(this, 'get-verification-email', {
            runtime: lambda.Runtime.NODEJS_14_X,
            timeout: cdk.Duration.seconds(5),
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/get-verification-email/dist")),
            environment: {
                REGION,
                ADMINS_TABLE: constants_1.ADMINS_TABLE,
                ADMINS_TABLE_PARTITION_KEY: constants_1.ADMINS_TABLE_PARTITION_KEY,
            }
        });
        adminsTable.grantWriteData(getVerificationEmailLambdaFunction);
        const emailVerificationIntegration = new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('EmailVerificationIntegration', getVerificationEmailLambdaFunction);
        httpApi.addRoutes({
            path: `/${constants_1.EMAIL_VERIFICATION_LINK_ENDPOINT}`,
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: emailVerificationIntegration,
            authorizer: emailAuth,
        });
        // 👇 create the lambda that sends forgot password emails
        const sendForgotPasswordEmailLambdaFunction = new lambda.Function(this, 'send-forgot-password-email-lambda', {
            runtime: lambda.Runtime.NODEJS_14_X,
            memorySize: 128,
            timeout: cdk.Duration.seconds(3),
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/send-forgot-password-email/dist")),
            environment: {
                SES_EMAIL_FROM,
                REGION,
                SECRET: _env_1.SECRET,
                ACCESS_TOKEN_NAME: constants_1.ACCESS_TOKEN_NAME,
                CHANGE_FORGOT_PASSWORD_LINK: constants_1.CHANGE_FORGOT_PASSWORD_LINK,
                EMAIL_SIGNATURE: constants_1.EMAIL_SIGNATURE,
                ADMIN_CUSTOM_DOMAIN: CUSTOM_DOMAIN ? `https://admin.${CUSTOM_DOMAIN}` : "localhost:3000",
                ADMINS_TABLE_PARTITION_KEY: constants_1.ADMINS_TABLE_PARTITION_KEY,
            }
        });
        // 👇 Add permissions to the Lambda function to send forgot password emails
        sendForgotPasswordEmailLambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ses:SendEmail',
                'ses:SendRawEmail',
                'ses:SendTemplatedEmail',
            ],
            resources: [
                `arn:aws:ses:${REGION}:${ACCOUNT}:identity/*`,
            ],
        }));
        const sendForgotPasswordEmailIntegration = new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('SendForgotPasswordEmailIntegration', sendForgotPasswordEmailLambdaFunction);
        httpApi.addRoutes({
            path: `/send-forgot-password-email`,
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: sendForgotPasswordEmailIntegration,
        });
        // 👇 create the transform expired lighting deals into normal products
        const processExpiredLightingDealsLambdaFunction = new lambda.Function(this, 'process-expired-lightning-deals', {
            runtime: lambda.Runtime.NODEJS_14_X,
            timeout: cdk.Duration.seconds(5),
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/process-expired-lightning-deals/dist")),
            environment: {
                REGION,
                PRODUCTS_TABLE: constants_1.PRODUCTS_TABLE,
                PRODUCTS_TABLE_PARTITION_KEY: constants_1.PRODUCTS_TABLE_PARTITION_KEY,
            }
        });
        productsTable.grantReadWriteData(processExpiredLightingDealsLambdaFunction);
        const rule = new events.Rule(this, 'cron-every-5-minutes', {
            schedule: events.Schedule.expression('rate(5 minutes)')
        });
        rule.addTarget(new targets.LambdaFunction(processExpiredLightingDealsLambdaFunction));
    }
}
exports.ECommerceStack = ECommerceStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZS1jb21tZXJjZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImUtY29tbWVyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsa0RBQWlEO0FBQ2pELHNEQUFxRDtBQUNyRCw4Q0FBNkM7QUFDN0Msd0NBQXVDO0FBQ3ZDLHNDQUFxQztBQUNyQyxxQ0FBb0M7QUFDcEMsOENBQTZDO0FBQzdDLHVEQUFzRDtBQUN0RCxnRUFBK0U7QUFDL0Usd0ZBQXFHO0FBQ3JHLDBGQUErRTtBQUMvRSxnRkFBc0U7QUFDdEUsNkJBQTRCO0FBQzVCLGtDQUVnQjtBQUNoQiw0Q0Flc0I7QUFDdEIsZ0RBQWdEO0FBQ2hELG9EQUFvRDtBQVNwRCxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWMsRUFBRSxFQUFVLEVBQUUsS0FBeUI7O1FBQy9ELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFBO1FBRXZCLHVFQUF1RTtRQUN2RSxNQUFNLE9BQU8sR0FBRyxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxHQUFHLDBDQUFFLE9BQWlCLENBQUE7UUFDN0MsTUFBTSxNQUFNLEdBQUcsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsR0FBRywwQ0FBRSxNQUFnQixDQUFBO1FBQzNDLE1BQU0sY0FBYyxHQUFHLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxZQUFzQixDQUFBO1FBQ3BELE1BQU0sYUFBYSxHQUFHLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxZQUFzQixDQUFBO1FBQ25ELE1BQU0sYUFBYSxHQUFHLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxZQUFZLENBQUE7UUFDekMsTUFBTSxhQUFhLEdBQUcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLFlBQXNCLENBQUE7UUFFbkQsd0NBQXdDO1FBQ3hDLE1BQU0sYUFB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LENBQUMsQ0FBQztZQUNqRyxXQUFXLEVBQUU7Z0JBQ1gsTUFBTTtnQkFDTixjQUFjLEVBQWQsMEJBQWM7Z0JBQ2QsNEJBQTRCLEVBQTVCLHdDQUE0QjthQUM3QjtTQUNGLENBQUMsQ0FBQTtRQUVGLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFBO1FBRTNFLE1BQU0sSUFBSSxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDekQsUUFBUSxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDO1NBQ3hELENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLENBQUMsY0FBYyxDQUFDLHlDQUF5QyxDQUFDLENBQUMsQ0FBQTtJQUN2RixDQUFDO0NBQ0Y7QUEveUJELHdDQSt5QkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tIFwiQGF3cy1jZGsvYXdzLWR5bmFtb2RiXCJcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSBcIkBhd3MtY2RrL2F3cy1hcGlnYXRld2F5XCJcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiQGF3cy1jZGsvYXdzLWxhbWJkYVwiXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcIkBhd3MtY2RrL2F3cy1pYW1cIlxuaW1wb3J0ICogYXMgczMgZnJvbSBcIkBhd3MtY2RrL2F3cy1zM1wiXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcIkBhd3MtY2RrL2NvcmVcIlxuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gXCJAYXdzLWNkay9hd3MtZXZlbnRzXCJcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSBcIkBhd3MtY2RrL2F3cy1ldmVudHMtdGFyZ2V0c1wiXG5pbXBvcnQgeyBDb3JzSHR0cE1ldGhvZCwgSHR0cE1ldGhvZCwgSHR0cEFwaSB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djInXG5pbXBvcnQgeyBIdHRwTGFtYmRhQXV0aG9yaXplciwgSHR0cExhbWJkYVJlc3BvbnNlVHlwZSB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djItYXV0aG9yaXplcnMnO1xuaW1wb3J0IHsgSHR0cExhbWJkYUludGVncmF0aW9uIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMnO1xuaW1wb3J0IHsgRHluYW1vRXZlbnRTb3VyY2UgfSBmcm9tICdAYXdzLWNkay9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiXG5pbXBvcnQgeyBcbiAgU0VDUkVULCBcbn0gZnJvbSAnLi4vLmVudidcbmltcG9ydCB7XG4gIFNUQUdFLCBcbiAgQURNSU5TX1RBQkxFLFxuICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gIEhBU0hfQUxHLFxuICBQUk9EVUNUU19UQUJMRSxcbiAgQUNDRVNTX1RPS0VOX05BTUUsXG4gIFBST0RVQ1RTX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgRU1BSUxfVkVSSUZJQ0FUSU9OX0xJTktfRU5EUE9JTlQsXG4gIENIQU5HRV9GT1JHT1RfUEFTU1dPUkRfTElOSyxcbiAgTk9fVEFHU19TVFJJTkcsXG4gIEVNQUlMX1NJR05BVFVSRSxcbiAgU0FNRV9PUklHSU5BTF9QUk9GSUxFX1BIT1RPX1NUUklORyxcbn0gZnJvbSBcIi4uL2NvbnN0YW50c1wiO1xuaW1wb3J0ICogYXMgYW1wbGlmeSBmcm9tICdAYXdzLWNkay9hd3MtYW1wbGlmeSc7XG5pbXBvcnQgKiBhcyBjb2RlYnVpbGQgZnJvbSAnQGF3cy1jZGsvYXdzLWNvZGVidWlsZCc7XG5cbmludGVyZmFjZSBDdXN0b21pemFibGVTdGFjayBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgc2VzRW1haWxGcm9tOiBzdHJpbmc7XG4gIGltYWdlc0J1Y2tldDogc3RyaW5nO1xuICBhZG1pbnNCdWNrZXQ6IHN0cmluZztcbiAgY3VzdG9tRG9tYWluPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRUNvbW1lcmNlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogY2RrLkFwcCwgaWQ6IHN0cmluZywgcHJvcHM/OiBDdXN0b21pemFibGVTdGFjaykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpXG5cbiAgICAvLyB0aGlzIGFzIHN0cmluZyBjYXVzZXMgYW4gZXJyb3IgYXQgY29tcGlsZSB0aW1lIGlmIGl0IGlzIG5vdCBhIHN0cmluZ1xuICAgIGNvbnN0IEFDQ09VTlQgPSBwcm9wcz8uZW52Py5hY2NvdW50IGFzIHN0cmluZ1xuICAgIGNvbnN0IFJFR0lPTiA9IHByb3BzPy5lbnY/LnJlZ2lvbiBhcyBzdHJpbmdcbiAgICBjb25zdCBTRVNfRU1BSUxfRlJPTSA9IHByb3BzPy5zZXNFbWFpbEZyb20gYXMgc3RyaW5nXG4gICAgY29uc3QgSU1BR0VTX0JVQ0tFVCA9IHByb3BzPy5pbWFnZXNCdWNrZXQgYXMgc3RyaW5nXG4gICAgY29uc3QgQ1VTVE9NX0RPTUFJTiA9IHByb3BzPy5jdXN0b21Eb21haW5cbiAgICBjb25zdCBBRE1JTlNfQlVDS0VUID0gcHJvcHM/LmFkbWluc0J1Y2tldCBhcyBzdHJpbmdcblxuICAgIC8vIPCfkYcgY3JlYXRlIER5bmFtb2RiIHRhYmxlIGZvciBwcm9kdWN0c1xuICAgIGNvbnN0IHByb2R1Y3RzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgYCR7aWR9LXByb2R1Y3RzLXRhYmxlYCwge1xuICAgICAgdGFibGVOYW1lOiBQUk9EVUNUU19UQUJMRSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QUk9WSVNJT05FRCxcbiAgICAgIHJlYWRDYXBhY2l0eTogMSxcbiAgICAgIHdyaXRlQ2FwYWNpdHk6IDEsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFBST0RVQ1RTX1RBQkxFX1BBUlRJVElPTl9LRVksIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxuICAgIH0pXG5cbiAgICBjb25zb2xlLmxvZyhcInByb2R1Y3RzIHRhYmxlIG5hbWUg8J+RiVwiLCBwcm9kdWN0c1RhYmxlLnRhYmxlTmFtZSlcbiAgICBjb25zb2xlLmxvZyhcInByb2R1Y3RzIHRhYmxlIGFybiDwn5GJXCIsIHByb2R1Y3RzVGFibGUudGFibGVBcm4pXG4gICBcbiAgICAvLyDwn5GHIGNyZWF0ZSBEeW5hbW9kYiB0YWJsZSBmb3IgYWRtaW5zXG4gICAgY29uc3QgYWRtaW5zVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgYCR7aWR9LWFkbWlucy10YWJsZWAsIHtcbiAgICAgIHRhYmxlTmFtZTogQURNSU5TX1RBQkxFLFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBST1ZJU0lPTkVELFxuICAgICAgcmVhZENhcGFjaXR5OiAxLFxuICAgICAgd3JpdGVDYXBhY2l0eTogMSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxuICAgICAgc3RyZWFtOiBkeW5hbW9kYi5TdHJlYW1WaWV3VHlwZS5ORVdfSU1BR0UsXG4gICAgfSlcblxuICAgIGNvbnNvbGUubG9nKFwiYWRtaW5zIHRhYmxlIG5hbWUg8J+RiVwiLCBhZG1pbnNUYWJsZS50YWJsZU5hbWUpXG4gICAgY29uc29sZS5sb2coXCJhZG1pbnMgdGFibGUgYXJuIPCfkYlcIiwgYWRtaW5zVGFibGUudGFibGVBcm4pXG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBEeW5hbW9kYiB0YWJsZSBmb3IgcHJvZHVjdCBjYXRlZ29yaWVzXG4gICAgY29uc3QgcHJvZHVjdFRhZ3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBgJHtpZH0tcHJvZHVjdC10YWdzLXRhYmxlYCwge1xuICAgICAgdGFibGVOYW1lOiBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUFJPVklTSU9ORUQsXG4gICAgICByZWFkQ2FwYWNpdHk6IDEsXG4gICAgICB3cml0ZUNhcGFjaXR5OiAxLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgfSlcblxuICAgIGNvbnNvbGUubG9nKFwicHJvZHVjdCB0YWdzIHRhYmxlIG5hbWUg8J+RiVwiLCBwcm9kdWN0VGFnc1RhYmxlLnRhYmxlTmFtZSlcbiAgICBjb25zb2xlLmxvZyhcInByb2R1Y3QgdGFncyB0YWJsZSBhcm4g8J+RiVwiLCBwcm9kdWN0VGFnc1RhYmxlLnRhYmxlQXJuKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgUmVzdCBBcGkgR2F0ZXdheVxuICAgIGNvbnN0IHJlc3RBcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsIFwiYXBpXCIsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcImUtY29tbWVyY2UgcmVzdCBhcGkgZ2F0ZXdheVwiLFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6IFNUQUdFLFxuICAgICAgfSxcbiAgICAgIC8vIPCfkYcgZW5hYmxlIENPUlNcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcIkNvbnRlbnQtVHlwZVwiLCBcIlgtQW16LURhdGVcIiwgXCJBdXRob3JpemF0aW9uXCIsIFwiWC1BcGktS2V5XCIsIEFDQ0VTU19UT0tFTl9OQU1FXSxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbXCJPUFRJT05TXCIsIFwiR0VUXCIsIFwiUE9TVFwiLCBcIlBVVFwiLCBcIlBBVENIXCIsIFwiREVMRVRFXCJdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgICBhbGxvd09yaWdpbnM6IFsnKiddLFxuICAgICAgfSxcbiAgICAgIG1pbmltdW1Db21wcmVzc2lvblNpemU6IDM1MDAsIC8vIDMuNWtiXG4gICAgfSlcblxuICAgIC8vIPCfkYcgY3JlYXRlIGFuIE91dHB1dCBmb3IgdGhlIEFQSSBVUkxcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcInJlc3RBcGlVcmxcIiwgeyB2YWx1ZTogcmVzdEFwaS51cmwgfSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIGFkbWluQXV0aCBsYW1iZGEgZnVuY3Rpb25cbiAgICBjb25zdCBhZG1pbkF1dGhMYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJhZG1pbi1hdXRoLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2FkbWluLWF1dGgvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRUNSRVQsXG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQUNDT1VOVCxcbiAgICAgICAgU1RBR0UsXG4gICAgICAgIEFQSV9JRDogcmVzdEFwaS5yZXN0QXBpSWQsXG4gICAgICAgIEFDQ0VTU19UT0tFTl9OQU1FLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICBjb25zdCBhZG1pbkF1dGggPSBuZXcgYXBpZ2F0ZXdheS5Ub2tlbkF1dGhvcml6ZXIodGhpcywgXCJqd3QtdG9rZW4tYWRtaW4tYXV0aFwiLCB7XG4gICAgICBoYW5kbGVyOiBhZG1pbkF1dGhMYW1iZGFGdW5jdGlvbixcbiAgICAgIGlkZW50aXR5U291cmNlOiBgbWV0aG9kLnJlcXVlc3QuaGVhZGVyLiR7QUNDRVNTX1RPS0VOX05BTUV9YFxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGRlZmluZSBlbWFpbEF1dGggbGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgZW1haWxBdXRoTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZW1haWwtYXV0aC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9lbWFpbC1hdXRoL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VDUkVULFxuICAgICAgICBBQ0NFU1NfVE9LRU5fTkFNRSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgY29uc3QgZW1haWxBdXRoID0gbmV3IEh0dHBMYW1iZGFBdXRob3JpemVyKCdFbWFpbFZlcmlmaWNhdGlvbkF1dGhvcml6ZXInLCBlbWFpbEF1dGhMYW1iZGFGdW5jdGlvbiwge1xuICAgICAgcmVzcG9uc2VUeXBlczogW0h0dHBMYW1iZGFSZXNwb25zZVR5cGUuU0lNUExFXSxcbiAgICAgIGlkZW50aXR5U291cmNlOiBbYCRyZXF1ZXN0LnF1ZXJ5c3RyaW5nLiR7QUNDRVNTX1RPS0VOX05BTUV9YF0sXG4gICAgfSk7XG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBIVFRQIEFwaSBHYXRld2F5XG4gICAgY29uc3QgaHR0cEFwaSA9IG5ldyBIdHRwQXBpKHRoaXMsIFwiaHR0cC1hcGlcIiwge1xuICAgICAgZGVzY3JpcHRpb246IFwiZS1jb21tZXJjZSBodHRwIGFwaSBnYXRld2F5XCIsXG4gICAgICBjb3JzUHJlZmxpZ2h0OiB7XG4gICAgICAgIGFsbG93SGVhZGVyczogW1xuICAgICAgICAgICdDb250ZW50LVR5cGUnLFxuICAgICAgICAgICdYLUFtei1EYXRlJyxcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgJ1gtQXBpLUtleScsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93TWV0aG9kczogW1xuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLk9QVElPTlMsXG4gICAgICAgICAgQ29yc0h0dHBNZXRob2QuR0VULFxuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLlBPU1QsXG4gICAgICAgICAgQ29yc0h0dHBNZXRob2QuUFVULFxuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLlBBVENILFxuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLkRFTEVURSxcbiAgICAgICAgXSxcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogZmFsc2UsXG4gICAgICAgIGFsbG93T3JpZ2luczogWycqJ10sXG4gICAgICB9LFxuICAgIH0pXG5cbiAgICBjb25zdCBlQ29tbWVyY2VBbXBsaWZ5QXBwID0gbmV3IGFtcGxpZnkuQXBwKHRoaXMsICdlQ29tbWVyY2VBbXBsaWZ5QXBwJywge1xuICAgICAgc291cmNlQ29kZVByb3ZpZGVyOiBuZXcgYW1wbGlmeS5HaXRIdWJTb3VyY2VDb2RlUHJvdmlkZXIoe1xuICAgICAgICBvd25lcjogJ2dwc3BlbGxlJyxcbiAgICAgICAgcmVwb3NpdG9yeTogJ2UtY29tbWVyY2UnLFxuICAgICAgICBvYXV0aFRva2VuOiBjZGsuU2VjcmV0VmFsdWUuc2VjcmV0c01hbmFnZXIoJ2dpdGh1Yi1hY2Nlc3MtdG9rZW4nKSxcbiAgICAgIH0pLFxuICAgICAgYnVpbGRTcGVjOiBjb2RlYnVpbGQuQnVpbGRTcGVjLmZyb21PYmplY3RUb1lhbWwoeyAvLyBBbHRlcm5hdGl2ZWx5IGFkZCBhIGBhbXBsaWZ5LnltbGAgdG8gdGhlIHJlcG9cbiAgICAgICAgdmVyc2lvbjogJzEuMCcsXG4gICAgICAgIGZyb250ZW5kOiB7XG4gICAgICAgICAgcGhhc2VzOiB7XG4gICAgICAgICAgICBwcmVCdWlsZDoge1xuICAgICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAgICducG0gaW5zdGFsbCdcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJ1aWxkOiB7XG4gICAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICAgJ25wbSBydW4gYnVpbGQnXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGFydGlmYWN0czoge1xuICAgICAgICAgICAgYmFzZURpcmVjdG9yeTogJ2J1aWxkJyxcbiAgICAgICAgICAgIGZpbGVzOiBbXG4gICAgICAgICAgICAgICcqKi8qJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgICAgY2FjaGU6IHtcbiAgICAgICAgICAgIHBhdGhzOiBbXG4gICAgICAgICAgICAgICdub2RlX21vZHVsZXMvKiovKidcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgXCJSRUFDVF9BUFBfUkVTVF9BUElcIjogcmVzdEFwaS51cmwsXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBmaXhlcyBodHRwczovL2dpdGh1Yi5jb20vYXdzLWFtcGxpZnkvYW1wbGlmeS1jbGkvaXNzdWVzLzM2MDZcbiAgICBjb25zdCBmaXhSZWFjdFJvdXRlckRvbTQwM0Nsb3VkRnJvbnRJc3N1ZUN1c3RvbVJ1bGUgPSBuZXcgYW1wbGlmeS5DdXN0b21SdWxlKHtcbiAgICAgIHNvdXJjZTogJzwvXlteLl0rJHxcXFxcLig/IShjc3N8Z2lmfGljb3xqcGd8anN8cG5nfHR4dHxzdmd8d29mZnx0dGZ8bWFwfGpzb24pJCkoW14uXSskKS8+JyxcbiAgICAgIHRhcmdldDogJy9pbmRleC5odG1sJyxcbiAgICAgIHN0YXR1czogYW1wbGlmeS5SZWRpcmVjdFN0YXR1cy5SRVdSSVRFLFxuICAgIH0pXG5cbiAgICBlQ29tbWVyY2VBbXBsaWZ5QXBwLmFkZEN1c3RvbVJ1bGUoZml4UmVhY3RSb3V0ZXJEb200MDNDbG91ZEZyb250SXNzdWVDdXN0b21SdWxlKVxuICAgIGNvbnN0IGVDb21tZXJjZUJyYW5jaCA9IGVDb21tZXJjZUFtcGxpZnlBcHAuYWRkQnJhbmNoKFwibWFzdGVyXCIpO1xuXG4gICAgaWYgKENVU1RPTV9ET01BSU4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBlQ29tbWVyY2VEb21haW4gPSBuZXcgYW1wbGlmeS5Eb21haW4odGhpcywgXCJlLWNvbW1lcmNlLWRvbWFpblwiLCB7XG4gICAgICAgICAgICBhcHA6IGVDb21tZXJjZUFtcGxpZnlBcHAsXG4gICAgICAgICAgICBkb21haW5OYW1lOiBDVVNUT01fRE9NQUlOLFxuICAgICAgICAgIH0pO1xuICAgICAgICBlQ29tbWVyY2VEb21haW4ubWFwUm9vdChlQ29tbWVyY2VCcmFuY2gpXG4gICAgfVxuXG4gICAgY29uc3QgZUNvbW1lcmNlQWRtaW5BbXBsaWZ5QXBwID0gbmV3IGFtcGxpZnkuQXBwKHRoaXMsICdlQ29tbWVyY2VBZG1pbkFtcGxpZnlBcHAnLCB7XG4gICAgICBzb3VyY2VDb2RlUHJvdmlkZXI6IG5ldyBhbXBsaWZ5LkdpdEh1YlNvdXJjZUNvZGVQcm92aWRlcih7XG4gICAgICAgIG93bmVyOiAnZ3BzcGVsbGUnLFxuICAgICAgICByZXBvc2l0b3J5OiAnYWRtaW4tZS1jb21tZXJjZScsXG4gICAgICAgIG9hdXRoVG9rZW46IGNkay5TZWNyZXRWYWx1ZS5zZWNyZXRzTWFuYWdlcignZ2l0aHViLWFjY2Vzcy10b2tlbicpLFxuICAgICAgfSksXG4gICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbU9iamVjdFRvWWFtbCh7IC8vIEFsdGVybmF0aXZlbHkgYWRkIGEgYGFtcGxpZnkueW1sYCB0byB0aGUgcmVwb1xuICAgICAgICB2ZXJzaW9uOiAnMS4wJyxcbiAgICAgICAgZnJvbnRlbmQ6IHtcbiAgICAgICAgICBwaGFzZXM6IHtcbiAgICAgICAgICAgIHByZUJ1aWxkOiB7XG4gICAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICAgJ25wbSBpbnN0YWxsJ1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgICAnbnBtIHJ1biBidWlsZCdcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgYXJ0aWZhY3RzOiB7XG4gICAgICAgICAgICBiYXNlRGlyZWN0b3J5OiAnYnVpbGQnLFxuICAgICAgICAgICAgZmlsZXM6IFtcbiAgICAgICAgICAgICAgJyoqLyonXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgICBjYWNoZToge1xuICAgICAgICAgICAgcGF0aHM6IFtcbiAgICAgICAgICAgICAgJ25vZGVfbW9kdWxlcy8qKi8qJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczoge1xuICAgICAgICBcIlJFQUNUX0FQUF9SRVNUX0FQSVwiOiByZXN0QXBpLnVybCxcbiAgICAgICAgXCJSRUFDVF9BUFBfSFRUUF9BUElcIjogaHR0cEFwaS5hcGlFbmRwb2ludCxcbiAgICAgICAgXCJSRUFDVF9BUFBfQUNDRVNTX1RPS0VOX05BTUVcIjogQUNDRVNTX1RPS0VOX05BTUUsIFxuICAgICAgICBcIlJFQUNUX0FQUF9OT19UQUdTX1NUUklOR1wiOiBOT19UQUdTX1NUUklORyxcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGVDb21tZXJjZUFkbWluQW1wbGlmeUFwcC5hZGRDdXN0b21SdWxlKGZpeFJlYWN0Um91dGVyRG9tNDAzQ2xvdWRGcm9udElzc3VlQ3VzdG9tUnVsZSlcbiAgICBjb25zdCBlQ29tbWVyY2VBZG1pbkJyYW5jaCA9IGVDb21tZXJjZUFkbWluQW1wbGlmeUFwcC5hZGRCcmFuY2goXCJtYXN0ZXJcIik7XG5cbiAgICBpZiAoQ1VTVE9NX0RPTUFJTiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IGVDb21tZXJjZUFkbWluRG9tYWluID0gbmV3IGFtcGxpZnkuRG9tYWluKHRoaXMsIFwiZS1jb21tZXJjZS1hZG1pbi1kb21haW5cIiwge1xuICAgICAgICAgICAgYXBwOiBlQ29tbWVyY2VBZG1pbkFtcGxpZnlBcHAsXG4gICAgICAgICAgICBkb21haW5OYW1lOiBDVVNUT01fRE9NQUlOLFxuICAgICAgICB9KTtcbiAgICAgICAgZUNvbW1lcmNlQWRtaW5Eb21haW4ubWFwU3ViRG9tYWluKGVDb21tZXJjZUFkbWluQnJhbmNoLCBcImFkbWluXCIpXG4gICAgfVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgYW4gT3V0cHV0IGZvciB0aGUgQVBJIFVSTFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiaHR0cEFwaVVybFwiLCB7IHZhbHVlOiBodHRwQXBpLmFwaUVuZHBvaW50IH0pXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9hY2NvdW50IHJlc291cmNlXG4gICAgY29uc3QgYWNjb3VudCA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImFjY291bnRcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL2FjY291bnQgcmVzb3VyY2VcbiAgICBjb25zdCBhY2NvdW50cyA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImFjY291bnRzXCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9sb2dpbiByZXNvdXJjZVxuICAgIGNvbnN0IGxvZ2luID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwibG9naW5cIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL3Byb2R1Y3QgcmVzb3VyY2VcbiAgICBjb25zdCBwcm9kdWN0ID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwicHJvZHVjdFwiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvcHJvZHVjdHMgcmVzb3VyY2VcbiAgICBjb25zdCBwcm9kdWN0cyA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcInByb2R1Y3RzXCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9jdXN0b21lci1wcm9kdWN0IHJlc291cmNlXG4gICAgY29uc3QgY3VzdG9tZXJQcm9kdWN0ID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwiY3VzdG9tZXItcHJvZHVjdFwiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvY3VzdG9tZXItcHJvZHVjdHMgcmVzb3VyY2VcbiAgICBjb25zdCBjdXN0b21lclByb2R1Y3RzID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwiY3VzdG9tZXItcHJvZHVjdHNcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL3RhZ3MgcmVzb3VyY2VcbiAgICBjb25zdCB0YWdzID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwidGFnc1wiKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUFVUIGFjY291bnQgZnVuY3Rpb25cbiAgICBjb25zdCBwdXRBY2NvdW50TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcInB1dC1hY2NvdW50LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3B1dC1hY2NvdW50L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICAgIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBIQVNIX0FMRyxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUFVUIC9hY2NvdW50IHdpdGggcHV0QWNjb3VudExhbWJkYVxuICAgIGFjY291bnQuYWRkTWV0aG9kKFxuICAgICAgXCJQVVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHB1dEFjY291bnRMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcHV0IHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFdyaXRlRGF0YShwdXRBY2NvdW50TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUEFUQ0ggYWNjb3VudCBmdW5jdGlvblxuICAgIGNvbnN0IHBhdGNoQWNjb3VudExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwYXRjaC1hY2NvdW50LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3BhdGNoLWFjY291bnQvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFETUlOU19UQUJMRSxcbiAgICAgICAgQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICAgIEhBU0hfQUxHLFxuICAgICAgICBBRE1JTlNfQlVDS0VULFxuICAgICAgICBTQU1FX09SSUdJTkFMX1BST0ZJTEVfUEhPVE9fU1RSSU5HLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBQQVRDSCAvYWNjb3VudCB3aXRoIHBhdGNoQWNjb3VudExhbWJkYVxuICAgIGFjY291bnQuYWRkTWV0aG9kKFxuICAgICAgXCJQQVRDSFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF0Y2hBY2NvdW50TGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcHV0IHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEocGF0Y2hBY2NvdW50TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIGFjY291bnQgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRBY2NvdW50TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1hY2NvdW50LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2dldC1hY2NvdW50L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvYWNjb3VudCB3aXRoIGdldEFjY291bnRMYW1iZGFcbiAgICBhY2NvdW50LmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRBY2NvdW50TGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgZ2V0IHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFJlYWREYXRhKGdldEFjY291bnRMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQVVQgYWNjb3VudCBmdW5jdGlvblxuICAgIGNvbnN0IGdldEFjY291bnRzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1hY2NvdW50cy1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtYWNjb3VudHMvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFETUlOU19UQUJMRSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgR0VUIC9hY2NvdW50cyB3aXRoIGdldEFjY291bnRzTGFtYmRhXG4gICAgYWNjb3VudHMuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldEFjY291bnRzTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIGFkbWlucyB0YWJsZVxuICAgIGFkbWluc1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0QWNjb3VudHNMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQT1NUIGxvZ2luIGZ1bmN0aW9uXG4gICAgY29uc3QgcG9zdExvZ2luTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcInBvc3QtbG9naW4tbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcG9zdC1sb2dpbi9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFQ1JFVCxcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICAgIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBIQVNIX0FMR1xuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBQT1NUIC9sb2dpbiB3aXRoIHBvc3RMb2dpbkxhbWJkYVxuICAgIGxvZ2luLmFkZE1ldGhvZChcbiAgICAgIFwiUE9TVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocG9zdExvZ2luTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIGFkbWlucyB0YWJsZVxuICAgIGFkbWluc1RhYmxlLmdyYW50UmVhZERhdGEocG9zdExvZ2luTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIHByb2R1Y3RzIGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0UHJvZHVjdHNMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LXByb2R1Y3RzLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMDApLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtcHJvZHVjdHMvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvcHJvZHVjdHMgd2l0aCBnZXRQcm9kdWN0c0xhbWJkYVxuICAgIHByb2R1Y3RzLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRQcm9kdWN0c0xhbWJkYSksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgICAgYXV0aG9yaXplcjogYWRtaW5BdXRoLFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldFByb2R1Y3RzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIGN1c3RvbWVyIHByb2R1Y3QgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRDdXN0b21lclByb2R1Y3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LWN1c3RvbWVyLXByb2R1Y3QtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LWN1c3RvbWVyLXByb2R1Y3QvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL2N1c3RvbWVyLXByb2R1Y3Qgd2l0aCBnZXRDdXN0b21lclByb2R1Y3RMYW1iZGFcbiAgICBjdXN0b21lclByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldEN1c3RvbWVyUHJvZHVjdExhbWJkYSlcbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0cyB0YWJsZVxuICAgIHByb2R1Y3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRDdXN0b21lclByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBHRVQgY3VzdG9tZXIgcHJvZHVjdHMgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRDdXN0b21lclByb2R1Y3RzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1jdXN0b21lci1wcm9kdWN0cy1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LWN1c3RvbWVyLXByb2R1Y3RzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL2N1c3RvbWVyLXByb2R1Y3RzIHdpdGggZ2V0Q3VzdG9tZXJQcm9kdWN0c0xhbWJkYVxuICAgIGN1c3RvbWVyUHJvZHVjdHMuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldEN1c3RvbWVyUHJvZHVjdHNMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcmVhZCBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0Q3VzdG9tZXJQcm9kdWN0c0xhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIFBVVCBwcm9kdWN0IGZ1bmN0aW9uXG4gICAgY29uc3QgcHV0UHJvZHVjdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwdXQtcHJvZHVjdC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcHV0LXByb2R1Y3QvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBJTUFHRVNfQlVDS0VULFxuICAgICAgICBOT19UQUdTX1NUUklORyxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUFVUIC9wcm9kdWN0IHdpdGggcHV0UHJvZHVjdExhbWJkYVxuICAgIHByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJQVVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHB1dFByb2R1Y3RMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50V3JpdGVEYXRhKHB1dFByb2R1Y3RMYW1iZGEpXG4gICAgXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRXcml0ZURhdGEocHV0UHJvZHVjdExhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIERFTEVURSBwcm9kdWN0IGZ1bmN0aW9uXG4gICAgY29uc3QgZGVsZXRlUHJvZHVjdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJkZWxldGUtcHJvZHVjdC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZGVsZXRlLXByb2R1Y3QvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBJTUFHRVNfQlVDS0VULFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBERUxFVEUgL3Byb2R1Y3Qgd2l0aCBkZWxldGVQcm9kdWN0TGFtYmRhXG4gICAgcHJvZHVjdC5hZGRNZXRob2QoXG4gICAgICBcIkRFTEVURVwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZGVsZXRlUHJvZHVjdExhbWJkYSksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgICAgYXV0aG9yaXplcjogYWRtaW5BdXRoLFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHdyaXRlIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0cyB0YWJsZVxuICAgIHByb2R1Y3RzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGRlbGV0ZVByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdCB0YWdzIHRhYmxlXG4gICAgcHJvZHVjdFRhZ3NUYWJsZS5ncmFudFdyaXRlRGF0YShkZWxldGVQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUEFUQ0ggcHJvZHVjdCBmdW5jdGlvblxuICAgIGNvbnN0IHBhdGNoUHJvZHVjdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwYXRjaC1wcm9kdWN0LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMDApLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9wYXRjaC1wcm9kdWN0L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSU1BR0VTX0JVQ0tFVCxcbiAgICAgICAgTk9fVEFHU19TVFJJTkcsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIFBBVENIIC9wcm9kdWN0IHdpdGggcGF0Y2hQcm9kdWN0TGFtYmRhXG4gICAgcHJvZHVjdC5hZGRNZXRob2QoXG4gICAgICBcIlBBVENIXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwYXRjaFByb2R1Y3RMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShwYXRjaFByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdCB0YWdzIHRhYmxlXG4gICAgcHJvZHVjdFRhZ3NUYWJsZS5ncmFudFdyaXRlRGF0YShwYXRjaFByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQVVQgdGFncyBmdW5jdGlvblxuICAgIGNvbnN0IHB1dFRhZ3NMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicHV0LXRhZ3MtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3B1dC10YWdzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdCB0YWdzIHRhYmxlXG4gICAgcHJvZHVjdFRhZ3NUYWJsZS5ncmFudFdyaXRlRGF0YShwdXRUYWdzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUFVUIC90YWdzIHdpdGggcHV0VGFnc0xhbWJkYVxuICAgIHRhZ3MuYWRkTWV0aG9kKFxuICAgICAgXCJQVVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHB1dFRhZ3NMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIHRhZ3MgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRUYWdzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC10YWdzLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMDApLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtdGFncy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgTk9fVEFHU19TVFJJTkcsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvdGFncyB3aXRoIGdldFRhZ3NMYW1iZGFcbiAgICB0YWdzLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRUYWdzTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUYWdzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgaW1hZ2VzIGJ1Y2tldFxuICAgIGNvbnN0IGltYWdlc1MzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcInMzLWJ1Y2tldFwiLCB7XG4gICAgICBidWNrZXROYW1lOiBJTUFHRVNfQlVDS0VULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuR0VULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBVVCxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXCIqXCJdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDM2NSksXG4gICAgICAgICAgdHJhbnNpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuSU5GUkVRVUVOVF9BQ0NFU1MsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KVxuXG4gICAgLy8g8J+RhyBncmFudCB3cml0ZSBhY2Nlc3MgdG8gYnVja2V0XG4gICAgaW1hZ2VzUzNCdWNrZXQuZ3JhbnRXcml0ZShwdXRQcm9kdWN0TGFtYmRhKVxuICAgIC8vIPCfkYcgZ3JhbnQgcmVhZCBhbmQgd3JpdGUgYWNjZXNzIHRvIGJ1Y2tldFxuICAgIGltYWdlc1MzQnVja2V0LmdyYW50UmVhZFdyaXRlKGRlbGV0ZVByb2R1Y3RMYW1iZGEpXG4gICAgLy8g8J+RhyBncmFudCByZWFkIGFuZCB3cml0ZSBhY2Nlc3MgdG8gYnVja2V0XG4gICAgaW1hZ2VzUzNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocGF0Y2hQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgYWRtaW5zIGJ1Y2tldFxuICAgIGNvbnN0IGFkbWluc1MzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcInMzLWFkbWlucy1idWNrZXRcIiwge1xuICAgICAgYnVja2V0TmFtZTogQURNSU5TX0JVQ0tFVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLkdFVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBPU1QsXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5QVVQsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogW1wiKlwiXSxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogW1wiKlwiXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzNjUpLFxuICAgICAgICAgIHRyYW5zaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLklORlJFUVVFTlRfQUNDRVNTLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSlcblxuICAgIC8vIPCfkYcgZ3JhbnQgcmVhZCBhbmQgd3JpdGUgYWNjZXNzIHRvIGJ1Y2tldFxuICAgIGFkbWluc1MzQnVja2V0LmdyYW50UmVhZFdyaXRlKHBhdGNoQWNjb3VudExhbWJkYSlcblxuICAgIC8vIPCfkYcgY3JlYXRlIHRoZSBsYW1iZGEgdGhhdCBzZW5kcyB2ZXJpZmljYXRpb24gZW1haWxzXG4gICAgY29uc3Qgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdzZW5kLXZlcmlmaWNhdGlvbi1lbWFpbC1sYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMpLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvc2VuZC12ZXJpZmljYXRpb24tZW1haWwvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRVNfRU1BSUxfRlJPTSxcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBUElfRU5EUE9JTlQ6IGh0dHBBcGkuYXBpRW5kcG9pbnQsXG4gICAgICAgIFNFQ1JFVCxcbiAgICAgICAgQUNDRVNTX1RPS0VOX05BTUUsXG4gICAgICAgIEVNQUlMX1ZFUklGSUNBVElPTl9MSU5LX0VORFBPSU5ULFxuICAgICAgICBFTUFJTF9TSUdOQVRVUkUsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgQWRkIHBlcm1pc3Npb25zIHRvIHRoZSBMYW1iZGEgZnVuY3Rpb24gdG8gc2VuZCB2ZXJpZmljYXRpb24gZW1haWxzXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTGFtYmRhRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnc2VzOlNlbmRFbWFpbCcsXG4gICAgICAgICAgJ3NlczpTZW5kUmF3RW1haWwnLFxuICAgICAgICAgICdzZXM6U2VuZFRlbXBsYXRlZEVtYWlsJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6c2VzOiR7UkVHSU9OfToke1xuICAgICAgICAgICAgQUNDT1VOVFxuICAgICAgICAgIH06aWRlbnRpdHkvKmAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApXG5cbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbi5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBEeW5hbW9FdmVudFNvdXJjZShhZG1pbnNUYWJsZSwge1xuICAgICAgICBzdGFydGluZ1Bvc2l0aW9uOiBsYW1iZGEuU3RhcnRpbmdQb3NpdGlvbi5UUklNX0hPUklaT04sXG4gICAgICAgIGJhdGNoU2l6ZTogMSxcbiAgICAgICAgYmlzZWN0QmF0Y2hPbkVycm9yOiB0cnVlLFxuICAgICAgICByZXRyeUF0dGVtcHRzOiAxMCxcbiAgICAgIH0pLFxuICAgIClcblxuICAgIGNvbnN0IHNlbmRWZXJpZmljYXRpb25FbWFpbEludGVncmF0aW9uID0gbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignU2VuZFZlcmlmaWNhdGlvbkVtYWlsSW50ZWdyYXRpb24nLCBzZW5kVmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbik7XG5cbiAgICBodHRwQXBpLmFkZFJvdXRlcyh7XG4gICAgICBwYXRoOiBgL3NlbmQtdmVyaWZ5LWVtYWlsYCxcbiAgICAgIG1ldGhvZHM6IFsgSHR0cE1ldGhvZC5QT1NUIF0sXG4gICAgICBpbnRlZ3JhdGlvbjogc2VuZFZlcmlmaWNhdGlvbkVtYWlsSW50ZWdyYXRpb24sXG4gICAgICBhdXRob3JpemVyOiBlbWFpbEF1dGgsXG4gICAgfSk7XG5cbiAgICAvLyDwn5GHIGNyZWF0ZSB0aGUgbGFtYmRhIHRoYXQgYXBwbHkgZW1haWwgdmVyaWZpY2F0aW9uXG4gICAgY29uc3QgZ2V0VmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ2dldC12ZXJpZmljYXRpb24tZW1haWwnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LXZlcmlmaWNhdGlvbi1lbWFpbC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQURNSU5TX1RBQkxFLFxuICAgICAgICBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgYWRtaW5zVGFibGUuZ3JhbnRXcml0ZURhdGEoZ2V0VmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbilcblxuICAgIGNvbnN0IGVtYWlsVmVyaWZpY2F0aW9uSW50ZWdyYXRpb24gPSBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdFbWFpbFZlcmlmaWNhdGlvbkludGVncmF0aW9uJywgZ2V0VmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbik7XG5cbiAgICBodHRwQXBpLmFkZFJvdXRlcyh7XG4gICAgICBwYXRoOiBgLyR7RU1BSUxfVkVSSUZJQ0FUSU9OX0xJTktfRU5EUE9JTlR9YCxcbiAgICAgIG1ldGhvZHM6IFsgSHR0cE1ldGhvZC5HRVQgXSxcbiAgICAgIGludGVncmF0aW9uOiBlbWFpbFZlcmlmaWNhdGlvbkludGVncmF0aW9uLFxuICAgICAgYXV0aG9yaXplcjogZW1haWxBdXRoLFxuICAgIH0pO1xuXG4gICAgLy8g8J+RhyBjcmVhdGUgdGhlIGxhbWJkYSB0aGF0IHNlbmRzIGZvcmdvdCBwYXNzd29yZCBlbWFpbHNcbiAgICBjb25zdCBzZW5kRm9yZ290UGFzc3dvcmRFbWFpbExhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnc2VuZC1mb3Jnb3QtcGFzc3dvcmQtZW1haWwtbGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzKSxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3NlbmQtZm9yZ290LXBhc3N3b3JkLWVtYWlsL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VTX0VNQUlMX0ZST00sXG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgU0VDUkVULFxuICAgICAgICBBQ0NFU1NfVE9LRU5fTkFNRSxcbiAgICAgICAgQ0hBTkdFX0ZPUkdPVF9QQVNTV09SRF9MSU5LLFxuICAgICAgICBFTUFJTF9TSUdOQVRVUkUsXG4gICAgICAgIEFETUlOX0NVU1RPTV9ET01BSU46IENVU1RPTV9ET01BSU4gPyBgaHR0cHM6Ly9hZG1pbi4ke0NVU1RPTV9ET01BSU59YCA6IFwibG9jYWxob3N0OjMwMDBcIixcbiAgICAgICAgQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICB9XG4gICAgfSlcbiAgICBcbiAgICAvLyDwn5GHIEFkZCBwZXJtaXNzaW9ucyB0byB0aGUgTGFtYmRhIGZ1bmN0aW9uIHRvIHNlbmQgZm9yZ290IHBhc3N3b3JkIGVtYWlsc1xuICAgIHNlbmRGb3Jnb3RQYXNzd29yZEVtYWlsTGFtYmRhRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnc2VzOlNlbmRFbWFpbCcsXG4gICAgICAgICAgJ3NlczpTZW5kUmF3RW1haWwnLFxuICAgICAgICAgICdzZXM6U2VuZFRlbXBsYXRlZEVtYWlsJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6c2VzOiR7UkVHSU9OfToke1xuICAgICAgICAgICAgQUNDT1VOVFxuICAgICAgICAgIH06aWRlbnRpdHkvKmAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApXG5cbiAgICBjb25zdCBzZW5kRm9yZ290UGFzc3dvcmRFbWFpbEludGVncmF0aW9uID0gbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignU2VuZEZvcmdvdFBhc3N3b3JkRW1haWxJbnRlZ3JhdGlvbicsIHNlbmRGb3Jnb3RQYXNzd29yZEVtYWlsTGFtYmRhRnVuY3Rpb24pO1xuXG4gICAgaHR0cEFwaS5hZGRSb3V0ZXMoe1xuICAgICAgcGF0aDogYC9zZW5kLWZvcmdvdC1wYXNzd29yZC1lbWFpbGAsXG4gICAgICBtZXRob2RzOiBbIEh0dHBNZXRob2QuUE9TVCBdLFxuICAgICAgaW50ZWdyYXRpb246IHNlbmRGb3Jnb3RQYXNzd29yZEVtYWlsSW50ZWdyYXRpb24sXG4gICAgfSk7XG5cbiAgICAvLyDwn5GHIGNyZWF0ZSB0aGUgdHJhbnNmb3JtIGV4cGlyZWQgbGlnaHRpbmcgZGVhbHMgaW50byBub3JtYWwgcHJvZHVjdHNcbiAgICBjb25zdCBwcm9jZXNzRXhwaXJlZExpZ2h0aW5nRGVhbHNMYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ3Byb2Nlc3MtZXhwaXJlZC1saWdodG5pbmctZGVhbHMnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcHJvY2Vzcy1leHBpcmVkLWxpZ2h0bmluZy1kZWFscy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVFNfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICB9XG4gICAgfSlcblxuICAgIHByb2R1Y3RzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHByb2Nlc3NFeHBpcmVkTGlnaHRpbmdEZWFsc0xhbWJkYUZ1bmN0aW9uKVxuXG4gICAgY29uc3QgcnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnY3Jvbi1ldmVyeS01LW1pbnV0ZXMnLCB7XG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLmV4cHJlc3Npb24oJ3JhdGUoNSBtaW51dGVzKScpXG4gICAgfSlcblxuICAgIHJ1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKHByb2Nlc3NFeHBpcmVkTGlnaHRpbmdEZWFsc0xhbWJkYUZ1bmN0aW9uKSlcbiAgfVxufVxuIl19