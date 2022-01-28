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
        const PAGE_TITLE = (props === null || props === void 0 ? void 0 : props.pageTitle) || '';
        const PAGE_DESCRIPTION = (props === null || props === void 0 ? void 0 : props.pageDescription) || '';
        const APP_NAME = (props === null || props === void 0 ? void 0 : props.appName) || '';
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
                "REACT_APP_PAGE_TITLE": PAGE_TITLE,
                "REACT_APP_PAGE_DESCRIPTION": PAGE_DESCRIPTION,
                "REACT_APP_APP_NAME": APP_NAME,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZS1jb21tZXJjZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImUtY29tbWVyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsa0RBQWlEO0FBQ2pELHNEQUFxRDtBQUNyRCw4Q0FBNkM7QUFDN0Msd0NBQXVDO0FBQ3ZDLHNDQUFxQztBQUNyQyxxQ0FBb0M7QUFDcEMsOENBQTZDO0FBQzdDLHVEQUFzRDtBQUN0RCxnRUFBK0U7QUFDL0Usd0ZBQXFHO0FBQ3JHLDBGQUErRTtBQUMvRSxnRkFBc0U7QUFDdEUsNkJBQTRCO0FBQzVCLGtDQUVnQjtBQUNoQiw0Q0Flc0I7QUFDdEIsZ0RBQWdEO0FBQ2hELG9EQUFvRDtBQVlwRCxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWMsRUFBRSxFQUFVLEVBQUUsS0FBeUI7O1FBQy9ELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFBO1FBRXZCLHVFQUF1RTtRQUN2RSxNQUFNLE9BQU8sR0FBRyxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxHQUFHLDBDQUFFLE9BQWlCLENBQUE7UUFDN0MsTUFBTSxNQUFNLEdBQUcsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsR0FBRywwQ0FBRSxNQUFnQixDQUFBO1FBQzNDLE1BQU0sY0FBYyxHQUFHLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxZQUFzQixDQUFBO1FBQ3BELE1BQU0sYUFBYSxHQUFHLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxZQUFzQixDQUFBO1FBQ25ELE1BQU0sYUFBYSxHQUFHLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxZQUFZLENBQUE7UUFDekMsTUFBTSxhQUFhLEdBQUcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLFlBQXNCLENBQUE7UUFDbkQsTUFBTSxVQUFVLEdBQUcsQ0FBQSxL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RSxrQ0FBa0M7U0FDaEQsQ0FBQyxDQUFDO1FBRUgsc0VBQXNFO1FBQ3RFLE1BQU0seUNBQXlDLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxpQ0FBaUMsRUFBRTtZQUM3RyxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDaEMsT0FBTyxFQUFFLGNBQWM7WUFDdkIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDhDQUE4QyxDQUFDLENBQUM7WUFDakcsV0FBVyxFQUFFO2dCQUNYLE1BQU07Z0JBQ04sY0FBYyxFQUFkLDBCQUFjO2dCQUNkLDRCQUE0QixFQUE1Qix3Q0FBNEI7YUFDN0I7U0FDRixDQUFDLENBQUE7UUFFRixhQUFhLENBQUMsa0JBQWtCLENBQUMseUNBQXlDLENBQUMsQ0FBQTtRQUUzRSxNQUFNLElBQUksR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQ3pELFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQztTQUN4RCxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxDQUFDLGNBQWMsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDLENBQUE7SUFDdkYsQ0FBQztDQUNGO0FBcnpCRCx3Q0FxekJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcIkBhd3MtY2RrL2F3cy1keW5hbW9kYlwiXG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gXCJAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheVwiXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcIkBhd3MtY2RrL2F3cy1sYW1iZGFcIlxuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJAYXdzLWNkay9hd3MtaWFtXCJcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJAYXdzLWNkay9hd3MtczNcIlxuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJAYXdzLWNkay9jb3JlXCJcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tIFwiQGF3cy1jZGsvYXdzLWV2ZW50c1wiXG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gXCJAYXdzLWNkay9hd3MtZXZlbnRzLXRhcmdldHNcIlxuaW1wb3J0IHsgQ29yc0h0dHBNZXRob2QsIEh0dHBNZXRob2QsIEh0dHBBcGkgfSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyJ1xuaW1wb3J0IHsgSHR0cExhbWJkYUF1dGhvcml6ZXIsIEh0dHBMYW1iZGFSZXNwb25zZVR5cGUgfSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyLWF1dGhvcml6ZXJzJztcbmltcG9ydCB7IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbiB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1hcGlnYXRld2F5djItaW50ZWdyYXRpb25zJztcbmltcG9ydCB7IER5bmFtb0V2ZW50U291cmNlIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWxhbWJkYS1ldmVudC1zb3VyY2VzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIlxuaW1wb3J0IHsgXG4gIFNFQ1JFVCwgXG59IGZyb20gJy4uLy5lbnYnXG5pbXBvcnQge1xuICBTVEFHRSwgXG4gIEFETUlOU19UQUJMRSxcbiAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICBIQVNIX0FMRyxcbiAgUFJPRFVDVFNfVEFCTEUsXG4gIEFDQ0VTU19UT0tFTl9OQU1FLFxuICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgUFJPRFVDVF9UQUdTX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gIEVNQUlMX1ZFUklGSUNBVElPTl9MSU5LX0VORFBPSU5ULFxuICBDSEFOR0VfRk9SR09UX1BBU1NXT1JEX0xJTkssXG4gIE5PX1RBR1NfU1RSSU5HLFxuICBFTUFJTF9TSUdOQVRVUkUsXG4gIFNBTUVfT1JJR0lOQUxfUFJPRklMRV9QSE9UT19TVFJJTkcsXG59IGZyb20gXCIuLi9jb25zdGFudHNcIjtcbmltcG9ydCAqIGFzIGFtcGxpZnkgZnJvbSAnQGF3cy1jZGsvYXdzLWFtcGxpZnknO1xuaW1wb3J0ICogYXMgY29kZWJ1aWxkIGZyb20gJ0Bhd3MtY2RrL2F3cy1jb2RlYnVpbGQnO1xuXG5pbnRlcmZhY2UgQ3VzdG9taXphYmxlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHNlc0VtYWlsRnJvbTogc3RyaW5nO1xuICBpbWFnZXNCdWNrZXQ6IHN0cmluZztcbiAgYWRtaW5zQnVja2V0OiBzdHJpbmc7XG4gIGN1c3RvbURvbWFpbj86IHN0cmluZztcbiAgcGFnZVRpdGxlPzogc3RyaW5nO1xuICBwYWdlRGVzY3JpcHRpb24/OiBzdHJpbmc7XG4gIGFwcE5hbWU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBFQ29tbWVyY2VTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGsuQXBwLCBpZDogc3RyaW5nLCBwcm9wcz86IEN1c3RvbWl6YWJsZVN0YWNrKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcylcblxuICAgIC8vIHRoaXMgYXMgc3RyaW5nIGNhdXNlcyBhbiBlcnJvciBhdCBjb21waWxlIHRpbWUgaWYgaXQgaXMgbm90IGEgc3RyaW5nXG4gICAgY29uc3QgQUNDT1VOVCA9IHByb3BzPy5lbnY/LmFjY291bnQgYXMgc3RyaW5nXG4gICAgY29uc3QgUkVHSU9OID0gcHJvcHM/LmVudj8ucmVnaW9uIGFzIHN0cmluZ1xuICAgIGNvbnN0IFNFU19FTUFJTF9GUk9NID0gcHJvcHM/LnNlc0VtYWlsRnJvbSBhcyBzdHJpbmdcbiAgICBjb25zdCBJTUFHRVNfQlVDS0VUID0gcHJvcHM/LmltYWdlc0J1Y2tldCBhcyBzdHJpbmdcbiAgICBjb25zdCBDVVNUT01fRE9NQUlOID0gcHJvcHM/LmN1c3RvbURvbWFpblxuICAgIGNvbnN0IEFETUlOU19CVUNLRVQgPSBwcm9wcz8uYWRtaW5zQnVja2V0IGFzIHN0cmluZ1xuICAgIGNvbnN0IFBBR0VfVElUTEUgPSBwcm9wcz8ucGFnZVRpdGxlIHx8ICcnXG4gICAgY29uc3QgUEFHRV9ERVNDUklQVElPTiA9IHByb3BzPy5wYWdlRGVzY3JpcHRpb24gfHwgJydcbiAgICBjb25zdCBBUFBfTkFNRSA9IHByb3BzPy5hcHBOYW1lIHx8ICcnXG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBEeW5hbW9kYiB0YWJsZSBmb3IgcHJvZHVjdHNcbiAgICBjb25zdCBwcm9kdWN0c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIGAke2lkfS1wcm9kdWN0cy10YWJsZWAsIHtcbiAgICAgIHRhYmxlTmFtZTogUFJPRFVDVFNfVEFCTEUsXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUFJPVklTSU9ORUQsXG4gICAgICByZWFkQ2FwYWNpdHk6IDEsXG4gICAgICB3cml0ZUNhcGFjaXR5OiAxLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcbiAgICB9KVxuXG4gICAgY29uc29sZS5sb2coXCJwcm9kdWN0cyB0YWJsZSBuYW1lIPCfkYlcIiwgcHJvZHVjdHNUYWJsZS50YWJsZU5hbWUpXG4gICAgY29uc29sZS5sb2coXCJwcm9kdWN0cyB0YWJsZSBhcm4g8J+RiVwiLCBwcm9kdWN0c1RhYmxlLnRhYmxlQXJuKVxuICAgXG4gICAgLy8g8J+RhyBjcmVhdGUgRHluYW1vZGIgdGFibGUgZm9yIGFkbWluc1xuICAgIGNvbnN0IGFkbWluc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIGAke2lkfS1hZG1pbnMtdGFibGVgLCB7XG4gICAgICB0YWJsZU5hbWU6IEFETUlOU19UQUJMRSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QUk9WSVNJT05FRCxcbiAgICAgIHJlYWRDYXBhY2l0eTogMSxcbiAgICAgIHdyaXRlQ2FwYWNpdHk6IDEsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcbiAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0lNQUdFLFxuICAgIH0pXG5cbiAgICBjb25zb2xlLmxvZyhcImFkbWlucyB0YWJsZSBuYW1lIPCfkYlcIiwgYWRtaW5zVGFibGUudGFibGVOYW1lKVxuICAgIGNvbnNvbGUubG9nKFwiYWRtaW5zIHRhYmxlIGFybiDwn5GJXCIsIGFkbWluc1RhYmxlLnRhYmxlQXJuKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgRHluYW1vZGIgdGFibGUgZm9yIHByb2R1Y3QgY2F0ZWdvcmllc1xuICAgIGNvbnN0IHByb2R1Y3RUYWdzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgYCR7aWR9LXByb2R1Y3QtdGFncy10YWJsZWAsIHtcbiAgICAgIHRhYmxlTmFtZTogUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBST1ZJU0lPTkVELFxuICAgICAgcmVhZENhcGFjaXR5OiAxLFxuICAgICAgd3JpdGVDYXBhY2l0eTogMSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogUFJPRFVDVF9UQUdTX1RBQkxFX1BBUlRJVElPTl9LRVksIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxuICAgIH0pXG5cbiAgICBjb25zb2xlLmxvZyhcInByb2R1Y3QgdGFncyB0YWJsZSBuYW1lIPCfkYlcIiwgcHJvZHVjdFRhZ3NUYWJsZS50YWJsZU5hbWUpXG4gICAgY29uc29sZS5sb2coXCJwcm9kdWN0IHRhZ3MgdGFibGUgYXJuIPCfkYlcIiwgcHJvZHVjdFRhZ3NUYWJsZS50YWJsZUFybilcblxuICAgIC8vIPCfkYcgY3JlYXRlIFJlc3QgQXBpIEdhdGV3YXlcbiAgICBjb25zdCByZXN0QXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCBcImFwaVwiLCB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJlLWNvbW1lcmNlIHJlc3QgYXBpIGdhdGV3YXlcIixcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBTVEFHRSxcbiAgICAgIH0sXG4gICAgICAvLyDwn5GHIGVuYWJsZSBDT1JTXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXCJDb250ZW50LVR5cGVcIiwgXCJYLUFtei1EYXRlXCIsIFwiQXV0aG9yaXphdGlvblwiLCBcIlgtQXBpLUtleVwiLCBBQ0NFU1NfVE9LRU5fTkFNRV0sXG4gICAgICAgIGFsbG93TWV0aG9kczogW1wiT1BUSU9OU1wiLCBcIkdFVFwiLCBcIlBPU1RcIiwgXCJQVVRcIiwgXCJQQVRDSFwiLCBcIkRFTEVURVwiXSxcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogdHJ1ZSxcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBbJyonXSxcbiAgICAgIH0sXG4gICAgICBtaW5pbXVtQ29tcHJlc3Npb25TaXplOiAzNTAwLCAvLyAzLjVrYlxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBhbiBPdXRwdXQgZm9yIHRoZSBBUEkgVVJMXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJyZXN0QXBpVXJsXCIsIHsgdmFsdWU6IHJlc3RBcGkudXJsIH0pXG5cbiAgICAvLyDwn5GHIGRlZmluZSBhZG1pbkF1dGggbGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgYWRtaW5BdXRoTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiYWRtaW4tYXV0aC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9hZG1pbi1hdXRoL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VDUkVULFxuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFDQ09VTlQsXG4gICAgICAgIFNUQUdFLFxuICAgICAgICBBUElfSUQ6IHJlc3RBcGkucmVzdEFwaUlkLFxuICAgICAgICBBQ0NFU1NfVE9LRU5fTkFNRSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgY29uc3QgYWRtaW5BdXRoID0gbmV3IGFwaWdhdGV3YXkuVG9rZW5BdXRob3JpemVyKHRoaXMsIFwiand0LXRva2VuLWFkbWluLWF1dGhcIiwge1xuICAgICAgaGFuZGxlcjogYWRtaW5BdXRoTGFtYmRhRnVuY3Rpb24sXG4gICAgICBpZGVudGl0eVNvdXJjZTogYG1ldGhvZC5yZXF1ZXN0LmhlYWRlci4ke0FDQ0VTU19UT0tFTl9OQU1FfWBcbiAgICB9KVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgZW1haWxBdXRoIGxhbWJkYSBmdW5jdGlvblxuICAgIGNvbnN0IGVtYWlsQXV0aExhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImVtYWlsLWF1dGgtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZW1haWwtYXV0aC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFQ1JFVCxcbiAgICAgICAgQUNDRVNTX1RPS0VOX05BTUUsXG4gICAgICB9XG4gICAgfSlcblxuICAgIGNvbnN0IGVtYWlsQXV0aCA9IG5ldyBIdHRwTGFtYmRhQXV0aG9yaXplcignRW1haWxWZXJpZmljYXRpb25BdXRob3JpemVyJywgZW1haWxBdXRoTGFtYmRhRnVuY3Rpb24sIHtcbiAgICAgIHJlc3BvbnNlVHlwZXM6IFtIdHRwTGFtYmRhUmVzcG9uc2VUeXBlLlNJTVBMRV0sXG4gICAgICBpZGVudGl0eVNvdXJjZTogW2AkcmVxdWVzdC5xdWVyeXN0cmluZy4ke0FDQ0VTU19UT0tFTl9OQU1FfWBdLFxuICAgIH0pO1xuXG4gICAgLy8g8J+RhyBjcmVhdGUgSFRUUCBBcGkgR2F0ZXdheVxuICAgIGNvbnN0IGh0dHBBcGkgPSBuZXcgSHR0cEFwaSh0aGlzLCBcImh0dHAtYXBpXCIsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcImUtY29tbWVyY2UgaHR0cCBhcGkgZ2F0ZXdheVwiLFxuICAgICAgY29yc1ByZWZsaWdodDoge1xuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFwaS1LZXknLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFtcbiAgICAgICAgICBDb3JzSHR0cE1ldGhvZC5PUFRJT05TLFxuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLkdFVCxcbiAgICAgICAgICBDb3JzSHR0cE1ldGhvZC5QT1NULFxuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLlBVVCxcbiAgICAgICAgICBDb3JzSHR0cE1ldGhvZC5QQVRDSCxcbiAgICAgICAgICBDb3JzSHR0cE1ldGhvZC5ERUxFVEUsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IGZhbHNlLFxuICAgICAgICBhbGxvd09yaWdpbnM6IFsnKiddLFxuICAgICAgfSxcbiAgICB9KVxuXG4gICAgY29uc3QgZUNvbW1lcmNlQW1wbGlmeUFwcCA9IG5ldyBhbXBsaWZ5LkFwcCh0aGlzLCAnZUNvbW1lcmNlQW1wbGlmeUFwcCcsIHtcbiAgICAgIHNvdXJjZUNvZGVQcm92aWRlcjogbmV3IGFtcGxpZnkuR2l0SHViU291cmNlQ29kZVByb3ZpZGVyKHtcbiAgICAgICAgb3duZXI6ICdncHNwZWxsZScsXG4gICAgICAgIHJlcG9zaXRvcnk6ICdlLWNvbW1lcmNlJyxcbiAgICAgICAgb2F1dGhUb2tlbjogY2RrLlNlY3JldFZhbHVlLnNlY3JldHNNYW5hZ2VyKCdnaXRodWItYWNjZXNzLXRva2VuJyksXG4gICAgICB9KSxcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0VG9ZYW1sKHsgLy8gQWx0ZXJuYXRpdmVseSBhZGQgYSBgYW1wbGlmeS55bWxgIHRvIHRoZSByZXBvXG4gICAgICAgIHZlcnNpb246ICcxLjAnLFxuICAgICAgICBmcm9udGVuZDoge1xuICAgICAgICAgIHBoYXNlczoge1xuICAgICAgICAgICAgcHJlQnVpbGQ6IHtcbiAgICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgICAnbnBtIGluc3RhbGwnXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAgICducG0gcnVuIGJ1aWxkJ1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhcnRpZmFjdHM6IHtcbiAgICAgICAgICAgIGJhc2VEaXJlY3Rvcnk6ICdidWlsZCcsXG4gICAgICAgICAgICBmaWxlczogW1xuICAgICAgICAgICAgICAnKiovKidcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGNhY2hlOiB7XG4gICAgICAgICAgICBwYXRoczogW1xuICAgICAgICAgICAgICAnbm9kZV9tb2R1bGVzLyoqLyonXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiB7XG4gICAgICAgIFwiUkVBQ1RfQVBQX1JFU1RfQVBJXCI6IHJlc3RBcGkudXJsLFxuICAgICAgICBcIlJFQUNUX0FQUF9QQUdFX1RJVExFXCI6IFBBR0VfVElUTEUsXG4gICAgICAgIFwiUkVBQ1RfQVBQX1BBR0VfREVTQ1JJUFRJT05cIjogUEFHRV9ERVNDUklQVElPTixcbiAgICAgICAgXCJSRUFDVF9BUFBfQVBQX05BTUVcIjogQVBQX05BTUUsXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBmaXhlcyBodHRwczovL2dpdGh1Yi5jb20vYXdzLWFtcGxpZnkvYW1wbGlmeS1jbGkvaXNzdWVzLzM2MDZcbiAgICBjb25zdCBmaXhSZWFjdFJvdXRlckRvbTQwM0Nsb3VkRnJvbnRJc3N1ZUN1c3RvbVJ1bGUgPSBuZXcgYW1wbGlmeS5DdXN0b21SdWxlKHtcbiAgICAgIHNvdXJjZTogJzwvXlteLl0rJHxcXFxcLig/IShjc3N8Z2lmfGljb3xqcGd8anN8cG5nfHR4dHxzdmd8d29mZnx0dGZ8bWFwfGpzb24pJCkoW14uXSskKS8+JyxcbiAgICAgIHRhcmdldDogJy9pbmRleC5odG1sJyxcbiAgICAgIHN0YXR1czogYW1wbGlmeS5SZWRpcmVjdFN0YXR1cy5SRVdSSVRFLFxuICAgIH0pXG5cbiAgICBlQ29tbWVyY2VBbXBsaWZ5QXBwLmFkZEN1c3RvbVJ1bGUoZml4UmVhY3RSb3V0ZXJEb200MDNDbG91ZEZyb250SXNzdWVDdXN0b21SdWxlKVxuICAgIGNvbnN0IGVDb21tZXJjZUJyYW5jaCA9IGVDb21tZXJjZUFtcGxpZnlBcHAuYWRkQnJhbmNoKFwibWFzdGVyXCIpO1xuXG4gICAgaWYgKENVU1RPTV9ET01BSU4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBlQ29tbWVyY2VEb21haW4gPSBuZXcgYW1wbGlmeS5Eb21haW4odGhpcywgXCJlLWNvbW1lcmNlLWRvbWFpblwiLCB7XG4gICAgICAgICAgICBhcHA6IGVDb21tZXJjZUFtcGxpZnlBcHAsXG4gICAgICAgICAgICBkb21haW5OYW1lOiBDVVNUT01fRE9NQUlOLFxuICAgICAgICAgIH0pO1xuICAgICAgICBlQ29tbWVyY2VEb21haW4ubWFwUm9vdChlQ29tbWVyY2VCcmFuY2gpXG4gICAgfVxuXG4gICAgY29uc3QgZUNvbW1lcmNlQWRtaW5BbXBsaWZ5QXBwID0gbmV3IGFtcGxpZnkuQXBwKHRoaXMsICdlQ29tbWVyY2VBZG1pbkFtcGxpZnlBcHAnLCB7XG4gICAgICBzb3VyY2VDb2RlUHJvdmlkZXI6IG5ldyBhbXBsaWZ5LkdpdEh1YlNvdXJjZUNvZGVQcm92aWRlcih7XG4gICAgICAgIG93bmVyOiAnZ3BzcGVsbGUnLFxuICAgICAgICByZXBvc2l0b3J5OiAnYWRtaW4tZS1jb21tZXJjZScsXG4gICAgICAgIG9hdXRoVG9rZW46IGNkay5TZWNyZXRWYWx1ZS5zZWNyZXRzTWFuYWdlcignZ2l0aHViLWFjY2Vzcy10b2tlbicpLFxuICAgICAgfSksXG4gICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbU9iamVjdFRvWWFtbCh7IC8vIEFsdGVybmF0aXZlbHkgYWRkIGEgYGFtcGxpZnkueW1sYCB0byB0aGUgcmVwb1xuICAgICAgICB2ZXJzaW9uOiAnMS4wJyxcbiAgICAgICAgZnJvbnRlbmQ6IHtcbiAgICAgICAgICBwaGFzZXM6IHtcbiAgICAgICAgICAgIHByZUJ1aWxkOiB7XG4gICAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICAgJ25wbSBpbnN0YWxsJ1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgICAnbnBtIHJ1biBidWlsZCdcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgYXJ0aWZhY3RzOiB7XG4gICAgICAgICAgICBiYXNlRGlyZWN0b3J5OiAnYnVpbGQnLFxuICAgICAgICAgICAgZmlsZXM6IFtcbiAgICAgICAgICAgICAgJyoqLyonXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgICBjYWNoZToge1xuICAgICAgICAgICAgcGF0aHM6IFtcbiAgICAgICAgICAgICAgJ25vZGVfbW9kdWxlcy8qKi8qJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczoge1xuICAgICAgICBcIlJFQUNUX0FQUF9SRVNUX0FQSVwiOiByZXN0QXBpLnVybCxcbiAgICAgICAgXCJSRUFDVF9BUFBfSFRUUF9BUElcIjogaHR0cEFwaS5hcGlFbmRwb2ludCxcbiAgICAgICAgXCJSRUFDVF9BUFBfQUNDRVNTX1RPS0VOX05BTUVcIjogQUNDRVNTX1RPS0VOX05BTUUsIFxuICAgICAgICBcIlJFQUNUX0FQUF9OT19UQUdTX1NUUklOR1wiOiBOT19UQUdTX1NUUklORyxcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGVDb21tZXJjZUFkbWluQW1wbGlmeUFwcC5hZGRDdXN0b21SdWxlKGZpeFJlYWN0Um91dGVyRG9tNDAzQ2xvdWRGcm9udElzc3VlQ3VzdG9tUnVsZSlcbiAgICBjb25zdCBlQ29tbWVyY2VBZG1pbkJyYW5jaCA9IGVDb21tZXJjZUFkbWluQW1wbGlmeUFwcC5hZGRCcmFuY2goXCJtYXN0ZXJcIik7XG5cbiAgICBpZiAoQ1VTVE9NX0RPTUFJTiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IGVDb21tZXJjZUFkbWluRG9tYWluID0gbmV3IGFtcGxpZnkuRG9tYWluKHRoaXMsIFwiZS1jb21tZXJjZS1hZG1pbi1kb21haW5cIiwge1xuICAgICAgICAgICAgYXBwOiBlQ29tbWVyY2VBZG1pbkFtcGxpZnlBcHAsXG4gICAgICAgICAgICBkb21haW5OYW1lOiBDVVNUT01fRE9NQUlOLFxuICAgICAgICB9KTtcbiAgICAgICAgZUNvbW1lcmNlQWRtaW5Eb21haW4ubWFwU3ViRG9tYWluKGVDb21tZXJjZUFkbWluQnJhbmNoLCBcImFkbWluXCIpXG4gICAgfVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgYW4gT3V0cHV0IGZvciB0aGUgQVBJIFVSTFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiaHR0cEFwaVVybFwiLCB7IHZhbHVlOiBodHRwQXBpLmFwaUVuZHBvaW50IH0pXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9hY2NvdW50IHJlc291cmNlXG4gICAgY29uc3QgYWNjb3VudCA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImFjY291bnRcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL2FjY291bnQgcmVzb3VyY2VcbiAgICBjb25zdCBhY2NvdW50cyA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImFjY291bnRzXCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9sb2dpbiByZXNvdXJjZVxuICAgIGNvbnN0IGxvZ2luID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwibG9naW5cIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL3Byb2R1Y3QgcmVzb3VyY2VcbiAgICBjb25zdCBwcm9kdWN0ID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwicHJvZHVjdFwiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvcHJvZHVjdHMgcmVzb3VyY2VcbiAgICBjb25zdCBwcm9kdWN0cyA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcInByb2R1Y3RzXCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9jdXN0b21lci1wcm9kdWN0IHJlc291cmNlXG4gICAgY29uc3QgY3VzdG9tZXJQcm9kdWN0ID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwiY3VzdG9tZXItcHJvZHVjdFwiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvY3VzdG9tZXItcHJvZHVjdHMgcmVzb3VyY2VcbiAgICBjb25zdCBjdXN0b21lclByb2R1Y3RzID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwiY3VzdG9tZXItcHJvZHVjdHNcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL3RhZ3MgcmVzb3VyY2VcbiAgICBjb25zdCB0YWdzID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwidGFnc1wiKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUFVUIGFjY291bnQgZnVuY3Rpb25cbiAgICBjb25zdCBwdXRBY2NvdW50TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcInB1dC1hY2NvdW50LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3B1dC1hY2NvdW50L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICAgIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBIQVNIX0FMRyxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUFVUIC9hY2NvdW50IHdpdGggcHV0QWNjb3VudExhbWJkYVxuICAgIGFjY291bnQuYWRkTWV0aG9kKFxuICAgICAgXCJQVVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHB1dEFjY291bnRMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcHV0IHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFdyaXRlRGF0YShwdXRBY2NvdW50TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUEFUQ0ggYWNjb3VudCBmdW5jdGlvblxuICAgIGNvbnN0IHBhdGNoQWNjb3VudExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwYXRjaC1hY2NvdW50LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3BhdGNoLWFjY291bnQvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFETUlOU19UQUJMRSxcbiAgICAgICAgQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICAgIEhBU0hfQUxHLFxuICAgICAgICBBRE1JTlNfQlVDS0VULFxuICAgICAgICBTQU1FX09SSUdJTkFMX1BST0ZJTEVfUEhPVE9fU1RSSU5HLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBQQVRDSCAvYWNjb3VudCB3aXRoIHBhdGNoQWNjb3VudExhbWJkYVxuICAgIGFjY291bnQuYWRkTWV0aG9kKFxuICAgICAgXCJQQVRDSFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF0Y2hBY2NvdW50TGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcHV0IHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEocGF0Y2hBY2NvdW50TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIGFjY291bnQgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRBY2NvdW50TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1hY2NvdW50LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2dldC1hY2NvdW50L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvYWNjb3VudCB3aXRoIGdldEFjY291bnRMYW1iZGFcbiAgICBhY2NvdW50LmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRBY2NvdW50TGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgZ2V0IHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFJlYWREYXRhKGdldEFjY291bnRMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQVVQgYWNjb3VudCBmdW5jdGlvblxuICAgIGNvbnN0IGdldEFjY291bnRzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1hY2NvdW50cy1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtYWNjb3VudHMvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFETUlOU19UQUJMRSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgR0VUIC9hY2NvdW50cyB3aXRoIGdldEFjY291bnRzTGFtYmRhXG4gICAgYWNjb3VudHMuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldEFjY291bnRzTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIGFkbWlucyB0YWJsZVxuICAgIGFkbWluc1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0QWNjb3VudHNMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQT1NUIGxvZ2luIGZ1bmN0aW9uXG4gICAgY29uc3QgcG9zdExvZ2luTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcInBvc3QtbG9naW4tbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcG9zdC1sb2dpbi9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFQ1JFVCxcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICAgIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBIQVNIX0FMR1xuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBQT1NUIC9sb2dpbiB3aXRoIHBvc3RMb2dpbkxhbWJkYVxuICAgIGxvZ2luLmFkZE1ldGhvZChcbiAgICAgIFwiUE9TVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocG9zdExvZ2luTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIGFkbWlucyB0YWJsZVxuICAgIGFkbWluc1RhYmxlLmdyYW50UmVhZERhdGEocG9zdExvZ2luTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIHByb2R1Y3RzIGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0UHJvZHVjdHNMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LXByb2R1Y3RzLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMDApLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtcHJvZHVjdHMvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvcHJvZHVjdHMgd2l0aCBnZXRQcm9kdWN0c0xhbWJkYVxuICAgIHByb2R1Y3RzLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRQcm9kdWN0c0xhbWJkYSksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgICAgYXV0aG9yaXplcjogYWRtaW5BdXRoLFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldFByb2R1Y3RzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIGN1c3RvbWVyIHByb2R1Y3QgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRDdXN0b21lclByb2R1Y3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LWN1c3RvbWVyLXByb2R1Y3QtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LWN1c3RvbWVyLXByb2R1Y3QvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL2N1c3RvbWVyLXByb2R1Y3Qgd2l0aCBnZXRDdXN0b21lclByb2R1Y3RMYW1iZGFcbiAgICBjdXN0b21lclByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldEN1c3RvbWVyUHJvZHVjdExhbWJkYSlcbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0cyB0YWJsZVxuICAgIHByb2R1Y3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRDdXN0b21lclByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBHRVQgY3VzdG9tZXIgcHJvZHVjdHMgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRDdXN0b21lclByb2R1Y3RzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1jdXN0b21lci1wcm9kdWN0cy1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LWN1c3RvbWVyLXByb2R1Y3RzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL2N1c3RvbWVyLXByb2R1Y3RzIHdpdGggZ2V0Q3VzdG9tZXJQcm9kdWN0c0xhbWJkYVxuICAgIGN1c3RvbWVyUHJvZHVjdHMuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldEN1c3RvbWVyUHJvZHVjdHNMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcmVhZCBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0Q3VzdG9tZXJQcm9kdWN0c0xhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIFBVVCBwcm9kdWN0IGZ1bmN0aW9uXG4gICAgY29uc3QgcHV0UHJvZHVjdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwdXQtcHJvZHVjdC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcHV0LXByb2R1Y3QvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBJTUFHRVNfQlVDS0VULFxuICAgICAgICBOT19UQUdTX1NUUklORyxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUFVUIC9wcm9kdWN0IHdpdGggcHV0UHJvZHVjdExhbWJkYVxuICAgIHByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJQVVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHB1dFByb2R1Y3RMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50V3JpdGVEYXRhKHB1dFByb2R1Y3RMYW1iZGEpXG4gICAgXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRXcml0ZURhdGEocHV0UHJvZHVjdExhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIERFTEVURSBwcm9kdWN0IGZ1bmN0aW9uXG4gICAgY29uc3QgZGVsZXRlUHJvZHVjdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJkZWxldGUtcHJvZHVjdC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZGVsZXRlLXByb2R1Y3QvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBJTUFHRVNfQlVDS0VULFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBERUxFVEUgL3Byb2R1Y3Qgd2l0aCBkZWxldGVQcm9kdWN0TGFtYmRhXG4gICAgcHJvZHVjdC5hZGRNZXRob2QoXG4gICAgICBcIkRFTEVURVwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZGVsZXRlUHJvZHVjdExhbWJkYSksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgICAgYXV0aG9yaXplcjogYWRtaW5BdXRoLFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHdyaXRlIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0cyB0YWJsZVxuICAgIHByb2R1Y3RzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGRlbGV0ZVByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdCB0YWdzIHRhYmxlXG4gICAgcHJvZHVjdFRhZ3NUYWJsZS5ncmFudFdyaXRlRGF0YShkZWxldGVQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUEFUQ0ggcHJvZHVjdCBmdW5jdGlvblxuICAgIGNvbnN0IHBhdGNoUHJvZHVjdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwYXRjaC1wcm9kdWN0LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMDApLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9wYXRjaC1wcm9kdWN0L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSU1BR0VTX0JVQ0tFVCxcbiAgICAgICAgTk9fVEFHU19TVFJJTkcsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIFBBVENIIC9wcm9kdWN0IHdpdGggcGF0Y2hQcm9kdWN0TGFtYmRhXG4gICAgcHJvZHVjdC5hZGRNZXRob2QoXG4gICAgICBcIlBBVENIXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwYXRjaFByb2R1Y3RMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShwYXRjaFByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdCB0YWdzIHRhYmxlXG4gICAgcHJvZHVjdFRhZ3NUYWJsZS5ncmFudFdyaXRlRGF0YShwYXRjaFByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQVVQgdGFncyBmdW5jdGlvblxuICAgIGNvbnN0IHB1dFRhZ3NMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicHV0LXRhZ3MtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3B1dC10YWdzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdCB0YWdzIHRhYmxlXG4gICAgcHJvZHVjdFRhZ3NUYWJsZS5ncmFudFdyaXRlRGF0YShwdXRUYWdzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUFVUIC90YWdzIHdpdGggcHV0VGFnc0xhbWJkYVxuICAgIHRhZ3MuYWRkTWV0aG9kKFxuICAgICAgXCJQVVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHB1dFRhZ3NMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIHRhZ3MgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRUYWdzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC10YWdzLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMDApLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtdGFncy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgTk9fVEFHU19TVFJJTkcsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvdGFncyB3aXRoIGdldFRhZ3NMYW1iZGFcbiAgICB0YWdzLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRUYWdzTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUYWdzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgaW1hZ2VzIGJ1Y2tldFxuICAgIGNvbnN0IGltYWdlc1MzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcInMzLWJ1Y2tldFwiLCB7XG4gICAgICBidWNrZXROYW1lOiBJTUFHRVNfQlVDS0VULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuR0VULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBVVCxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXCIqXCJdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDM2NSksXG4gICAgICAgICAgdHJhbnNpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuSU5GUkVRVUVOVF9BQ0NFU1MsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KVxuXG4gICAgLy8g8J+RhyBncmFudCB3cml0ZSBhY2Nlc3MgdG8gYnVja2V0XG4gICAgaW1hZ2VzUzNCdWNrZXQuZ3JhbnRXcml0ZShwdXRQcm9kdWN0TGFtYmRhKVxuICAgIC8vIPCfkYcgZ3JhbnQgcmVhZCBhbmQgd3JpdGUgYWNjZXNzIHRvIGJ1Y2tldFxuICAgIGltYWdlc1MzQnVja2V0LmdyYW50UmVhZFdyaXRlKGRlbGV0ZVByb2R1Y3RMYW1iZGEpXG4gICAgLy8g8J+RhyBncmFudCByZWFkIGFuZCB3cml0ZSBhY2Nlc3MgdG8gYnVja2V0XG4gICAgaW1hZ2VzUzNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocGF0Y2hQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgYWRtaW5zIGJ1Y2tldFxuICAgIGNvbnN0IGFkbWluc1MzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcInMzLWFkbWlucy1idWNrZXRcIiwge1xuICAgICAgYnVja2V0TmFtZTogQURNSU5TX0JVQ0tFVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLkdFVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBPU1QsXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5QVVQsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogW1wiKlwiXSxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogW1wiKlwiXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzNjUpLFxuICAgICAgICAgIHRyYW5zaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLklORlJFUVVFTlRfQUNDRVNTLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSlcblxuICAgIC8vIPCfkYcgZ3JhbnQgcmVhZCBhbmQgd3JpdGUgYWNjZXNzIHRvIGJ1Y2tldFxuICAgIGFkbWluc1MzQnVja2V0LmdyYW50UmVhZFdyaXRlKHBhdGNoQWNjb3VudExhbWJkYSlcblxuICAgIC8vIPCfkYcgY3JlYXRlIHRoZSBsYW1iZGEgdGhhdCBzZW5kcyB2ZXJpZmljYXRpb24gZW1haWxzXG4gICAgY29uc3Qgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdzZW5kLXZlcmlmaWNhdGlvbi1lbWFpbC1sYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMpLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvc2VuZC12ZXJpZmljYXRpb24tZW1haWwvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRVNfRU1BSUxfRlJPTSxcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBUElfRU5EUE9JTlQ6IGh0dHBBcGkuYXBpRW5kcG9pbnQsXG4gICAgICAgIFNFQ1JFVCxcbiAgICAgICAgQUNDRVNTX1RPS0VOX05BTUUsXG4gICAgICAgIEVNQUlMX1ZFUklGSUNBVElPTl9MSU5LX0VORFBPSU5ULFxuICAgICAgICBFTUFJTF9TSUdOQVRVUkUsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgQWRkIHBlcm1pc3Npb25zIHRvIHRoZSBMYW1iZGEgZnVuY3Rpb24gdG8gc2VuZCB2ZXJpZmljYXRpb24gZW1haWxzXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTGFtYmRhRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnc2VzOlNlbmRFbWFpbCcsXG4gICAgICAgICAgJ3NlczpTZW5kUmF3RW1haWwnLFxuICAgICAgICAgICdzZXM6U2VuZFRlbXBsYXRlZEVtYWlsJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6c2VzOiR7UkVHSU9OfToke1xuICAgICAgICAgICAgQUNDT1VOVFxuICAgICAgICAgIH06aWRlbnRpdHkvKmAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApXG5cbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbi5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBEeW5hbW9FdmVudFNvdXJjZShhZG1pbnNUYWJsZSwge1xuICAgICAgICBzdGFydGluZ1Bvc2l0aW9uOiBsYW1iZGEuU3RhcnRpbmdQb3NpdGlvbi5UUklNX0hPUklaT04sXG4gICAgICAgIGJhdGNoU2l6ZTogMSxcbiAgICAgICAgYmlzZWN0QmF0Y2hPbkVycm9yOiB0cnVlLFxuICAgICAgICByZXRyeUF0dGVtcHRzOiAxMCxcbiAgICAgIH0pLFxuICAgIClcblxuICAgIGNvbnN0IHNlbmRWZXJpZmljYXRpb25FbWFpbEludGVncmF0aW9uID0gbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignU2VuZFZlcmlmaWNhdGlvbkVtYWlsSW50ZWdyYXRpb24nLCBzZW5kVmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbik7XG5cbiAgICBodHRwQXBpLmFkZFJvdXRlcyh7XG4gICAgICBwYXRoOiBgL3NlbmQtdmVyaWZ5LWVtYWlsYCxcbiAgICAgIG1ldGhvZHM6IFsgSHR0cE1ldGhvZC5QT1NUIF0sXG4gICAgICBpbnRlZ3JhdGlvbjogc2VuZFZlcmlmaWNhdGlvbkVtYWlsSW50ZWdyYXRpb24sXG4gICAgICBhdXRob3JpemVyOiBlbWFpbEF1dGgsXG4gICAgfSk7XG5cbiAgICAvLyDwn5GHIGNyZWF0ZSB0aGUgbGFtYmRhIHRoYXQgYXBwbHkgZW1haWwgdmVyaWZpY2F0aW9uXG4gICAgY29uc3QgZ2V0VmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ2dldC12ZXJpZmljYXRpb24tZW1haWwnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LXZlcmlmaWNhdGlvbi1lbWFpbC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQURNSU5TX1RBQkxFLFxuICAgICAgICBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgYWRtaW5zVGFibGUuZ3JhbnRXcml0ZURhdGEoZ2V0VmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbilcblxuICAgIGNvbnN0IGVtYWlsVmVyaWZpY2F0aW9uSW50ZWdyYXRpb24gPSBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdFbWFpbFZlcmlmaWNhdGlvbkludGVncmF0aW9uJywgZ2V0VmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbik7XG5cbiAgICBodHRwQXBpLmFkZFJvdXRlcyh7XG4gICAgICBwYXRoOiBgLyR7RU1BSUxfVkVSSUZJQ0FUSU9OX0xJTktfRU5EUE9JTlR9YCxcbiAgICAgIG1ldGhvZHM6IFsgSHR0cE1ldGhvZC5HRVQgXSxcbiAgICAgIGludGVncmF0aW9uOiBlbWFpbFZlcmlmaWNhdGlvbkludGVncmF0aW9uLFxuICAgICAgYXV0aG9yaXplcjogZW1haWxBdXRoLFxuICAgIH0pO1xuXG4gICAgLy8g8J+RhyBjcmVhdGUgdGhlIGxhbWJkYSB0aGF0IHNlbmRzIGZvcmdvdCBwYXNzd29yZCBlbWFpbHNcbiAgICBjb25zdCBzZW5kRm9yZ290UGFzc3dvcmRFbWFpbExhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnc2VuZC1mb3Jnb3QtcGFzc3dvcmQtZW1haWwtbGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzKSxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3NlbmQtZm9yZ290LXBhc3N3b3JkLWVtYWlsL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VTX0VNQUlMX0ZST00sXG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgU0VDUkVULFxuICAgICAgICBBQ0NFU1NfVE9LRU5fTkFNRSxcbiAgICAgICAgQ0hBTkdFX0ZPUkdPVF9QQVNTV09SRF9MSU5LLFxuICAgICAgICBFTUFJTF9TSUdOQVRVUkUsXG4gICAgICAgIEFETUlOX0NVU1RPTV9ET01BSU46IENVU1RPTV9ET01BSU4gPyBgaHR0cHM6Ly9hZG1pbi4ke0NVU1RPTV9ET01BSU59YCA6IFwibG9jYWxob3N0OjMwMDBcIixcbiAgICAgICAgQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICB9XG4gICAgfSlcbiAgICBcbiAgICAvLyDwn5GHIEFkZCBwZXJtaXNzaW9ucyB0byB0aGUgTGFtYmRhIGZ1bmN0aW9uIHRvIHNlbmQgZm9yZ290IHBhc3N3b3JkIGVtYWlsc1xuICAgIHNlbmRGb3Jnb3RQYXNzd29yZEVtYWlsTGFtYmRhRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnc2VzOlNlbmRFbWFpbCcsXG4gICAgICAgICAgJ3NlczpTZW5kUmF3RW1haWwnLFxuICAgICAgICAgICdzZXM6U2VuZFRlbXBsYXRlZEVtYWlsJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6c2VzOiR7UkVHSU9OfToke1xuICAgICAgICAgICAgQUNDT1VOVFxuICAgICAgICAgIH06aWRlbnRpdHkvKmAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApXG5cbiAgICBjb25zdCBzZW5kRm9yZ290UGFzc3dvcmRFbWFpbEludGVncmF0aW9uID0gbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignU2VuZEZvcmdvdFBhc3N3b3JkRW1haWxJbnRlZ3JhdGlvbicsIHNlbmRGb3Jnb3RQYXNzd29yZEVtYWlsTGFtYmRhRnVuY3Rpb24pO1xuXG4gICAgaHR0cEFwaS5hZGRSb3V0ZXMoe1xuICAgICAgcGF0aDogYC9zZW5kLWZvcmdvdC1wYXNzd29yZC1lbWFpbGAsXG4gICAgICBtZXRob2RzOiBbIEh0dHBNZXRob2QuUE9TVCBdLFxuICAgICAgaW50ZWdyYXRpb246IHNlbmRGb3Jnb3RQYXNzd29yZEVtYWlsSW50ZWdyYXRpb24sXG4gICAgfSk7XG5cbiAgICAvLyDwn5GHIGNyZWF0ZSB0aGUgdHJhbnNmb3JtIGV4cGlyZWQgbGlnaHRpbmcgZGVhbHMgaW50byBub3JtYWwgcHJvZHVjdHNcbiAgICBjb25zdCBwcm9jZXNzRXhwaXJlZExpZ2h0aW5nRGVhbHNMYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ3Byb2Nlc3MtZXhwaXJlZC1saWdodG5pbmctZGVhbHMnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcHJvY2Vzcy1leHBpcmVkLWxpZ2h0bmluZy1kZWFscy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVFNfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICB9XG4gICAgfSlcblxuICAgIHByb2R1Y3RzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHByb2Nlc3NFeHBpcmVkTGlnaHRpbmdEZWFsc0xhbWJkYUZ1bmN0aW9uKVxuXG4gICAgY29uc3QgcnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnY3Jvbi1ldmVyeS01LW1pbnV0ZXMnLCB7XG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLmV4cHJlc3Npb24oJ3JhdGUoNSBtaW51dGVzKScpXG4gICAgfSlcblxuICAgIHJ1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKHByb2Nlc3NFeHBpcmVkTGlnaHRpbmdEZWFsc0xhbWJkYUZ1bmN0aW9uKSlcbiAgfVxufVxuIl19