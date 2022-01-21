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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZS1jb21tZXJjZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImUtY29tbWVyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsa0RBQWlEO0FBQ2pELHNEQUFxRDtBQUNyRCw4Q0FBNkM7QUFDN0Msd0NBQXVDO0FBQ3ZDLHNDQUFxQztBQUNyQyxxQ0FBb0M7QUFDcEMsOENBQTZDO0FBQzdDLHVEQUFzRDtBQUN0RCxnRUFBK0U7QUFDL0Usd0ZBQXFHO0FBQ3JHLDBGQUErRTtBQUMvRSxnRkFBc0U7QUFDdEUsNkJBQTRCO0FBQzVCLGtDQUVnQjtBQUNoQiw0Q0Fjc0I7QUFDdEIsZ0RBQWdEO0FBQ2hELG9EQUFvRDtBQVFwRCxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWMsRUFBRSxFQUFVLEVBQUUsS0FBeUI7O1FBQy9ELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFBO1FBRXZCLHVFQUF1RTtRQUN2RSxNQUFNLE9BQU8sR0FBRyxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxHQUFHLDBDQUFFLE9BQWlCLENBQUE7UUFDN0MsTUFBTSxNQUFNLEdBQUcsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsR0FBRywwQ0FBRSxNQUFnQixDQUFBO1FBQzNDLE1BQU0sY0FBYyxHQUFHLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxZQUFzQixDQUFBO1FBQ3BELE1BQU0sYUFBYSxHQUFHLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxZQUFzQixDQUFBO1FBQ25ELE1BQU0sYUFBYSxHQUFHLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxZQUFZLENBQUE7UUFFekMsd0NBQXdDO1FBQ3hDLE1BQU0sYUFBYSxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLGlCQUFpQixFQUFF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RUFBRTtnQkFDWCxNQUFNO2dCQUNOLGNBQWMsRUFBZCwwQkFBYztnQkFDZCw0QkFBNEIsRUFBNUIsd0NBQTRCO2FBQzdCO1NBQ0YsQ0FBQyxDQUFBO1FBRUYsYUFBYSxDQUFDLGtCQUFrQixDQUFDLHlDQUF5QyxDQUFDLENBQUE7UUFFM0UsTUFBTSxJQUFJLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUN6RCxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUM7U0FDeEQsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxjQUFjLENBQUMseUNBQXlDLENBQUMsQ0FBQyxDQUFBO0lBQ3ZGLENBQUM7Q0FDRjtBQXh3QkQsd0NBd3dCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJAYXdzLWNkay9hd3MtZHluYW1vZGJcIlxuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tIFwiQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXlcIlxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJAYXdzLWNkay9hd3MtbGFtYmRhXCJcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiQGF3cy1jZGsvYXdzLWlhbVwiXG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiQGF3cy1jZGsvYXdzLXMzXCJcbmltcG9ydCAqIGFzIGNkayBmcm9tIFwiQGF3cy1jZGsvY29yZVwiXG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSBcIkBhd3MtY2RrL2F3cy1ldmVudHNcIlxuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tIFwiQGF3cy1jZGsvYXdzLWV2ZW50cy10YXJnZXRzXCJcbmltcG9ydCB7IENvcnNIdHRwTWV0aG9kLCBIdHRwTWV0aG9kLCBIdHRwQXBpIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2MidcbmltcG9ydCB7IEh0dHBMYW1iZGFBdXRob3JpemVyLCBIdHRwTGFtYmRhUmVzcG9uc2VUeXBlIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1hdXRob3JpemVycyc7XG5pbXBvcnQgeyBIdHRwTGFtYmRhSW50ZWdyYXRpb24gfSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucyc7XG5pbXBvcnQgeyBEeW5hbW9FdmVudFNvdXJjZSB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1sYW1iZGEtZXZlbnQtc291cmNlcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCJcbmltcG9ydCB7IFxuICBTRUNSRVQsIFxufSBmcm9tICcuLi8uZW52J1xuaW1wb3J0IHtcbiAgU1RBR0UsIFxuICBBRE1JTlNfVEFCTEUsXG4gIFBST0RVQ1RfVEFHU19UQUJMRSxcbiAgSEFTSF9BTEcsXG4gIFBST0RVQ1RTX1RBQkxFLFxuICBBQ0NFU1NfVE9LRU5fTkFNRSxcbiAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICBFTUFJTF9WRVJJRklDQVRJT05fTElOS19FTkRQT0lOVCxcbiAgQ0hBTkdFX0ZPUkdPVF9QQVNTV09SRF9MSU5LLFxuICBOT19UQUdTX1NUUklORyxcbiAgRU1BSUxfU0lHTkFUVVJFLFxufSBmcm9tIFwiLi4vY29uc3RhbnRzXCI7XG5pbXBvcnQgKiBhcyBhbXBsaWZ5IGZyb20gJ0Bhd3MtY2RrL2F3cy1hbXBsaWZ5JztcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdAYXdzLWNkay9hd3MtY29kZWJ1aWxkJztcblxuaW50ZXJmYWNlIEN1c3RvbWl6YWJsZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBzZXNFbWFpbEZyb206IHN0cmluZztcbiAgaW1hZ2VzQnVja2V0OiBzdHJpbmc7XG4gIGN1c3RvbURvbWFpbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEVDb21tZXJjZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5BcHAsIGlkOiBzdHJpbmcsIHByb3BzPzogQ3VzdG9taXphYmxlU3RhY2spIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKVxuXG4gICAgLy8gdGhpcyBhcyBzdHJpbmcgY2F1c2VzIGFuIGVycm9yIGF0IGNvbXBpbGUgdGltZSBpZiBpdCBpcyBub3QgYSBzdHJpbmdcbiAgICBjb25zdCBBQ0NPVU5UID0gcHJvcHM/LmVudj8uYWNjb3VudCBhcyBzdHJpbmdcbiAgICBjb25zdCBSRUdJT04gPSBwcm9wcz8uZW52Py5yZWdpb24gYXMgc3RyaW5nXG4gICAgY29uc3QgU0VTX0VNQUlMX0ZST00gPSBwcm9wcz8uc2VzRW1haWxGcm9tIGFzIHN0cmluZ1xuICAgIGNvbnN0IElNQUdFU19CVUNLRVQgPSBwcm9wcz8uaW1hZ2VzQnVja2V0IGFzIHN0cmluZ1xuICAgIGNvbnN0IENVU1RPTV9ET01BSU4gPSBwcm9wcz8uY3VzdG9tRG9tYWluXG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBEeW5hbW9kYiB0YWJsZSBmb3IgcHJvZHVjdHNcbiAgICBjb25zdCBwcm9kdWN0c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIGAke2lkfS1wcm9kdWN0cy10YWJsZWAsIHtcbiAgICAgIHRhYmxlTmFtZTogUFJPRFVDVFNfVEFCTEUsXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUFJPVklTSU9ORUQsXG4gICAgICByZWFkQ2FwYWNpdHk6IDEsXG4gICAgICB3cml0ZUNhcGFjaXR5OiAxLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcbiAgICB9KVxuXG4gICAgY29uc29sZS5sb2coXCJwcm9kdWN0cyB0YWJsZSBuYW1lIPCfkYlcIiwgcHJvZHVjdHNUYWJsZS50YWJsZU5hbWUpXG4gICAgY29uc29sZS5sb2coXCJwcm9kdWN0cyB0YWJsZSBhcm4g8J+RiVwiLCBwcm9kdWN0c1RhYmxlLnRhYmxlQXJuKVxuICAgXG4gICAgLy8g8J+RhyBjcmVhdGUgRHluYW1vZGIgdGFibGUgZm9yIGFkbWluc1xuICAgIGNvbnN0IGFkbWluc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIGAke2lkfS1hZG1pbnMtdGFibGVgLCB7XG4gICAgICB0YWJsZU5hbWU6IEFETUlOU19UQUJMRSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QUk9WSVNJT05FRCxcbiAgICAgIHJlYWRDYXBhY2l0eTogMSxcbiAgICAgIHdyaXRlQ2FwYWNpdHk6IDEsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcbiAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0lNQUdFLFxuICAgIH0pXG5cbiAgICBjb25zb2xlLmxvZyhcImFkbWlucyB0YWJsZSBuYW1lIPCfkYlcIiwgYWRtaW5zVGFibGUudGFibGVOYW1lKVxuICAgIGNvbnNvbGUubG9nKFwiYWRtaW5zIHRhYmxlIGFybiDwn5GJXCIsIGFkbWluc1RhYmxlLnRhYmxlQXJuKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgRHluYW1vZGIgdGFibGUgZm9yIHByb2R1Y3QgY2F0ZWdvcmllc1xuICAgIGNvbnN0IHByb2R1Y3RUYWdzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgYCR7aWR9LXByb2R1Y3QtdGFncy10YWJsZWAsIHtcbiAgICAgIHRhYmxlTmFtZTogUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBST1ZJU0lPTkVELFxuICAgICAgcmVhZENhcGFjaXR5OiAxLFxuICAgICAgd3JpdGVDYXBhY2l0eTogMSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogUFJPRFVDVF9UQUdTX1RBQkxFX1BBUlRJVElPTl9LRVksIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxuICAgIH0pXG5cbiAgICBjb25zb2xlLmxvZyhcInByb2R1Y3QgdGFncyB0YWJsZSBuYW1lIPCfkYlcIiwgcHJvZHVjdFRhZ3NUYWJsZS50YWJsZU5hbWUpXG4gICAgY29uc29sZS5sb2coXCJwcm9kdWN0IHRhZ3MgdGFibGUgYXJuIPCfkYlcIiwgcHJvZHVjdFRhZ3NUYWJsZS50YWJsZUFybilcblxuICAgIC8vIPCfkYcgY3JlYXRlIFJlc3QgQXBpIEdhdGV3YXlcbiAgICBjb25zdCByZXN0QXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCBcImFwaVwiLCB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJlLWNvbW1lcmNlIHJlc3QgYXBpIGdhdGV3YXlcIixcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBTVEFHRSxcbiAgICAgIH0sXG4gICAgICAvLyDwn5GHIGVuYWJsZSBDT1JTXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXCJDb250ZW50LVR5cGVcIiwgXCJYLUFtei1EYXRlXCIsIFwiQXV0aG9yaXphdGlvblwiLCBcIlgtQXBpLUtleVwiLCBBQ0NFU1NfVE9LRU5fTkFNRV0sXG4gICAgICAgIGFsbG93TWV0aG9kczogW1wiT1BUSU9OU1wiLCBcIkdFVFwiLCBcIlBPU1RcIiwgXCJQVVRcIiwgXCJQQVRDSFwiLCBcIkRFTEVURVwiXSxcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogdHJ1ZSxcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBbJyonXSxcbiAgICAgIH0sXG4gICAgICBtaW5pbXVtQ29tcHJlc3Npb25TaXplOiAzNTAwLCAvLyAzLjVrYlxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBhbiBPdXRwdXQgZm9yIHRoZSBBUEkgVVJMXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJyZXN0QXBpVXJsXCIsIHsgdmFsdWU6IHJlc3RBcGkudXJsIH0pXG5cbiAgICAvLyDwn5GHIGRlZmluZSBhZG1pbkF1dGggbGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgYWRtaW5BdXRoTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiYWRtaW4tYXV0aC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9hZG1pbi1hdXRoL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VDUkVULFxuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFDQ09VTlQsXG4gICAgICAgIFNUQUdFLFxuICAgICAgICBBUElfSUQ6IHJlc3RBcGkucmVzdEFwaUlkLFxuICAgICAgICBBQ0NFU1NfVE9LRU5fTkFNRSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgY29uc3QgYWRtaW5BdXRoID0gbmV3IGFwaWdhdGV3YXkuVG9rZW5BdXRob3JpemVyKHRoaXMsIFwiand0LXRva2VuLWFkbWluLWF1dGhcIiwge1xuICAgICAgaGFuZGxlcjogYWRtaW5BdXRoTGFtYmRhRnVuY3Rpb24sXG4gICAgICBpZGVudGl0eVNvdXJjZTogYG1ldGhvZC5yZXF1ZXN0LmhlYWRlci4ke0FDQ0VTU19UT0tFTl9OQU1FfWBcbiAgICB9KVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgZW1haWxBdXRoIGxhbWJkYSBmdW5jdGlvblxuICAgIGNvbnN0IGVtYWlsQXV0aExhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImVtYWlsLWF1dGgtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZW1haWwtYXV0aC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFQ1JFVCxcbiAgICAgICAgQUNDRVNTX1RPS0VOX05BTUUsXG4gICAgICB9XG4gICAgfSlcblxuICAgIGNvbnN0IGVtYWlsQXV0aCA9IG5ldyBIdHRwTGFtYmRhQXV0aG9yaXplcignRW1haWxWZXJpZmljYXRpb25BdXRob3JpemVyJywgZW1haWxBdXRoTGFtYmRhRnVuY3Rpb24sIHtcbiAgICAgIHJlc3BvbnNlVHlwZXM6IFtIdHRwTGFtYmRhUmVzcG9uc2VUeXBlLlNJTVBMRV0sXG4gICAgICBpZGVudGl0eVNvdXJjZTogW2AkcmVxdWVzdC5xdWVyeXN0cmluZy4ke0FDQ0VTU19UT0tFTl9OQU1FfWBdLFxuICAgIH0pO1xuXG4gICAgLy8g8J+RhyBjcmVhdGUgSFRUUCBBcGkgR2F0ZXdheVxuICAgIGNvbnN0IGh0dHBBcGkgPSBuZXcgSHR0cEFwaSh0aGlzLCBcImh0dHAtYXBpXCIsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcImUtY29tbWVyY2UgaHR0cCBhcGkgZ2F0ZXdheVwiLFxuICAgICAgY29yc1ByZWZsaWdodDoge1xuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFwaS1LZXknLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFtcbiAgICAgICAgICBDb3JzSHR0cE1ldGhvZC5PUFRJT05TLFxuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLkdFVCxcbiAgICAgICAgICBDb3JzSHR0cE1ldGhvZC5QT1NULFxuICAgICAgICAgIENvcnNIdHRwTWV0aG9kLlBVVCxcbiAgICAgICAgICBDb3JzSHR0cE1ldGhvZC5QQVRDSCxcbiAgICAgICAgICBDb3JzSHR0cE1ldGhvZC5ERUxFVEUsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IGZhbHNlLFxuICAgICAgICBhbGxvd09yaWdpbnM6IFsnKiddLFxuICAgICAgfSxcbiAgICB9KVxuXG4gICAgY29uc3QgZUNvbW1lcmNlQW1wbGlmeUFwcCA9IG5ldyBhbXBsaWZ5LkFwcCh0aGlzLCAnZUNvbW1lcmNlQW1wbGlmeUFwcCcsIHtcbiAgICAgIHNvdXJjZUNvZGVQcm92aWRlcjogbmV3IGFtcGxpZnkuR2l0SHViU291cmNlQ29kZVByb3ZpZGVyKHtcbiAgICAgICAgb3duZXI6ICdncHNwZWxsZScsXG4gICAgICAgIHJlcG9zaXRvcnk6ICdlLWNvbW1lcmNlJyxcbiAgICAgICAgb2F1dGhUb2tlbjogY2RrLlNlY3JldFZhbHVlLnNlY3JldHNNYW5hZ2VyKCdnaXRodWItYWNjZXNzLXRva2VuJyksXG4gICAgICB9KSxcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0VG9ZYW1sKHsgLy8gQWx0ZXJuYXRpdmVseSBhZGQgYSBgYW1wbGlmeS55bWxgIHRvIHRoZSByZXBvXG4gICAgICAgIHZlcnNpb246ICcxLjAnLFxuICAgICAgICBmcm9udGVuZDoge1xuICAgICAgICAgIHBoYXNlczoge1xuICAgICAgICAgICAgcHJlQnVpbGQ6IHtcbiAgICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgICAnbnBtIGluc3RhbGwnXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAgICducG0gcnVuIGJ1aWxkJ1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhcnRpZmFjdHM6IHtcbiAgICAgICAgICAgIGJhc2VEaXJlY3Rvcnk6ICdidWlsZCcsXG4gICAgICAgICAgICBmaWxlczogW1xuICAgICAgICAgICAgICAnKiovKidcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGNhY2hlOiB7XG4gICAgICAgICAgICBwYXRoczogW1xuICAgICAgICAgICAgICAnbm9kZV9tb2R1bGVzLyoqLyonXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiB7XG4gICAgICAgIFwiUkVBQ1RfQVBQX1JFU1RfQVBJXCI6IHJlc3RBcGkudXJsLFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gZml4ZXMgaHR0cHM6Ly9naXRodWIuY29tL2F3cy1hbXBsaWZ5L2FtcGxpZnktY2xpL2lzc3Vlcy8zNjA2XG4gICAgY29uc3QgZml4UmVhY3RSb3V0ZXJEb200MDNDbG91ZEZyb250SXNzdWVDdXN0b21SdWxlID0gbmV3IGFtcGxpZnkuQ3VzdG9tUnVsZSh7XG4gICAgICBzb3VyY2U6ICc8L15bXi5dKyR8XFxcXC4oPyEoY3NzfGdpZnxpY298anBnfGpzfHBuZ3x0eHR8c3ZnfHdvZmZ8dHRmfG1hcHxqc29uKSQpKFteLl0rJCkvPicsXG4gICAgICB0YXJnZXQ6ICcvaW5kZXguaHRtbCcsXG4gICAgICBzdGF0dXM6IGFtcGxpZnkuUmVkaXJlY3RTdGF0dXMuUkVXUklURSxcbiAgICB9KVxuXG4gICAgZUNvbW1lcmNlQW1wbGlmeUFwcC5hZGRDdXN0b21SdWxlKGZpeFJlYWN0Um91dGVyRG9tNDAzQ2xvdWRGcm9udElzc3VlQ3VzdG9tUnVsZSlcbiAgICBjb25zdCBlQ29tbWVyY2VCcmFuY2ggPSBlQ29tbWVyY2VBbXBsaWZ5QXBwLmFkZEJyYW5jaChcIm1hc3RlclwiKTtcblxuICAgIGlmIChDVVNUT01fRE9NQUlOICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgZUNvbW1lcmNlRG9tYWluID0gbmV3IGFtcGxpZnkuRG9tYWluKHRoaXMsIFwiZS1jb21tZXJjZS1kb21haW5cIiwge1xuICAgICAgICAgICAgYXBwOiBlQ29tbWVyY2VBbXBsaWZ5QXBwLFxuICAgICAgICAgICAgZG9tYWluTmFtZTogQ1VTVE9NX0RPTUFJTixcbiAgICAgICAgICB9KTtcbiAgICAgICAgZUNvbW1lcmNlRG9tYWluLm1hcFJvb3QoZUNvbW1lcmNlQnJhbmNoKVxuICAgIH1cblxuICAgIGNvbnN0IGVDb21tZXJjZUFkbWluQW1wbGlmeUFwcCA9IG5ldyBhbXBsaWZ5LkFwcCh0aGlzLCAnZUNvbW1lcmNlQWRtaW5BbXBsaWZ5QXBwJywge1xuICAgICAgc291cmNlQ29kZVByb3ZpZGVyOiBuZXcgYW1wbGlmeS5HaXRIdWJTb3VyY2VDb2RlUHJvdmlkZXIoe1xuICAgICAgICBvd25lcjogJ2dwc3BlbGxlJyxcbiAgICAgICAgcmVwb3NpdG9yeTogJ2FkbWluLWUtY29tbWVyY2UnLFxuICAgICAgICBvYXV0aFRva2VuOiBjZGsuU2VjcmV0VmFsdWUuc2VjcmV0c01hbmFnZXIoJ2dpdGh1Yi1hY2Nlc3MtdG9rZW4nKSxcbiAgICAgIH0pLFxuICAgICAgYnVpbGRTcGVjOiBjb2RlYnVpbGQuQnVpbGRTcGVjLmZyb21PYmplY3RUb1lhbWwoeyAvLyBBbHRlcm5hdGl2ZWx5IGFkZCBhIGBhbXBsaWZ5LnltbGAgdG8gdGhlIHJlcG9cbiAgICAgICAgdmVyc2lvbjogJzEuMCcsXG4gICAgICAgIGZyb250ZW5kOiB7XG4gICAgICAgICAgcGhhc2VzOiB7XG4gICAgICAgICAgICBwcmVCdWlsZDoge1xuICAgICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAgICducG0gaW5zdGFsbCdcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJ1aWxkOiB7XG4gICAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICAgJ25wbSBydW4gYnVpbGQnXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGFydGlmYWN0czoge1xuICAgICAgICAgICAgYmFzZURpcmVjdG9yeTogJ2J1aWxkJyxcbiAgICAgICAgICAgIGZpbGVzOiBbXG4gICAgICAgICAgICAgICcqKi8qJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgICAgY2FjaGU6IHtcbiAgICAgICAgICAgIHBhdGhzOiBbXG4gICAgICAgICAgICAgICdub2RlX21vZHVsZXMvKiovKidcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgXCJSRUFDVF9BUFBfUkVTVF9BUElcIjogcmVzdEFwaS51cmwsXG4gICAgICAgIFwiUkVBQ1RfQVBQX0hUVFBfQVBJXCI6IGh0dHBBcGkuYXBpRW5kcG9pbnQsXG4gICAgICAgIFwiUkVBQ1RfQVBQX0FDQ0VTU19UT0tFTl9OQU1FXCI6IEFDQ0VTU19UT0tFTl9OQU1FLCBcbiAgICAgICAgXCJSRUFDVF9BUFBfTk9fVEFHU19TVFJJTkdcIjogTk9fVEFHU19TVFJJTkcsXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBlQ29tbWVyY2VBZG1pbkFtcGxpZnlBcHAuYWRkQ3VzdG9tUnVsZShmaXhSZWFjdFJvdXRlckRvbTQwM0Nsb3VkRnJvbnRJc3N1ZUN1c3RvbVJ1bGUpXG4gICAgY29uc3QgZUNvbW1lcmNlQWRtaW5CcmFuY2ggPSBlQ29tbWVyY2VBZG1pbkFtcGxpZnlBcHAuYWRkQnJhbmNoKFwibWFzdGVyXCIpO1xuXG4gICAgaWYgKENVU1RPTV9ET01BSU4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBlQ29tbWVyY2VBZG1pbkRvbWFpbiA9IG5ldyBhbXBsaWZ5LkRvbWFpbih0aGlzLCBcImUtY29tbWVyY2UtYWRtaW4tZG9tYWluXCIsIHtcbiAgICAgICAgICAgIGFwcDogZUNvbW1lcmNlQWRtaW5BbXBsaWZ5QXBwLFxuICAgICAgICAgICAgZG9tYWluTmFtZTogQ1VTVE9NX0RPTUFJTixcbiAgICAgICAgfSk7XG4gICAgICAgIGVDb21tZXJjZUFkbWluRG9tYWluLm1hcFN1YkRvbWFpbihlQ29tbWVyY2VBZG1pbkJyYW5jaCwgXCJhZG1pblwiKVxuICAgIH1cblxuICAgIC8vIPCfkYcgY3JlYXRlIGFuIE91dHB1dCBmb3IgdGhlIEFQSSBVUkxcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcImh0dHBBcGlVcmxcIiwgeyB2YWx1ZTogaHR0cEFwaS5hcGlFbmRwb2ludCB9KVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvYWNjb3VudCByZXNvdXJjZVxuICAgIGNvbnN0IGFjY291bnQgPSByZXN0QXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJhY2NvdW50XCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9hY2NvdW50IHJlc291cmNlXG4gICAgY29uc3QgYWNjb3VudHMgPSByZXN0QXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJhY2NvdW50c1wiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvbG9naW4gcmVzb3VyY2VcbiAgICBjb25zdCBsb2dpbiA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImxvZ2luXCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9wcm9kdWN0IHJlc291cmNlXG4gICAgY29uc3QgcHJvZHVjdCA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcInByb2R1Y3RcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL3Byb2R1Y3RzIHJlc291cmNlXG4gICAgY29uc3QgcHJvZHVjdHMgPSByZXN0QXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJwcm9kdWN0c1wiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvY3VzdG9tZXItcHJvZHVjdCByZXNvdXJjZVxuICAgIGNvbnN0IGN1c3RvbWVyUHJvZHVjdCA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImN1c3RvbWVyLXByb2R1Y3RcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL2N1c3RvbWVyLXByb2R1Y3RzIHJlc291cmNlXG4gICAgY29uc3QgY3VzdG9tZXJQcm9kdWN0cyA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImN1c3RvbWVyLXByb2R1Y3RzXCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC90YWdzIHJlc291cmNlXG4gICAgY29uc3QgdGFncyA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcInRhZ3NcIilcblxuICAgIC8vIPCfkYcgZGVmaW5lIFBVVCBhY2NvdW50IGZ1bmN0aW9uXG4gICAgY29uc3QgcHV0QWNjb3VudExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwdXQtYWNjb3VudC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9wdXQtYWNjb3VudC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQURNSU5TX1RBQkxFLFxuICAgICAgICBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSEFTSF9BTEcsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIFBVVCAvYWNjb3VudCB3aXRoIHB1dEFjY291bnRMYW1iZGFcbiAgICBhY2NvdW50LmFkZE1ldGhvZChcbiAgICAgIFwiUFVUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwdXRBY2NvdW50TGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHB1dCBwZXJtaXNzaW9ucyB0byB0aGUgYWRtaW5zIHRhYmxlXG4gICAgYWRtaW5zVGFibGUuZ3JhbnRXcml0ZURhdGEocHV0QWNjb3VudExhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIFBBVENIIGFjY291bnQgZnVuY3Rpb25cbiAgICBjb25zdCBwYXRjaEFjY291bnRMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicGF0Y2gtYWNjb3VudC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9wYXRjaC1hY2NvdW50L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICAgIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgICBIQVNIX0FMRyxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUEFUQ0ggL2FjY291bnQgd2l0aCBwYXRjaEFjY291bnRMYW1iZGFcbiAgICBhY2NvdW50LmFkZE1ldGhvZChcbiAgICAgIFwiUEFUQ0hcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBhdGNoQWNjb3VudExhbWJkYSksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgICAgYXV0aG9yaXplcjogYWRtaW5BdXRoLFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHB1dCBwZXJtaXNzaW9ucyB0byB0aGUgYWRtaW5zIHRhYmxlXG4gICAgYWRtaW5zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHBhdGNoQWNjb3VudExhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIEdFVCBhY2NvdW50IGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0QWNjb3VudExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtYWNjb3VudC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtYWNjb3VudC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQURNSU5TX1RBQkxFLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL2FjY291bnQgd2l0aCBnZXRBY2NvdW50TGFtYmRhXG4gICAgYWNjb3VudC5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0QWNjb3VudExhbWJkYSksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgICAgYXV0aG9yaXplcjogYWRtaW5BdXRoLFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIGdldCBwZXJtaXNzaW9ucyB0byB0aGUgYWRtaW5zIHRhYmxlXG4gICAgYWRtaW5zVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRBY2NvdW50TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUFVUIGFjY291bnQgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRBY2NvdW50c0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtYWNjb3VudHMtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LWFjY291bnRzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvYWNjb3VudHMgd2l0aCBnZXRBY2NvdW50c0xhbWJkYVxuICAgIGFjY291bnRzLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRBY2NvdW50c0xhbWJkYSlcbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFJlYWREYXRhKGdldEFjY291bnRzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUE9TVCBsb2dpbiBmdW5jdGlvblxuICAgIGNvbnN0IHBvc3RMb2dpbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwb3N0LWxvZ2luLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3Bvc3QtbG9naW4vZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRUNSRVQsXG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQURNSU5TX1RBQkxFLFxuICAgICAgICBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSEFTSF9BTEdcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUE9TVCAvbG9naW4gd2l0aCBwb3N0TG9naW5MYW1iZGFcbiAgICBsb2dpbi5hZGRNZXRob2QoXG4gICAgICBcIlBPU1RcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBvc3RMb2dpbkxhbWJkYSlcbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFJlYWREYXRhKHBvc3RMb2dpbkxhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIEdFVCBwcm9kdWN0cyBmdW5jdGlvblxuICAgIGNvbnN0IGdldFByb2R1Y3RzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1wcm9kdWN0cy1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LXByb2R1Y3RzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL3Byb2R1Y3RzIHdpdGggZ2V0UHJvZHVjdHNMYW1iZGFcbiAgICBwcm9kdWN0cy5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0UHJvZHVjdHNMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0cyB0YWJsZVxuICAgIHByb2R1Y3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRQcm9kdWN0c0xhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIEdFVCBjdXN0b21lciBwcm9kdWN0IGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0Q3VzdG9tZXJQcm9kdWN0TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1jdXN0b21lci1wcm9kdWN0LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2dldC1jdXN0b21lci1wcm9kdWN0L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgR0VUIC9jdXN0b21lci1wcm9kdWN0IHdpdGggZ2V0Q3VzdG9tZXJQcm9kdWN0TGFtYmRhXG4gICAgY3VzdG9tZXJQcm9kdWN0LmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRDdXN0b21lclByb2R1Y3RMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcmVhZCBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0Q3VzdG9tZXJQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIGN1c3RvbWVyIHByb2R1Y3RzIGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0Q3VzdG9tZXJQcm9kdWN0c0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtY3VzdG9tZXItcHJvZHVjdHMtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2dldC1jdXN0b21lci1wcm9kdWN0cy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgR0VUIC9jdXN0b21lci1wcm9kdWN0cyB3aXRoIGdldEN1c3RvbWVyUHJvZHVjdHNMYW1iZGFcbiAgICBjdXN0b21lclByb2R1Y3RzLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRDdXN0b21lclByb2R1Y3RzTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldEN1c3RvbWVyUHJvZHVjdHNMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQVVQgcHJvZHVjdCBmdW5jdGlvblxuICAgIGNvbnN0IHB1dFByb2R1Y3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicHV0LXByb2R1Y3QtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3B1dC1wcm9kdWN0L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSU1BR0VTX0JVQ0tFVCxcbiAgICAgICAgTk9fVEFHU19TVFJJTkcsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIFBVVCAvcHJvZHVjdCB3aXRoIHB1dFByb2R1Y3RMYW1iZGFcbiAgICBwcm9kdWN0LmFkZE1ldGhvZChcbiAgICAgIFwiUFVUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwdXRQcm9kdWN0TGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFdyaXRlRGF0YShwdXRQcm9kdWN0TGFtYmRhKVxuICAgIFxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHdyaXRlIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0IHRhZ3MgdGFibGVcbiAgICBwcm9kdWN0VGFnc1RhYmxlLmdyYW50V3JpdGVEYXRhKHB1dFByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBERUxFVEUgcHJvZHVjdCBmdW5jdGlvblxuICAgIGNvbnN0IGRlbGV0ZVByb2R1Y3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZGVsZXRlLXByb2R1Y3QtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2RlbGV0ZS1wcm9kdWN0L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSU1BR0VTX0JVQ0tFVCxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgREVMRVRFIC9wcm9kdWN0IHdpdGggZGVsZXRlUHJvZHVjdExhbWJkYVxuICAgIHByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJERUxFVEVcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGRlbGV0ZVByb2R1Y3RMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShkZWxldGVQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRXcml0ZURhdGEoZGVsZXRlUHJvZHVjdExhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIFBBVENIIHByb2R1Y3QgZnVuY3Rpb25cbiAgICBjb25zdCBwYXRjaFByb2R1Y3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicGF0Y2gtcHJvZHVjdC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcGF0Y2gtcHJvZHVjdC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVFNfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICAgIElNQUdFU19CVUNLRVQsXG4gICAgICAgIE5PX1RBR1NfU1RSSU5HLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBQQVRDSCAvcHJvZHVjdCB3aXRoIHBhdGNoUHJvZHVjdExhbWJkYVxuICAgIHByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJQQVRDSFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF0Y2hQcm9kdWN0TGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEocGF0Y2hQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRXcml0ZURhdGEocGF0Y2hQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUFVUIHRhZ3MgZnVuY3Rpb25cbiAgICBjb25zdCBwdXRUYWdzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcInB1dC10YWdzLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMDApLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9wdXQtdGFncy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRXcml0ZURhdGEocHV0VGFnc0xhbWJkYSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIFBVVCAvdGFncyB3aXRoIHB1dFRhZ3NMYW1iZGFcbiAgICB0YWdzLmFkZE1ldGhvZChcbiAgICAgIFwiUFVUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwdXRUYWdzTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZGVmaW5lIEdFVCB0YWdzIGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0VGFnc0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtdGFncy1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LXRhZ3MvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICAgIE5PX1RBR1NfU1RSSU5HLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL3RhZ3Mgd2l0aCBnZXRUYWdzTGFtYmRhXG4gICAgdGFncy5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0VGFnc0xhbWJkYSlcbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0IHRhZ3MgdGFibGVcbiAgICBwcm9kdWN0VGFnc1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0VGFnc0xhbWJkYSlcblxuICAgIC8vIPCfkYcgY3JlYXRlIGJ1Y2tldFxuICAgIGNvbnN0IHMzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcInMzLWJ1Y2tldFwiLCB7XG4gICAgICBidWNrZXROYW1lOiBJTUFHRVNfQlVDS0VULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuR0VULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBVVCxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXCIqXCJdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDM2NSksXG4gICAgICAgICAgdHJhbnNpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuSU5GUkVRVUVOVF9BQ0NFU1MsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KVxuXG4gICAgLy8g8J+RhyBncmFudCB3cml0ZSBhY2Nlc3MgdG8gYnVja2V0XG4gICAgczNCdWNrZXQuZ3JhbnRXcml0ZShwdXRQcm9kdWN0TGFtYmRhKVxuICAgIC8vIPCfkYcgZ3JhbnQgcmVhZCBhbmQgd3JpdGUgYWNjZXNzIHRvIGJ1Y2tldFxuICAgIHMzQnVja2V0LmdyYW50UmVhZFdyaXRlKGRlbGV0ZVByb2R1Y3RMYW1iZGEpXG4gICAgLy8g8J+RhyBncmFudCByZWFkIGFuZCB3cml0ZSBhY2Nlc3MgdG8gYnVja2V0XG4gICAgczNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocGF0Y2hQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgdGhlIGxhbWJkYSB0aGF0IHNlbmRzIHZlcmlmaWNhdGlvbiBlbWFpbHNcbiAgICBjb25zdCBzZW5kVmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ3NlbmQtdmVyaWZpY2F0aW9uLWVtYWlsLWxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMyksXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9zZW5kLXZlcmlmaWNhdGlvbi1lbWFpbC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFU19FTUFJTF9GUk9NLFxuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFQSV9FTkRQT0lOVDogaHR0cEFwaS5hcGlFbmRwb2ludCxcbiAgICAgICAgU0VDUkVULFxuICAgICAgICBBQ0NFU1NfVE9LRU5fTkFNRSxcbiAgICAgICAgRU1BSUxfVkVSSUZJQ0FUSU9OX0xJTktfRU5EUE9JTlQsXG4gICAgICAgIEVNQUlMX1NJR05BVFVSRSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBBZGQgcGVybWlzc2lvbnMgdG8gdGhlIExhbWJkYSBmdW5jdGlvbiB0byBzZW5kIHZlcmlmaWNhdGlvbiBlbWFpbHNcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzZXM6U2VuZEVtYWlsJyxcbiAgICAgICAgICAnc2VzOlNlbmRSYXdFbWFpbCcsXG4gICAgICAgICAgJ3NlczpTZW5kVGVtcGxhdGVkRW1haWwnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzZXM6JHtSRUdJT059OiR7XG4gICAgICAgICAgICBBQ0NPVU5UXG4gICAgICAgICAgfTppZGVudGl0eS8qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgIClcblxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uLmFkZEV2ZW50U291cmNlKFxuICAgICAgbmV3IER5bmFtb0V2ZW50U291cmNlKGFkbWluc1RhYmxlLCB7XG4gICAgICAgIHN0YXJ0aW5nUG9zaXRpb246IGxhbWJkYS5TdGFydGluZ1Bvc2l0aW9uLlRSSU1fSE9SSVpPTixcbiAgICAgICAgYmF0Y2hTaXplOiAxLFxuICAgICAgICBiaXNlY3RCYXRjaE9uRXJyb3I6IHRydWUsXG4gICAgICAgIHJldHJ5QXR0ZW1wdHM6IDEwLFxuICAgICAgfSksXG4gICAgKVxuXG4gICAgY29uc3Qgc2VuZFZlcmlmaWNhdGlvbkVtYWlsSW50ZWdyYXRpb24gPSBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdTZW5kVmVyaWZpY2F0aW9uRW1haWxJbnRlZ3JhdGlvbicsIHNlbmRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uKTtcblxuICAgIGh0dHBBcGkuYWRkUm91dGVzKHtcbiAgICAgIHBhdGg6IGAvc2VuZC12ZXJpZnktZW1haWxgLFxuICAgICAgbWV0aG9kczogWyBIdHRwTWV0aG9kLlBPU1QgXSxcbiAgICAgIGludGVncmF0aW9uOiBzZW5kVmVyaWZpY2F0aW9uRW1haWxJbnRlZ3JhdGlvbixcbiAgICAgIGF1dGhvcml6ZXI6IGVtYWlsQXV0aCxcbiAgICB9KTtcblxuICAgIC8vIPCfkYcgY3JlYXRlIHRoZSBsYW1iZGEgdGhhdCBhcHBseSBlbWFpbCB2ZXJpZmljYXRpb25cbiAgICBjb25zdCBnZXRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnZ2V0LXZlcmlmaWNhdGlvbi1lbWFpbCcsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtdmVyaWZpY2F0aW9uLWVtYWlsL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICAgIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICBhZG1pbnNUYWJsZS5ncmFudFdyaXRlRGF0YShnZXRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uKVxuXG4gICAgY29uc3QgZW1haWxWZXJpZmljYXRpb25JbnRlZ3JhdGlvbiA9IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0VtYWlsVmVyaWZpY2F0aW9uSW50ZWdyYXRpb24nLCBnZXRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uKTtcblxuICAgIGh0dHBBcGkuYWRkUm91dGVzKHtcbiAgICAgIHBhdGg6IGAvJHtFTUFJTF9WRVJJRklDQVRJT05fTElOS19FTkRQT0lOVH1gLFxuICAgICAgbWV0aG9kczogWyBIdHRwTWV0aG9kLkdFVCBdLFxuICAgICAgaW50ZWdyYXRpb246IGVtYWlsVmVyaWZpY2F0aW9uSW50ZWdyYXRpb24sXG4gICAgICBhdXRob3JpemVyOiBlbWFpbEF1dGgsXG4gICAgfSk7XG5cbiAgICAvLyDwn5GHIGNyZWF0ZSB0aGUgbGFtYmRhIHRoYXQgc2VuZHMgZm9yZ290IHBhc3N3b3JkIGVtYWlsc1xuICAgIGNvbnN0IHNlbmRGb3Jnb3RQYXNzd29yZEVtYWlsTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdzZW5kLWZvcmdvdC1wYXNzd29yZC1lbWFpbC1sYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMpLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvc2VuZC1mb3Jnb3QtcGFzc3dvcmQtZW1haWwvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRVNfRU1BSUxfRlJPTSxcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBTRUNSRVQsXG4gICAgICAgIEFDQ0VTU19UT0tFTl9OQU1FLFxuICAgICAgICBDSEFOR0VfRk9SR09UX1BBU1NXT1JEX0xJTkssXG4gICAgICAgIEVNQUlMX1NJR05BVFVSRSxcbiAgICAgICAgQURNSU5fQ1VTVE9NX0RPTUFJTjogQ1VTVE9NX0RPTUFJTiA/IGBodHRwczovL2FkbWluLiR7Q1VTVE9NX0RPTUFJTn1gIDogXCJsb2NhbGhvc3Q6MzAwMFwiLFxuICAgICAgICBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgIH1cbiAgICB9KVxuICAgIFxuICAgIC8vIPCfkYcgQWRkIHBlcm1pc3Npb25zIHRvIHRoZSBMYW1iZGEgZnVuY3Rpb24gdG8gc2VuZCBmb3Jnb3QgcGFzc3dvcmQgZW1haWxzXG4gICAgc2VuZEZvcmdvdFBhc3N3b3JkRW1haWxMYW1iZGFGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzZXM6U2VuZEVtYWlsJyxcbiAgICAgICAgICAnc2VzOlNlbmRSYXdFbWFpbCcsXG4gICAgICAgICAgJ3NlczpTZW5kVGVtcGxhdGVkRW1haWwnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzZXM6JHtSRUdJT059OiR7XG4gICAgICAgICAgICBBQ0NPVU5UXG4gICAgICAgICAgfTppZGVudGl0eS8qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgIClcblxuICAgIGNvbnN0IHNlbmRGb3Jnb3RQYXNzd29yZEVtYWlsSW50ZWdyYXRpb24gPSBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdTZW5kRm9yZ290UGFzc3dvcmRFbWFpbEludGVncmF0aW9uJywgc2VuZEZvcmdvdFBhc3N3b3JkRW1haWxMYW1iZGFGdW5jdGlvbik7XG5cbiAgICBodHRwQXBpLmFkZFJvdXRlcyh7XG4gICAgICBwYXRoOiBgL3NlbmQtZm9yZ290LXBhc3N3b3JkLWVtYWlsYCxcbiAgICAgIG1ldGhvZHM6IFsgSHR0cE1ldGhvZC5QT1NUIF0sXG4gICAgICBpbnRlZ3JhdGlvbjogc2VuZEZvcmdvdFBhc3N3b3JkRW1haWxJbnRlZ3JhdGlvbixcbiAgICB9KTtcblxuICAgIC8vIPCfkYcgY3JlYXRlIHRoZSB0cmFuc2Zvcm0gZXhwaXJlZCBsaWdodGluZyBkZWFscyBpbnRvIG5vcm1hbCBwcm9kdWN0c1xuICAgIGNvbnN0IHByb2Nlc3NFeHBpcmVkTGlnaHRpbmdEZWFsc0xhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAncHJvY2Vzcy1leHBpcmVkLWxpZ2h0bmluZy1kZWFscycsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9wcm9jZXNzLWV4cGlyZWQtbGlnaHRuaW5nLWRlYWxzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEocHJvY2Vzc0V4cGlyZWRMaWdodGluZ0RlYWxzTGFtYmRhRnVuY3Rpb24pXG5cbiAgICBjb25zdCBydWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdjcm9uLWV2ZXJ5LTUtbWludXRlcycsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUuZXhwcmVzc2lvbigncmF0ZSg1IG1pbnV0ZXMpJylcbiAgICB9KVxuXG4gICAgcnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24ocHJvY2Vzc0V4cGlyZWRMaWdodGluZ0RlYWxzTGFtYmRhRnVuY3Rpb24pKVxuICB9XG59XG4iXX0=