"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ECommerceStack = void 0;
const dynamodb = require("@aws-cdk/aws-dynamodb");
const apigateway = require("@aws-cdk/aws-apigateway");
const aws_apigatewayv2_1 = require("@aws-cdk/aws-apigatewayv2");
const lambda = require("@aws-cdk/aws-lambda");
const iam = require("@aws-cdk/aws-iam");
const s3 = require("@aws-cdk/aws-s3");
const cdk = require("@aws-cdk/core");
const path = require("path");
const aws_apigatewayv2_authorizers_1 = require("@aws-cdk/aws-apigatewayv2-authorizers");
const aws_apigatewayv2_integrations_1 = require("@aws-cdk/aws-apigatewayv2-integrations");
const aws_lambda_event_sources_1 = require("@aws-cdk/aws-lambda-event-sources");
const aws_apigateway_1 = require("@aws-cdk/aws-apigateway");
const aws_dynamodb_1 = require("@aws-cdk/aws-dynamodb");
const events = require("@aws-cdk/aws-events");
const targets = require("@aws-cdk/aws-events-targets");
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
            stream: aws_dynamodb_1.StreamViewType.NEW_IMAGE,
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
            minimumCompressionSize: 3500, // 3.5kb
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
            }
        });
        // 👇 integrate PATCH /account with patchAccountLambda
        account.addMethod("PATCH", new apigateway.LambdaIntegration(patchAccountLambda), {
            authorizationType: aws_apigateway_1.AuthorizationType.CUSTOM,
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
            authorizationType: aws_apigateway_1.AuthorizationType.CUSTOM,
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
            authorizationType: aws_apigateway_1.AuthorizationType.CUSTOM,
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
            authorizationType: aws_apigateway_1.AuthorizationType.CUSTOM,
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
            authorizationType: aws_apigateway_1.AuthorizationType.CUSTOM,
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
            authorizationType: aws_apigateway_1.AuthorizationType.CUSTOM,
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
        });
        // 👇 grant write access to bucket
        s3Bucket.grantWrite(putProductLambda);
        // 👇 grant read and write access to bucket
        s3Bucket.grantReadWrite(deleteProductLambda);
        // 👇 grant read and write access to bucket
        s3Bucket.grantReadWrite(patchProductLambda);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZS1jb21tZXJjZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImUtY29tbWVyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsa0RBQWlEO0FBQ2pELHNEQUFxRDtBQUNyRCxnRUFBK0U7QUFDL0UsOENBQTZDO0FBQzdDLHdDQUF1QztBQUN2QyxzQ0FBcUM7QUFDckMscUNBQW9DO0FBQ3BDLDZCQUE0QjtBQUM1Qix3RkFBcUc7QUFDckcsMEZBQStFO0FBQy9FLGdGQUFzRTtBQUN0RSw0REFBNEQ7QUFDNUQsd0RBQXVEO0FBQ3ZELDhDQUE2QztBQUM3Qyx1REFBc0Q7QUFDdEQsa0NBRWdCO0FBQ2hCLDRDQWNzQjtBQUN0QixnREFBZ0Q7QUFDaEQsb0RBQW9EO0FBUXBELE1BQWEsY0FBZSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzNDLFlBQVksS0FBYyxFQUFFLEVBQVUsRUFBRSxLQUF5Qjs7UUFDL0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFFdkIsdUVBQXVFO1FBQ3ZFLE1BQU0sT0FBTyxHQUFHLE1BQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLEdBQUcsMENBQUUsT0FBaUIsQ0FBQTtRQUM3QyxNQUFNLE1BQU0sR0FBRyxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxHQUFHLDBDQUFFLE1BQWdCLENBQUE7UUFDM0MsTUFBTSxjQUFjLEdBQUcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLFlBQXNCLENBQUE7UUFDcEQsTUFBTSxhQUFhLEdBQUcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLFlBQXNCLENBQUE7UUFDbkQsTUFBTSxhQUFhLEdBQUcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLFlBQVksQ0FBQTtRQUV6Qyx3Q0FBd0M7UUFDeEMsTUFBTSxhQUFhLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUks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LEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUN6RCxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUM7U0FDeEQsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxjQUFjLENBQUMseUNBQXlDLENBQUMsQ0FBQyxDQUFBO0lBQ3ZGLENBQUM7Q0FDRjtBQXB3QkQsd0NBb3dCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJAYXdzLWNkay9hd3MtZHluYW1vZGJcIlxuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tIFwiQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXlcIlxuaW1wb3J0IHsgQ29yc0h0dHBNZXRob2QsIEh0dHBNZXRob2QsIEh0dHBBcGkgfSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyJ1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJAYXdzLWNkay9hd3MtbGFtYmRhXCJcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiQGF3cy1jZGsvYXdzLWlhbVwiXG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiQGF3cy1jZGsvYXdzLXMzXCJcbmltcG9ydCAqIGFzIGNkayBmcm9tIFwiQGF3cy1jZGsvY29yZVwiXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCJcbmltcG9ydCB7IEh0dHBMYW1iZGFBdXRob3JpemVyLCBIdHRwTGFtYmRhUmVzcG9uc2VUeXBlIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1hdXRob3JpemVycyc7XG5pbXBvcnQgeyBIdHRwTGFtYmRhSW50ZWdyYXRpb24gfSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucyc7XG5pbXBvcnQgeyBEeW5hbW9FdmVudFNvdXJjZSB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1sYW1iZGEtZXZlbnQtc291cmNlcyc7XG5pbXBvcnQgeyBBdXRob3JpemF0aW9uVHlwZSB9IGZyb20gXCJAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheVwiO1xuaW1wb3J0IHsgU3RyZWFtVmlld1R5cGUgfSBmcm9tICdAYXdzLWNkay9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gXCJAYXdzLWNkay9hd3MtZXZlbnRzXCJcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSBcIkBhd3MtY2RrL2F3cy1ldmVudHMtdGFyZ2V0c1wiXG5pbXBvcnQgeyBcbiAgU0VDUkVULCBcbn0gZnJvbSAnLi4vLmVudidcbmltcG9ydCB7XG4gIFNUQUdFLCBcbiAgQURNSU5TX1RBQkxFLFxuICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gIEhBU0hfQUxHLFxuICBQUk9EVUNUU19UQUJMRSxcbiAgQUNDRVNTX1RPS0VOX05BTUUsXG4gIFBST0RVQ1RTX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgRU1BSUxfVkVSSUZJQ0FUSU9OX0xJTktfRU5EUE9JTlQsXG4gIENIQU5HRV9GT1JHT1RfUEFTU1dPUkRfTElOSyxcbiAgTk9fVEFHU19TVFJJTkcsXG4gIEVNQUlMX1NJR05BVFVSRSxcbn0gZnJvbSBcIi4uL2NvbnN0YW50c1wiO1xuaW1wb3J0ICogYXMgYW1wbGlmeSBmcm9tICdAYXdzLWNkay9hd3MtYW1wbGlmeSc7XG5pbXBvcnQgKiBhcyBjb2RlYnVpbGQgZnJvbSAnQGF3cy1jZGsvYXdzLWNvZGVidWlsZCc7XG5cbmludGVyZmFjZSBDdXN0b21pemFibGVTdGFjayBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgc2VzRW1haWxGcm9tOiBzdHJpbmc7XG4gIGltYWdlc0J1Y2tldDogc3RyaW5nO1xuICBjdXN0b21Eb21haW4/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBFQ29tbWVyY2VTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGsuQXBwLCBpZDogc3RyaW5nLCBwcm9wcz86IEN1c3RvbWl6YWJsZVN0YWNrKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcylcblxuICAgIC8vIHRoaXMgYXMgc3RyaW5nIGNhdXNlcyBhbiBlcnJvciBhdCBjb21waWxlIHRpbWUgaWYgaXQgaXMgbm90IGEgc3RyaW5nXG4gICAgY29uc3QgQUNDT1VOVCA9IHByb3BzPy5lbnY/LmFjY291bnQgYXMgc3RyaW5nXG4gICAgY29uc3QgUkVHSU9OID0gcHJvcHM/LmVudj8ucmVnaW9uIGFzIHN0cmluZ1xuICAgIGNvbnN0IFNFU19FTUFJTF9GUk9NID0gcHJvcHM/LnNlc0VtYWlsRnJvbSBhcyBzdHJpbmdcbiAgICBjb25zdCBJTUFHRVNfQlVDS0VUID0gcHJvcHM/LmltYWdlc0J1Y2tldCBhcyBzdHJpbmdcbiAgICBjb25zdCBDVVNUT01fRE9NQUlOID0gcHJvcHM/LmN1c3RvbURvbWFpblxuXG4gICAgLy8g8J+RhyBjcmVhdGUgRHluYW1vZGIgdGFibGUgZm9yIHByb2R1Y3RzXG4gICAgY29uc3QgcHJvZHVjdHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBgJHtpZH0tcHJvZHVjdHMtdGFibGVgLCB7XG4gICAgICB0YWJsZU5hbWU6IFBST0RVQ1RTX1RBQkxFLFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBST1ZJU0lPTkVELFxuICAgICAgcmVhZENhcGFjaXR5OiAxLFxuICAgICAgd3JpdGVDYXBhY2l0eTogMSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgfSlcblxuICAgIGNvbnNvbGUubG9nKFwicHJvZHVjdHMgdGFibGUgbmFtZSDwn5GJXCIsIHByb2R1Y3RzVGFibGUudGFibGVOYW1lKVxuICAgIGNvbnNvbGUubG9nKFwicHJvZHVjdHMgdGFibGUgYXJuIPCfkYlcIiwgcHJvZHVjdHNUYWJsZS50YWJsZUFybilcbiAgIFxuICAgIC8vIPCfkYcgY3JlYXRlIER5bmFtb2RiIHRhYmxlIGZvciBhZG1pbnNcbiAgICBjb25zdCBhZG1pbnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBgJHtpZH0tYWRtaW5zLXRhYmxlYCwge1xuICAgICAgdGFibGVOYW1lOiBBRE1JTlNfVEFCTEUsXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUFJPVklTSU9ORUQsXG4gICAgICByZWFkQ2FwYWNpdHk6IDEsXG4gICAgICB3cml0ZUNhcGFjaXR5OiAxLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgICBzdHJlYW06IFN0cmVhbVZpZXdUeXBlLk5FV19JTUFHRSxcbiAgICB9KVxuXG4gICAgY29uc29sZS5sb2coXCJhZG1pbnMgdGFibGUgbmFtZSDwn5GJXCIsIGFkbWluc1RhYmxlLnRhYmxlTmFtZSlcbiAgICBjb25zb2xlLmxvZyhcImFkbWlucyB0YWJsZSBhcm4g8J+RiVwiLCBhZG1pbnNUYWJsZS50YWJsZUFybilcblxuICAgIC8vIPCfkYcgY3JlYXRlIER5bmFtb2RiIHRhYmxlIGZvciBwcm9kdWN0IGNhdGVnb3JpZXNcbiAgICBjb25zdCBwcm9kdWN0VGFnc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIGAke2lkfS1wcm9kdWN0LXRhZ3MtdGFibGVgLCB7XG4gICAgICB0YWJsZU5hbWU6IFBST0RVQ1RfVEFHU19UQUJMRSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QUk9WSVNJT05FRCxcbiAgICAgIHJlYWRDYXBhY2l0eTogMSxcbiAgICAgIHdyaXRlQ2FwYWNpdHk6IDEsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcbiAgICB9KVxuXG4gICAgY29uc29sZS5sb2coXCJwcm9kdWN0IHRhZ3MgdGFibGUgbmFtZSDwn5GJXCIsIHByb2R1Y3RUYWdzVGFibGUudGFibGVOYW1lKVxuICAgIGNvbnNvbGUubG9nKFwicHJvZHVjdCB0YWdzIHRhYmxlIGFybiDwn5GJXCIsIHByb2R1Y3RUYWdzVGFibGUudGFibGVBcm4pXG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBSZXN0IEFwaSBHYXRld2F5XG4gICAgY29uc3QgcmVzdEFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgXCJhcGlcIiwge1xuICAgICAgZGVzY3JpcHRpb246IFwiZS1jb21tZXJjZSByZXN0IGFwaSBnYXRld2F5XCIsXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogU1RBR0UsXG4gICAgICB9LFxuICAgICAgLy8g8J+RhyBlbmFibGUgQ09SU1xuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93SGVhZGVyczogW1wiQ29udGVudC1UeXBlXCIsIFwiWC1BbXotRGF0ZVwiLCBcIkF1dGhvcml6YXRpb25cIiwgXCJYLUFwaS1LZXlcIiwgQUNDRVNTX1RPS0VOX05BTUVdLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFtcIk9QVElPTlNcIiwgXCJHRVRcIiwgXCJQT1NUXCIsIFwiUFVUXCIsIFwiUEFUQ0hcIiwgXCJERUxFVEVcIl0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IHRydWUsXG4gICAgICAgIGFsbG93T3JpZ2luczogWycqJ10sXG4gICAgICB9LFxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBhbiBPdXRwdXQgZm9yIHRoZSBBUEkgVVJMXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJyZXN0QXBpVXJsXCIsIHsgdmFsdWU6IHJlc3RBcGkudXJsIH0pXG5cbiAgICAvLyDwn5GHIGRlZmluZSBhZG1pbkF1dGggbGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgYWRtaW5BdXRoTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiYWRtaW4tYXV0aC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9hZG1pbi1hdXRoL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VDUkVULFxuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFDQ09VTlQsXG4gICAgICAgIFNUQUdFLFxuICAgICAgICBBUElfSUQ6IHJlc3RBcGkucmVzdEFwaUlkLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICBjb25zdCBhZG1pbkF1dGggPSBuZXcgYXBpZ2F0ZXdheS5Ub2tlbkF1dGhvcml6ZXIodGhpcywgXCJqd3QtdG9rZW4tYWRtaW4tYXV0aFwiLCB7XG4gICAgICBoYW5kbGVyOiBhZG1pbkF1dGhMYW1iZGFGdW5jdGlvbixcbiAgICAgIGlkZW50aXR5U291cmNlOiBgbWV0aG9kLnJlcXVlc3QuaGVhZGVyLiR7QUNDRVNTX1RPS0VOX05BTUV9YFxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGRlZmluZSBlbWFpbEF1dGggbGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgZW1haWxBdXRoTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZW1haWwtYXV0aC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9lbWFpbC1hdXRoL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VDUkVULFxuICAgICAgICBBQ0NFU1NfVE9LRU5fTkFNRSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgY29uc3QgZW1haWxBdXRoID0gbmV3IEh0dHBMYW1iZGFBdXRob3JpemVyKCdFbWFpbFZlcmlmaWNhdGlvbkF1dGhvcml6ZXInLCBlbWFpbEF1dGhMYW1iZGFGdW5jdGlvbiwge1xuICAgICAgcmVzcG9uc2VUeXBlczogW0h0dHBMYW1iZGFSZXNwb25zZVR5cGUuU0lNUExFXSxcbiAgICAgIGlkZW50aXR5U291cmNlOiBbYCRyZXF1ZXN0LnF1ZXJ5c3RyaW5nLiR7QUNDRVNTX1RPS0VOX05BTUV9YF0sXG4gICAgfSk7XG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBIVFRQIEFwaSBHYXRld2F5XG4gICAgY29uc3QgaHR0cEFwaSA9IG5ldyBIdHRwQXBpKHRoaXMsIFwiaHR0cC1hcGlcIiwge1xuICAgICAgZGVzY3JpcHRpb246IFwiZS1jb21tZXJjZSBodHRwIGFwaSBnYXRld2F5XCIsXG4gICAgICBjb3JzUHJlZmxpZ2h0OiB7XG4gICAgICAgIGFsbG93SGVhZGVyczogW1xuICAgICAgICAgICdDb250ZW50LVR5cGUnLFxuICAgICAgICAgICdYLUFtei1EYXRlJyxcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgJ1gtQXBpLUtleScsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93TWV0aG9kczogW1xuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLk9QVElPTlMsXG4gICAgICAgICAgQ29yc0h0dHBNZXRob2QuR0VULFxuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLlBPU1QsXG4gICAgICAgICAgQ29yc0h0dHBNZXRob2QuUFVULFxuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLlBBVENILFxuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLkRFTEVURSxcbiAgICAgICAgXSxcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogZmFsc2UsXG4gICAgICAgIGFsbG93T3JpZ2luczogWycqJ10sXG4gICAgICB9LFxuICAgIH0pXG5cbiAgICBjb25zdCBlQ29tbWVyY2VBbXBsaWZ5QXBwID0gbmV3IGFtcGxpZnkuQXBwKHRoaXMsICdlQ29tbWVyY2VBbXBsaWZ5QXBwJywge1xuICAgICAgc291cmNlQ29kZVByb3ZpZGVyOiBuZXcgYW1wbGlmeS5HaXRIdWJTb3VyY2VDb2RlUHJvdmlkZXIoe1xuICAgICAgICBvd25lcjogJ2dwc3BlbGxlJyxcbiAgICAgICAgcmVwb3NpdG9yeTogJ2UtY29tbWVyY2UnLFxuICAgICAgICBvYXV0aFRva2VuOiBjZGsuU2VjcmV0VmFsdWUuc2VjcmV0c01hbmFnZXIoJ2dpdGh1Yi1hY2Nlc3MtdG9rZW4nKSxcbiAgICAgIH0pLFxuICAgICAgYnVpbGRTcGVjOiBjb2RlYnVpbGQuQnVpbGRTcGVjLmZyb21PYmplY3RUb1lhbWwoeyAvLyBBbHRlcm5hdGl2ZWx5IGFkZCBhIGBhbXBsaWZ5LnltbGAgdG8gdGhlIHJlcG9cbiAgICAgICAgdmVyc2lvbjogJzEuMCcsXG4gICAgICAgIGZyb250ZW5kOiB7XG4gICAgICAgICAgcGhhc2VzOiB7XG4gICAgICAgICAgICBwcmVCdWlsZDoge1xuICAgICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAgICducG0gaW5zdGFsbCdcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJ1aWxkOiB7XG4gICAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICAgJ25wbSBydW4gYnVpbGQnXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGFydGlmYWN0czoge1xuICAgICAgICAgICAgYmFzZURpcmVjdG9yeTogJ2J1aWxkJyxcbiAgICAgICAgICAgIGZpbGVzOiBbXG4gICAgICAgICAgICAgICcqKi8qJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgICAgY2FjaGU6IHtcbiAgICAgICAgICAgIHBhdGhzOiBbXG4gICAgICAgICAgICAgICdub2RlX21vZHVsZXMvKiovKidcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgXCJSRUFDVF9BUFBfUkVTVF9BUElcIjogcmVzdEFwaS51cmwsXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBmaXhlcyBodHRwczovL2dpdGh1Yi5jb20vYXdzLWFtcGxpZnkvYW1wbGlmeS1jbGkvaXNzdWVzLzM2MDZcbiAgICBjb25zdCBmaXhSZWFjdFJvdXRlckRvbTQwM0Nsb3VkRnJvbnRJc3N1ZUN1c3RvbVJ1bGUgPSBuZXcgYW1wbGlmeS5DdXN0b21SdWxlKHtcbiAgICAgIHNvdXJjZTogJzwvXlteLl0rJHxcXFxcLig/IShjc3N8Z2lmfGljb3xqcGd8anN8cG5nfHR4dHxzdmd8d29mZnx0dGZ8bWFwfGpzb24pJCkoW14uXSskKS8+JyxcbiAgICAgIHRhcmdldDogJy9pbmRleC5odG1sJyxcbiAgICAgIHN0YXR1czogYW1wbGlmeS5SZWRpcmVjdFN0YXR1cy5SRVdSSVRFLFxuICAgIH0pXG5cbiAgICBlQ29tbWVyY2VBbXBsaWZ5QXBwLmFkZEN1c3RvbVJ1bGUoZml4UmVhY3RSb3V0ZXJEb200MDNDbG91ZEZyb250SXNzdWVDdXN0b21SdWxlKVxuICAgIGNvbnN0IGVDb21tZXJjZUJyYW5jaCA9IGVDb21tZXJjZUFtcGxpZnlBcHAuYWRkQnJhbmNoKFwibWFzdGVyXCIpO1xuXG4gICAgaWYgKENVU1RPTV9ET01BSU4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBlQ29tbWVyY2VEb21haW4gPSBuZXcgYW1wbGlmeS5Eb21haW4odGhpcywgXCJlLWNvbW1lcmNlLWRvbWFpblwiLCB7XG4gICAgICAgICAgICBhcHA6IGVDb21tZXJjZUFtcGxpZnlBcHAsXG4gICAgICAgICAgICBkb21haW5OYW1lOiBDVVNUT01fRE9NQUlOLFxuICAgICAgICAgIH0pO1xuICAgICAgICBlQ29tbWVyY2VEb21haW4ubWFwUm9vdChlQ29tbWVyY2VCcmFuY2gpXG4gICAgfVxuXG4gICAgY29uc3QgZUNvbW1lcmNlQWRtaW5BbXBsaWZ5QXBwID0gbmV3IGFtcGxpZnkuQXBwKHRoaXMsICdlQ29tbWVyY2VBZG1pbkFtcGxpZnlBcHAnLCB7XG4gICAgICBzb3VyY2VDb2RlUHJvdmlkZXI6IG5ldyBhbXBsaWZ5LkdpdEh1YlNvdXJjZUNvZGVQcm92aWRlcih7XG4gICAgICAgIG93bmVyOiAnZ3BzcGVsbGUnLFxuICAgICAgICByZXBvc2l0b3J5OiAnYWRtaW4tZS1jb21tZXJjZScsXG4gICAgICAgIG9hdXRoVG9rZW46IGNkay5TZWNyZXRWYWx1ZS5zZWNyZXRzTWFuYWdlcignZ2l0aHViLWFjY2Vzcy10b2tlbicpLFxuICAgICAgfSksXG4gICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbU9iamVjdFRvWWFtbCh7IC8vIEFsdGVybmF0aXZlbHkgYWRkIGEgYGFtcGxpZnkueW1sYCB0byB0aGUgcmVwb1xuICAgICAgICB2ZXJzaW9uOiAnMS4wJyxcbiAgICAgICAgZnJvbnRlbmQ6IHtcbiAgICAgICAgICBwaGFzZXM6IHtcbiAgICAgICAgICAgIHByZUJ1aWxkOiB7XG4gICAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICAgJ25wbSBpbnN0YWxsJ1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgICAnbnBtIHJ1biBidWlsZCdcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgYXJ0aWZhY3RzOiB7XG4gICAgICAgICAgICBiYXNlRGlyZWN0b3J5OiAnYnVpbGQnLFxuICAgICAgICAgICAgZmlsZXM6IFtcbiAgICAgICAgICAgICAgJyoqLyonXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgICBjYWNoZToge1xuICAgICAgICAgICAgcGF0aHM6IFtcbiAgICAgICAgICAgICAgJ25vZGVfbW9kdWxlcy8qKi8qJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczoge1xuICAgICAgICBcIlJFQUNUX0FQUF9SRVNUX0FQSVwiOiByZXN0QXBpLnVybCxcbiAgICAgICAgXCJSRUFDVF9BUFBfSFRUUF9BUElcIjogaHR0cEFwaS5hcGlFbmRwb2ludCxcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGVDb21tZXJjZUFkbWluQW1wbGlmeUFwcC5hZGRDdXN0b21SdWxlKGZpeFJlYWN0Um91dGVyRG9tNDAzQ2xvdWRGcm9udElzc3VlQ3VzdG9tUnVsZSlcbiAgICBjb25zdCBlQ29tbWVyY2VBZG1pbkJyYW5jaCA9IGVDb21tZXJjZUFkbWluQW1wbGlmeUFwcC5hZGRCcmFuY2goXCJtYXN0ZXJcIik7XG5cbiAgICBpZiAoQ1VTVE9NX0RPTUFJTiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IGVDb21tZXJjZUFkbWluRG9tYWluID0gbmV3IGFtcGxpZnkuRG9tYWluKHRoaXMsIFwiZS1jb21tZXJjZS1hZG1pbi1kb21haW5cIiwge1xuICAgICAgICAgICAgYXBwOiBlQ29tbWVyY2VBZG1pbkFtcGxpZnlBcHAsXG4gICAgICAgICAgICBkb21haW5OYW1lOiBDVVNUT01fRE9NQUlOLFxuICAgICAgICB9KTtcbiAgICAgICAgZUNvbW1lcmNlQWRtaW5Eb21haW4ubWFwU3ViRG9tYWluKGVDb21tZXJjZUFkbWluQnJhbmNoLCBcImFkbWluXCIpXG4gICAgfVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgYW4gT3V0cHV0IGZvciB0aGUgQVBJIFVSTFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiaHR0cEFwaVVybFwiLCB7IHZhbHVlOiBodHRwQXBpLmFwaUVuZHBvaW50IH0pXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9hY2NvdW50IHJlc291cmNlXG4gICAgY29uc3QgYWNjb3VudCA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImFjY291bnRcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL2FjY291bnQgcmVzb3VyY2VcbiAgICBjb25zdCBhY2NvdW50cyA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImFjY291bnRzXCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9sb2dpbiByZXNvdXJjZVxuICAgIGNvbnN0IGxvZ2luID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwibG9naW5cIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL3Byb2R1Y3QgcmVzb3VyY2VcbiAgICBjb25zdCBwcm9kdWN0ID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwicHJvZHVjdFwiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvcHJvZHVjdHMgcmVzb3VyY2VcbiAgICBjb25zdCBwcm9kdWN0cyA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcInByb2R1Y3RzXCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9jdXN0b21lci1wcm9kdWN0IHJlc291cmNlXG4gICAgY29uc3QgY3VzdG9tZXJQcm9kdWN0ID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwiY3VzdG9tZXItcHJvZHVjdFwiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvY3VzdG9tZXItcHJvZHVjdHMgcmVzb3VyY2VcbiAgICBjb25zdCBjdXN0b21lclByb2R1Y3RzID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwiY3VzdG9tZXItcHJvZHVjdHNcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL3RhZ3MgcmVzb3VyY2VcbiAgICBjb25zdCB0YWdzID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwidGFnc1wiKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUFVUIGFjY291bnQgZnVuY3Rpb25cbiAgICBjb25zdCBwdXRBY2NvdW50TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcInB1dC1hY2NvdW50LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3B1dC1hY2NvdW50L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICAgIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBIQVNIX0FMRyxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUFVUIC9hY2NvdW50IHdpdGggcHV0QWNjb3VudExhbWJkYVxuICAgIGFjY291bnQuYWRkTWV0aG9kKFxuICAgICAgXCJQVVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHB1dEFjY291bnRMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcHV0IHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFdyaXRlRGF0YShwdXRBY2NvdW50TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUEFUQ0ggYWNjb3VudCBmdW5jdGlvblxuICAgIGNvbnN0IHBhdGNoQWNjb3VudExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwYXRjaC1hY2NvdW50LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3BhdGNoLWFjY291bnQvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFETUlOU19UQUJMRSxcbiAgICAgICAgQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICAgIEhBU0hfQUxHLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBQQVRDSCAvYWNjb3VudCB3aXRoIHBhdGNoQWNjb3VudExhbWJkYVxuICAgIGFjY291bnQuYWRkTWV0aG9kKFxuICAgICAgXCJQQVRDSFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF0Y2hBY2NvdW50TGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IEF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgICAgYXV0aG9yaXplcjogYWRtaW5BdXRoLFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHB1dCBwZXJtaXNzaW9ucyB0byB0aGUgYWRtaW5zIHRhYmxlXG4gICAgYWRtaW5zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHBhdGNoQWNjb3VudExhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIEdFVCBhY2NvdW50IGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0QWNjb3VudExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtYWNjb3VudC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtYWNjb3VudC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQURNSU5TX1RBQkxFLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL2FjY291bnQgd2l0aCBnZXRBY2NvdW50TGFtYmRhXG4gICAgYWNjb3VudC5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0QWNjb3VudExhbWJkYSksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBBdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSBnZXQgcGVybWlzc2lvbnMgdG8gdGhlIGFkbWlucyB0YWJsZVxuICAgIGFkbWluc1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0QWNjb3VudExhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIFBVVCBhY2NvdW50IGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0QWNjb3VudHNMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LWFjY291bnRzLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2dldC1hY2NvdW50cy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQURNSU5TX1RBQkxFLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL2FjY291bnRzIHdpdGggZ2V0QWNjb3VudHNMYW1iZGFcbiAgICBhY2NvdW50cy5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0QWNjb3VudHNMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcmVhZCBwZXJtaXNzaW9ucyB0byB0aGUgYWRtaW5zIHRhYmxlXG4gICAgYWRtaW5zVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRBY2NvdW50c0xhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIFBPU1QgbG9naW4gZnVuY3Rpb25cbiAgICBjb25zdCBwb3N0TG9naW5MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicG9zdC1sb2dpbi1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9wb3N0LWxvZ2luL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VDUkVULFxuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFETUlOU19UQUJMRSxcbiAgICAgICAgQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICAgIEhBU0hfQUxHXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIFBPU1QgL2xvZ2luIHdpdGggcG9zdExvZ2luTGFtYmRhXG4gICAgbG9naW4uYWRkTWV0aG9kKFxuICAgICAgXCJQT1NUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwb3N0TG9naW5MYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcmVhZCBwZXJtaXNzaW9ucyB0byB0aGUgYWRtaW5zIHRhYmxlXG4gICAgYWRtaW5zVGFibGUuZ3JhbnRSZWFkRGF0YShwb3N0TG9naW5MYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBHRVQgcHJvZHVjdHMgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRQcm9kdWN0c0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtcHJvZHVjdHMtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2dldC1wcm9kdWN0cy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgR0VUIC9wcm9kdWN0cyB3aXRoIGdldFByb2R1Y3RzTGFtYmRhXG4gICAgcHJvZHVjdHMuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldFByb2R1Y3RzTGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IEF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgICAgYXV0aG9yaXplcjogYWRtaW5BdXRoLFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldFByb2R1Y3RzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIGN1c3RvbWVyIHByb2R1Y3QgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRDdXN0b21lclByb2R1Y3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LWN1c3RvbWVyLXByb2R1Y3QtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LWN1c3RvbWVyLXByb2R1Y3QvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL2N1c3RvbWVyLXByb2R1Y3Qgd2l0aCBnZXRDdXN0b21lclByb2R1Y3RMYW1iZGFcbiAgICBjdXN0b21lclByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldEN1c3RvbWVyUHJvZHVjdExhbWJkYSlcbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0cyB0YWJsZVxuICAgIHByb2R1Y3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRDdXN0b21lclByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBHRVQgY3VzdG9tZXIgcHJvZHVjdHMgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRDdXN0b21lclByb2R1Y3RzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1jdXN0b21lci1wcm9kdWN0cy1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LWN1c3RvbWVyLXByb2R1Y3RzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL2N1c3RvbWVyLXByb2R1Y3RzIHdpdGggZ2V0Q3VzdG9tZXJQcm9kdWN0c0xhbWJkYVxuICAgIGN1c3RvbWVyUHJvZHVjdHMuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldEN1c3RvbWVyUHJvZHVjdHNMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcmVhZCBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0Q3VzdG9tZXJQcm9kdWN0c0xhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIFBVVCBwcm9kdWN0IGZ1bmN0aW9uXG4gICAgY29uc3QgcHV0UHJvZHVjdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwdXQtcHJvZHVjdC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcHV0LXByb2R1Y3QvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBJTUFHRVNfQlVDS0VULFxuICAgICAgICBOT19UQUdTX1NUUklORyxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUFVUIC9wcm9kdWN0IHdpdGggcHV0UHJvZHVjdExhbWJkYVxuICAgIHByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJQVVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHB1dFByb2R1Y3RMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFdyaXRlRGF0YShwdXRQcm9kdWN0TGFtYmRhKVxuICAgIFxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHdyaXRlIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0IHRhZ3MgdGFibGVcbiAgICBwcm9kdWN0VGFnc1RhYmxlLmdyYW50V3JpdGVEYXRhKHB1dFByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBERUxFVEUgcHJvZHVjdCBmdW5jdGlvblxuICAgIGNvbnN0IGRlbGV0ZVByb2R1Y3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZGVsZXRlLXByb2R1Y3QtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2RlbGV0ZS1wcm9kdWN0L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSU1BR0VTX0JVQ0tFVCxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgREVMRVRFIC9wcm9kdWN0IHdpdGggZGVsZXRlUHJvZHVjdExhbWJkYVxuICAgIHByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJERUxFVEVcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGRlbGV0ZVByb2R1Y3RMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoZGVsZXRlUHJvZHVjdExhbWJkYSlcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHdyaXRlIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0IHRhZ3MgdGFibGVcbiAgICBwcm9kdWN0VGFnc1RhYmxlLmdyYW50V3JpdGVEYXRhKGRlbGV0ZVByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQQVRDSCBwcm9kdWN0IGZ1bmN0aW9uXG4gICAgY29uc3QgcGF0Y2hQcm9kdWN0TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcInBhdGNoLXByb2R1Y3QtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3BhdGNoLXByb2R1Y3QvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBJTUFHRVNfQlVDS0VULFxuICAgICAgICBOT19UQUdTX1NUUklORyxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUEFUQ0ggL3Byb2R1Y3Qgd2l0aCBwYXRjaFByb2R1Y3RMYW1iZGFcbiAgICBwcm9kdWN0LmFkZE1ldGhvZChcbiAgICAgIFwiUEFUQ0hcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBhdGNoUHJvZHVjdExhbWJkYSksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBBdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShwYXRjaFByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdCB0YWdzIHRhYmxlXG4gICAgcHJvZHVjdFRhZ3NUYWJsZS5ncmFudFdyaXRlRGF0YShwYXRjaFByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQVVQgdGFncyBmdW5jdGlvblxuICAgIGNvbnN0IHB1dFRhZ3NMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicHV0LXRhZ3MtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3B1dC10YWdzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdCB0YWdzIHRhYmxlXG4gICAgcHJvZHVjdFRhZ3NUYWJsZS5ncmFudFdyaXRlRGF0YShwdXRUYWdzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUFVUIC90YWdzIHdpdGggcHV0VGFnc0xhbWJkYVxuICAgIHRhZ3MuYWRkTWV0aG9kKFxuICAgICAgXCJQVVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHB1dFRhZ3NMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIHRhZ3MgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRUYWdzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC10YWdzLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMDApLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtdGFncy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgTk9fVEFHU19TVFJJTkcsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvdGFncyB3aXRoIGdldFRhZ3NMYW1iZGFcbiAgICB0YWdzLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRUYWdzTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUYWdzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgYnVja2V0XG4gICAgY29uc3QgczNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiczMtYnVja2V0XCIsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IElNQUdFU19CVUNLRVQsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IGZhbHNlLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogdHJ1ZSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5HRVQsXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5QT1NULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUFVULFxuICAgICAgICAgIF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFtcIipcIl0sXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFtcIipcIl0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzY1KSxcbiAgICAgICAgICB0cmFuc2l0aW9uczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdG9yYWdlQ2xhc3M6IHMzLlN0b3JhZ2VDbGFzcy5JTkZSRVFVRU5UX0FDQ0VTUyxcbiAgICAgICAgICAgICAgdHJhbnNpdGlvbkFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGdyYW50IHdyaXRlIGFjY2VzcyB0byBidWNrZXRcbiAgICBzM0J1Y2tldC5ncmFudFdyaXRlKHB1dFByb2R1Y3RMYW1iZGEpXG4gICAgLy8g8J+RhyBncmFudCByZWFkIGFuZCB3cml0ZSBhY2Nlc3MgdG8gYnVja2V0XG4gICAgczNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoZGVsZXRlUHJvZHVjdExhbWJkYSlcbiAgICAvLyDwn5GHIGdyYW50IHJlYWQgYW5kIHdyaXRlIGFjY2VzcyB0byBidWNrZXRcbiAgICBzM0J1Y2tldC5ncmFudFJlYWRXcml0ZShwYXRjaFByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGNyZWF0ZSB0aGUgbGFtYmRhIHRoYXQgc2VuZHMgdmVyaWZpY2F0aW9uIGVtYWlsc1xuICAgIGNvbnN0IHNlbmRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnc2VuZC12ZXJpZmljYXRpb24tZW1haWwtbGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBtZW1vcnlTaXplOiAxMjgsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzKSxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3NlbmQtdmVyaWZpY2F0aW9uLWVtYWlsL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VTX0VNQUlMX0ZST00sXG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQVBJX0VORFBPSU5UOiBodHRwQXBpLmFwaUVuZHBvaW50LFxuICAgICAgICBTRUNSRVQsXG4gICAgICAgIEFDQ0VTU19UT0tFTl9OQU1FLFxuICAgICAgICBFTUFJTF9WRVJJRklDQVRJT05fTElOS19FTkRQT0lOVCxcbiAgICAgICAgRU1BSUxfU0lHTkFUVVJFLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIEFkZCBwZXJtaXNzaW9ucyB0byB0aGUgTGFtYmRhIGZ1bmN0aW9uIHRvIHNlbmQgdmVyaWZpY2F0aW9uIGVtYWlsc1xuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3NlczpTZW5kRW1haWwnLFxuICAgICAgICAgICdzZXM6U2VuZFJhd0VtYWlsJyxcbiAgICAgICAgICAnc2VzOlNlbmRUZW1wbGF0ZWRFbWFpbCcsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOnNlczoke1JFR0lPTn06JHtcbiAgICAgICAgICAgIEFDQ09VTlRcbiAgICAgICAgICB9OmlkZW50aXR5LypgLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgKVxuXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTGFtYmRhRnVuY3Rpb24uYWRkRXZlbnRTb3VyY2UoXG4gICAgICBuZXcgRHluYW1vRXZlbnRTb3VyY2UoYWRtaW5zVGFibGUsIHtcbiAgICAgICAgc3RhcnRpbmdQb3NpdGlvbjogbGFtYmRhLlN0YXJ0aW5nUG9zaXRpb24uVFJJTV9IT1JJWk9OLFxuICAgICAgICBiYXRjaFNpemU6IDEsXG4gICAgICAgIGJpc2VjdEJhdGNoT25FcnJvcjogdHJ1ZSxcbiAgICAgICAgcmV0cnlBdHRlbXB0czogMTAsXG4gICAgICB9KSxcbiAgICApXG5cbiAgICBjb25zdCBzZW5kVmVyaWZpY2F0aW9uRW1haWxJbnRlZ3JhdGlvbiA9IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ1NlbmRWZXJpZmljYXRpb25FbWFpbEludGVncmF0aW9uJywgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTGFtYmRhRnVuY3Rpb24pO1xuXG4gICAgaHR0cEFwaS5hZGRSb3V0ZXMoe1xuICAgICAgcGF0aDogYC9zZW5kLXZlcmlmeS1lbWFpbGAsXG4gICAgICBtZXRob2RzOiBbIEh0dHBNZXRob2QuUE9TVCBdLFxuICAgICAgaW50ZWdyYXRpb246IHNlbmRWZXJpZmljYXRpb25FbWFpbEludGVncmF0aW9uLFxuICAgICAgYXV0aG9yaXplcjogZW1haWxBdXRoLFxuICAgIH0pO1xuXG4gICAgLy8g8J+RhyBjcmVhdGUgdGhlIGxhbWJkYSB0aGF0IGFwcGx5IGVtYWlsIHZlcmlmaWNhdGlvblxuICAgIGNvbnN0IGdldFZlcmlmaWNhdGlvbkVtYWlsTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdnZXQtdmVyaWZpY2F0aW9uLWVtYWlsJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2dldC12ZXJpZmljYXRpb24tZW1haWwvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFETUlOU19UQUJMRSxcbiAgICAgICAgQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICB9XG4gICAgfSlcblxuICAgIGFkbWluc1RhYmxlLmdyYW50V3JpdGVEYXRhKGdldFZlcmlmaWNhdGlvbkVtYWlsTGFtYmRhRnVuY3Rpb24pXG5cbiAgICBjb25zdCBlbWFpbFZlcmlmaWNhdGlvbkludGVncmF0aW9uID0gbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignRW1haWxWZXJpZmljYXRpb25JbnRlZ3JhdGlvbicsIGdldFZlcmlmaWNhdGlvbkVtYWlsTGFtYmRhRnVuY3Rpb24pO1xuXG4gICAgaHR0cEFwaS5hZGRSb3V0ZXMoe1xuICAgICAgcGF0aDogYC8ke0VNQUlMX1ZFUklGSUNBVElPTl9MSU5LX0VORFBPSU5UfWAsXG4gICAgICBtZXRob2RzOiBbIEh0dHBNZXRob2QuR0VUIF0sXG4gICAgICBpbnRlZ3JhdGlvbjogZW1haWxWZXJpZmljYXRpb25JbnRlZ3JhdGlvbixcbiAgICAgIGF1dGhvcml6ZXI6IGVtYWlsQXV0aCxcbiAgICB9KTtcblxuICAgIC8vIPCfkYcgY3JlYXRlIHRoZSBsYW1iZGEgdGhhdCBzZW5kcyBmb3Jnb3QgcGFzc3dvcmQgZW1haWxzXG4gICAgY29uc3Qgc2VuZEZvcmdvdFBhc3N3b3JkRW1haWxMYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ3NlbmQtZm9yZ290LXBhc3N3b3JkLWVtYWlsLWxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMyksXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9zZW5kLWZvcmdvdC1wYXNzd29yZC1lbWFpbC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFU19FTUFJTF9GUk9NLFxuICAgICAgICBSRUdJT04sXG4gICAgICAgIFNFQ1JFVCxcbiAgICAgICAgQUNDRVNTX1RPS0VOX05BTUUsXG4gICAgICAgIENIQU5HRV9GT1JHT1RfUEFTU1dPUkRfTElOSyxcbiAgICAgICAgRU1BSUxfU0lHTkFUVVJFLFxuICAgICAgICBBRE1JTl9DVVNUT01fRE9NQUlOOiBDVVNUT01fRE9NQUlOID8gYGh0dHBzOi8vYWRtaW4uJHtDVVNUT01fRE9NQUlOfWAgOiBcImxvY2FsaG9zdDozMDAwXCIsXG4gICAgICAgIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG4gICAgXG4gICAgLy8g8J+RhyBBZGQgcGVybWlzc2lvbnMgdG8gdGhlIExhbWJkYSBmdW5jdGlvbiB0byBzZW5kIGZvcmdvdCBwYXNzd29yZCBlbWFpbHNcbiAgICBzZW5kRm9yZ290UGFzc3dvcmRFbWFpbExhbWJkYUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3NlczpTZW5kRW1haWwnLFxuICAgICAgICAgICdzZXM6U2VuZFJhd0VtYWlsJyxcbiAgICAgICAgICAnc2VzOlNlbmRUZW1wbGF0ZWRFbWFpbCcsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOnNlczoke1JFR0lPTn06JHtcbiAgICAgICAgICAgIEFDQ09VTlRcbiAgICAgICAgICB9OmlkZW50aXR5LypgLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgKVxuXG4gICAgY29uc3Qgc2VuZEZvcmdvdFBhc3N3b3JkRW1haWxJbnRlZ3JhdGlvbiA9IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ1NlbmRGb3Jnb3RQYXNzd29yZEVtYWlsSW50ZWdyYXRpb24nLCBzZW5kRm9yZ290UGFzc3dvcmRFbWFpbExhbWJkYUZ1bmN0aW9uKTtcblxuICAgIGh0dHBBcGkuYWRkUm91dGVzKHtcbiAgICAgIHBhdGg6IGAvc2VuZC1mb3Jnb3QtcGFzc3dvcmQtZW1haWxgLFxuICAgICAgbWV0aG9kczogWyBIdHRwTWV0aG9kLlBPU1QgXSxcbiAgICAgIGludGVncmF0aW9uOiBzZW5kRm9yZ290UGFzc3dvcmRFbWFpbEludGVncmF0aW9uLFxuICAgIH0pO1xuXG4gICAgLy8g8J+RhyBjcmVhdGUgdGhlIHRyYW5zZm9ybSBleHBpcmVkIGxpZ2h0aW5nIGRlYWxzIGludG8gbm9ybWFsIHByb2R1Y3RzXG4gICAgY29uc3QgcHJvY2Vzc0V4cGlyZWRMaWdodGluZ0RlYWxzTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdwcm9jZXNzLWV4cGlyZWQtbGlnaHRuaW5nLWRlYWxzJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3Byb2Nlc3MtZXhwaXJlZC1saWdodG5pbmctZGVhbHMvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShwcm9jZXNzRXhwaXJlZExpZ2h0aW5nRGVhbHNMYW1iZGFGdW5jdGlvbilcblxuICAgIGNvbnN0IHJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ2Nyb24tZXZlcnktNS1taW51dGVzJywge1xuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5leHByZXNzaW9uKCdyYXRlKDUgbWludXRlcyknKVxuICAgIH0pXG5cbiAgICBydWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihwcm9jZXNzRXhwaXJlZExpZ2h0aW5nRGVhbHNMYW1iZGFGdW5jdGlvbikpXG4gIH1cbn1cbiJdfQ==