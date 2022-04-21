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
        const APP_CITY = (props === null || props === void 0 ? void 0 : props.appCity) || '';
        const APP_STATE = (props === null || props === void 0 ? void 0 : props.appState) || '';
        const HERO_HEADER_TEXT = (props === null || props === void 0 ? void 0 : props.heroHeaderText) || '';
        const ADVANTAGES = (props === null || props === void 0 ? void 0 : props.advantages) || '';
        const ABOUT_US_DESCRIPTION = (props === null || props === void 0 ? void 0 : props.aboutUsDescription) || '';
        // 👇 create Dynamodb table for products
        const productsTable = new dynamodb.Table(this, `${id}-products-table`, {
            tableName: constants_1.PRODUCTS_TABLE,
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 5,
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
                "REACT_APP_PRODUCT_ORDER": constants_1.PRODUCT_ORDER,
                "REACT_APP_PRODUCT_STOCK": constants_1.PRODUCT_STOCK,
                "REACT_APP_APP_CITY": APP_CITY,
                "REACT_APP_APP_STATE": APP_STATE,
                "REACT_APP_HERO_HEADER_TEXT": HERO_HEADER_TEXT,
                "REACT_APP_ADVANTAGES": ADVANTAGES,
                "REACT_APP_ABOUT_US_DESCRIPTION": ABOUT_US_DESCRIPTION,
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
                "REACT_APP_PRODUCTS_DUMP_FILE_NAME": constants_1.PRODUCTS_DUMP,
                "REACT_APP_ADMINS_BUCKET": ADMINS_BUCKET,
                "REACT_APP_PRODUCT_ORDER": constants_1.PRODUCT_ORDER,
                "REACT_APP_PRODUCT_STOCK": constants_1.PRODUCT_STOCK,
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
        // 👇 add a /dump-products resource
        const dumpProducts = restApi.root.addResource("dump-products");
        // 👇 add a /batch-products resource
        const batchProducts = restApi.root.addResource("batch-products");
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
                SECRET: _env_1.SECRET,
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
        // 👇 define PUT dump products function
        const putDumpProductsLambda = new lambda.Function(this, "put-dump-products-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/put-dump-products/dist")),
            environment: {
                REGION,
                ADMINS_BUCKET,
                PRODUCTS_DUMP: constants_1.PRODUCTS_DUMP,
            }
        });
        // 👇 integrate GET /dumpProducts with putDumpProductsLambda
        dumpProducts.addMethod("PUT", new apigateway.LambdaIntegration(putDumpProductsLambda), {
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            authorizer: adminAuth,
        });
        // 👇 define delete batch products products function
        const deleteBatchProductsLambda = new lambda.Function(this, "batch-delete-products-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/batch-delete-products/dist")),
            environment: {
                REGION,
                PRODUCTS_TABLE: constants_1.PRODUCTS_TABLE,
                PRODUCTS_TABLE_PARTITION_KEY: constants_1.PRODUCTS_TABLE_PARTITION_KEY,
            }
        });
        // 👇 integrate DELETE /batch-products with deleteBatchProductsLambda
        batchProducts.addMethod("DELETE", new apigateway.LambdaIntegration(deleteBatchProductsLambda), {
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            authorizer: adminAuth,
        });
        // 👇 grant the lambda role read and write permissions to the products table
        productsTable.grantReadWriteData(deleteBatchProductsLambda);
        // 👇 define put batch products products function
        const putBatchProductsLambda = new lambda.Function(this, "batch-put-products-lambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: "main.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "/../src/batch-put-products/dist")),
            environment: {
                REGION,
                PRODUCTS_TABLE: constants_1.PRODUCTS_TABLE,
            }
        });
        // 👇 integrate PUT /batch-products with putBatchProductsLambda
        batchProducts.addMethod("PUT", new apigateway.LambdaIntegration(putBatchProductsLambda), {
            authorizationType: apigateway.AuthorizationType.CUSTOM,
            authorizer: adminAuth,
        });
        // 👇 grant the lambda role write permissions to the products table
        productsTable.grantWriteData(putBatchProductsLambda);
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
        // 👇 grant write access to bucket
        adminsS3Bucket.grantWrite(putDumpProductsLambda);
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
        // 👇 create the transform expired lightning deals into normal products
        const processExpiredLightningDealsLambdaFunction = new lambda.Function(this, 'process-expired-lightning-deals', {
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
        productsTable.grantReadWriteData(processExpiredLightningDealsLambdaFunction);
        const rule = new events.Rule(this, 'cron-every-5-minutes', {
            schedule: events.Schedule.expression('rate(5 minutes)')
        });
        rule.addTarget(new targets.LambdaFunction(processExpiredLightningDealsLambdaFunction));
    }
}
exports.ECommerceStack = ECommerceStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZS1jb21tZXJjZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImUtY29tbWVyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsa0RBQWlEO0FBQ2pELHNEQUFxRDtBQUNyRCw4Q0FBNkM7QUFDN0Msd0NBQXVDO0FBQ3ZDLHNDQUFxQztBQUNyQyxxQ0FBb0M7QUFDcEMsOENBQTZDO0FBQzdDLHVEQUFzRDtBQUN0RCxnRUFBK0U7QUFDL0Usd0ZBQXFHO0FBQ3JHLDBGQUErRTtBQUMvRSxnRkFBc0U7QUFDdEUsNkJBQTRCO0FBQzVCLGtDQUVnQjtBQUNoQiw0Q0FrQnNCO0FBQ3RCLGdEQUFnRDtBQUNoRCxvREFBb0Q7QUFpQnBELE1BQWEsY0FBZSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzNDLFlBQVksS0FBYyxFQUFFLEVBQVUsRUFBRSxLQUF5Qjs7UUFDL0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFFdkIsdUVBQXVFO1FBQ3ZFLE1BQU0sT0FBTyxHQUFHLE1BQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLEdBQUcsMENBQUUsT0FBaUIsQ0FBQTtRQUM3QyxNQUFNLE1BQU0sR0FBRyxNQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxHQUFHLDBDQUFFLE1BQWdCLENBQUE7UUFDM0MsTUFBTSxjQUFjLEdBQUcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLFlBQXNCLENBQUE7UUFDcEQsTUFBTSxhQUFhLEdBQUcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLFlBQXNCLENBQUE7UUFDbkQsTUFBTSxhQUFhLEdBQUcsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLFlBQVksQ0FBQTtRQUN6QyxNQUFNLGFBQWEsR0FBRyxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUUsWUFBc0IsQ0FBQTtRQUNuRCxNQUFNLFVBQVUsR0FBRyxDQUFB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b20gXCJAYXdzLWNkay9hd3MtZHluYW1vZGJcIlxuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tIFwiQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXlcIlxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJAYXdzLWNkay9hd3MtbGFtYmRhXCJcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiQGF3cy1jZGsvYXdzLWlhbVwiXG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiQGF3cy1jZGsvYXdzLXMzXCJcbmltcG9ydCAqIGFzIGNkayBmcm9tIFwiQGF3cy1jZGsvY29yZVwiXG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSBcIkBhd3MtY2RrL2F3cy1ldmVudHNcIlxuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tIFwiQGF3cy1jZGsvYXdzLWV2ZW50cy10YXJnZXRzXCJcbmltcG9ydCB7IENvcnNIdHRwTWV0aG9kLCBIdHRwTWV0aG9kLCBIdHRwQXBpIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2MidcbmltcG9ydCB7IEh0dHBMYW1iZGFBdXRob3JpemVyLCBIdHRwTGFtYmRhUmVzcG9uc2VUeXBlIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXl2Mi1hdXRob3JpemVycyc7XG5pbXBvcnQgeyBIdHRwTGFtYmRhSW50ZWdyYXRpb24gfSBmcm9tICdAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucyc7XG5pbXBvcnQgeyBEeW5hbW9FdmVudFNvdXJjZSB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1sYW1iZGEtZXZlbnQtc291cmNlcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCJcbmltcG9ydCB7IFxuICBTRUNSRVQsIFxufSBmcm9tICcuLi8uZW52J1xuaW1wb3J0IHtcbiAgU1RBR0UsIFxuICBBRE1JTlNfVEFCTEUsXG4gIFBST0RVQ1RfVEFHU19UQUJMRSxcbiAgSEFTSF9BTEcsXG4gIFBST0RVQ1RTX1RBQkxFLFxuICBBQ0NFU1NfVE9LRU5fTkFNRSxcbiAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gIFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICBFTUFJTF9WRVJJRklDQVRJT05fTElOS19FTkRQT0lOVCxcbiAgQ0hBTkdFX0ZPUkdPVF9QQVNTV09SRF9MSU5LLFxuICBOT19UQUdTX1NUUklORyxcbiAgRU1BSUxfU0lHTkFUVVJFLFxuICBTQU1FX09SSUdJTkFMX1BST0ZJTEVfUEhPVE9fU1RSSU5HLFxuICBQUk9EVUNUU19EVU1QLFxuICBQUk9EVUNUX09SREVSLFxuICBQUk9EVUNUX1NUT0NLLFxufSBmcm9tIFwiLi4vY29uc3RhbnRzXCI7XG5pbXBvcnQgKiBhcyBhbXBsaWZ5IGZyb20gJ0Bhd3MtY2RrL2F3cy1hbXBsaWZ5JztcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdAYXdzLWNkay9hd3MtY29kZWJ1aWxkJztcblxuaW50ZXJmYWNlIEN1c3RvbWl6YWJsZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBzZXNFbWFpbEZyb206IHN0cmluZztcbiAgaW1hZ2VzQnVja2V0OiBzdHJpbmc7XG4gIGFkbWluc0J1Y2tldDogc3RyaW5nO1xuICBjdXN0b21Eb21haW4/OiBzdHJpbmc7XG4gIHBhZ2VUaXRsZT86IHN0cmluZztcbiAgcGFnZURlc2NyaXB0aW9uPzogc3RyaW5nO1xuICBhcHBOYW1lPzogc3RyaW5nO1xuICBhcHBDaXR5Pzogc3RyaW5nO1xuICBhcHBTdGF0ZT86IHN0cmluZztcbiAgaGVyb0hlYWRlclRleHQ/OiBzdHJpbmc7XG4gIGFkdmFudGFnZXM/OiBzdHJpbmc7XG4gIGFib3V0VXNEZXNjcmlwdGlvbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEVDb21tZXJjZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5BcHAsIGlkOiBzdHJpbmcsIHByb3BzPzogQ3VzdG9taXphYmxlU3RhY2spIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKVxuXG4gICAgLy8gdGhpcyBhcyBzdHJpbmcgY2F1c2VzIGFuIGVycm9yIGF0IGNvbXBpbGUgdGltZSBpZiBpdCBpcyBub3QgYSBzdHJpbmdcbiAgICBjb25zdCBBQ0NPVU5UID0gcHJvcHM/LmVudj8uYWNjb3VudCBhcyBzdHJpbmdcbiAgICBjb25zdCBSRUdJT04gPSBwcm9wcz8uZW52Py5yZWdpb24gYXMgc3RyaW5nXG4gICAgY29uc3QgU0VTX0VNQUlMX0ZST00gPSBwcm9wcz8uc2VzRW1haWxGcm9tIGFzIHN0cmluZ1xuICAgIGNvbnN0IElNQUdFU19CVUNLRVQgPSBwcm9wcz8uaW1hZ2VzQnVja2V0IGFzIHN0cmluZ1xuICAgIGNvbnN0IENVU1RPTV9ET01BSU4gPSBwcm9wcz8uY3VzdG9tRG9tYWluXG4gICAgY29uc3QgQURNSU5TX0JVQ0tFVCA9IHByb3BzPy5hZG1pbnNCdWNrZXQgYXMgc3RyaW5nXG4gICAgY29uc3QgUEFHRV9USVRMRSA9IHByb3BzPy5wYWdlVGl0bGUgfHwgJydcbiAgICBjb25zdCBQQUdFX0RFU0NSSVBUSU9OID0gcHJvcHM/LnBhZ2VEZXNjcmlwdGlvbiB8fCAnJ1xuICAgIGNvbnN0IEFQUF9OQU1FID0gcHJvcHM/LmFwcE5hbWUgfHwgJydcbiAgICBjb25zdCBBUFBfQ0lUWSA9IHByb3BzPy5hcHBDaXR5IHx8ICcnXG4gICAgY29uc3QgQVBQX1NUQVRFID0gcHJvcHM/LmFwcFN0YXRlIHx8ICcnXG4gICAgY29uc3QgSEVST19IRUFERVJfVEVYVCA9IHByb3BzPy5oZXJvSGVhZGVyVGV4dCB8fCAnJ1xuICAgIGNvbnN0IEFEVkFOVEFHRVMgPSBwcm9wcz8uYWR2YW50YWdlcyB8fCAnJ1xuICAgIGNvbnN0IEFCT1VUX1VTX0RFU0NSSVBUSU9OID0gcHJvcHM/LmFib3V0VXNEZXNjcmlwdGlvbiB8fCAnJ1xuXG4gICAgLy8g8J+RhyBjcmVhdGUgRHluYW1vZGIgdGFibGUgZm9yIHByb2R1Y3RzXG4gICAgY29uc3QgcHJvZHVjdHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBgJHtpZH0tcHJvZHVjdHMtdGFibGVgLCB7XG4gICAgICB0YWJsZU5hbWU6IFBST0RVQ1RTX1RBQkxFLFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBST1ZJU0lPTkVELFxuICAgICAgcmVhZENhcGFjaXR5OiA1LFxuICAgICAgd3JpdGVDYXBhY2l0eTogMSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgfSlcblxuICAgIGNvbnNvbGUubG9nKFwicHJvZHVjdHMgdGFibGUgbmFtZSDwn5GJXCIsIHByb2R1Y3RzVGFibGUudGFibGVOYW1lKVxuICAgIGNvbnNvbGUubG9nKFwicHJvZHVjdHMgdGFibGUgYXJuIPCfkYlcIiwgcHJvZHVjdHNUYWJsZS50YWJsZUFybilcbiAgIFxuICAgIC8vIPCfkYcgY3JlYXRlIER5bmFtb2RiIHRhYmxlIGZvciBhZG1pbnNcbiAgICBjb25zdCBhZG1pbnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBgJHtpZH0tYWRtaW5zLXRhYmxlYCwge1xuICAgICAgdGFibGVOYW1lOiBBRE1JTlNfVEFCTEUsXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUFJPVklTSU9ORUQsXG4gICAgICByZWFkQ2FwYWNpdHk6IDEsXG4gICAgICB3cml0ZUNhcGFjaXR5OiAxLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgICBzdHJlYW06IGR5bmFtb2RiLlN0cmVhbVZpZXdUeXBlLk5FV19JTUFHRSxcbiAgICB9KVxuXG4gICAgY29uc29sZS5sb2coXCJhZG1pbnMgdGFibGUgbmFtZSDwn5GJXCIsIGFkbWluc1RhYmxlLnRhYmxlTmFtZSlcbiAgICBjb25zb2xlLmxvZyhcImFkbWlucyB0YWJsZSBhcm4g8J+RiVwiLCBhZG1pbnNUYWJsZS50YWJsZUFybilcblxuICAgIC8vIPCfkYcgY3JlYXRlIER5bmFtb2RiIHRhYmxlIGZvciBwcm9kdWN0IGNhdGVnb3JpZXNcbiAgICBjb25zdCBwcm9kdWN0VGFnc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIGAke2lkfS1wcm9kdWN0LXRhZ3MtdGFibGVgLCB7XG4gICAgICB0YWJsZU5hbWU6IFBST0RVQ1RfVEFHU19UQUJMRSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QUk9WSVNJT05FRCxcbiAgICAgIHJlYWRDYXBhY2l0eTogMSxcbiAgICAgIHdyaXRlQ2FwYWNpdHk6IDEsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFBST0RVQ1RfVEFHU19UQUJMRV9QQVJUSVRJT05fS0VZLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcbiAgICB9KVxuXG4gICAgY29uc29sZS5sb2coXCJwcm9kdWN0IHRhZ3MgdGFibGUgbmFtZSDwn5GJXCIsIHByb2R1Y3RUYWdzVGFibGUudGFibGVOYW1lKVxuICAgIGNvbnNvbGUubG9nKFwicHJvZHVjdCB0YWdzIHRhYmxlIGFybiDwn5GJXCIsIHByb2R1Y3RUYWdzVGFibGUudGFibGVBcm4pXG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBSZXN0IEFwaSBHYXRld2F5XG4gICAgY29uc3QgcmVzdEFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgXCJhcGlcIiwge1xuICAgICAgZGVzY3JpcHRpb246IFwiZS1jb21tZXJjZSByZXN0IGFwaSBnYXRld2F5XCIsXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogU1RBR0UsXG4gICAgICB9LFxuICAgICAgLy8g8J+RhyBlbmFibGUgQ09SU1xuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93SGVhZGVyczogW1wiQ29udGVudC1UeXBlXCIsIFwiWC1BbXotRGF0ZVwiLCBcIkF1dGhvcml6YXRpb25cIiwgXCJYLUFwaS1LZXlcIiwgQUNDRVNTX1RPS0VOX05BTUVdLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFtcIk9QVElPTlNcIiwgXCJHRVRcIiwgXCJQT1NUXCIsIFwiUFVUXCIsIFwiUEFUQ0hcIiwgXCJERUxFVEVcIl0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IHRydWUsXG4gICAgICAgIGFsbG93T3JpZ2luczogWycqJ10sXG4gICAgICB9LFxuICAgICAgbWluaW11bUNvbXByZXNzaW9uU2l6ZTogMzUwMCwgLy8gMy41a2JcbiAgICB9KVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgYW4gT3V0cHV0IGZvciB0aGUgQVBJIFVSTFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwicmVzdEFwaVVybFwiLCB7IHZhbHVlOiByZXN0QXBpLnVybCB9KVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgYWRtaW5BdXRoIGxhbWJkYSBmdW5jdGlvblxuICAgIGNvbnN0IGFkbWluQXV0aExhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImFkbWluLWF1dGgtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvYWRtaW4tYXV0aC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFQ1JFVCxcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBQ0NPVU5ULFxuICAgICAgICBTVEFHRSxcbiAgICAgICAgQVBJX0lEOiByZXN0QXBpLnJlc3RBcGlJZCxcbiAgICAgICAgQUNDRVNTX1RPS0VOX05BTUUsXG4gICAgICB9XG4gICAgfSlcblxuICAgIGNvbnN0IGFkbWluQXV0aCA9IG5ldyBhcGlnYXRld2F5LlRva2VuQXV0aG9yaXplcih0aGlzLCBcImp3dC10b2tlbi1hZG1pbi1hdXRoXCIsIHtcbiAgICAgIGhhbmRsZXI6IGFkbWluQXV0aExhbWJkYUZ1bmN0aW9uLFxuICAgICAgaWRlbnRpdHlTb3VyY2U6IGBtZXRob2QucmVxdWVzdC5oZWFkZXIuJHtBQ0NFU1NfVE9LRU5fTkFNRX1gXG4gICAgfSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIGVtYWlsQXV0aCBsYW1iZGEgZnVuY3Rpb25cbiAgICBjb25zdCBlbWFpbEF1dGhMYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJlbWFpbC1hdXRoLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2VtYWlsLWF1dGgvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRUNSRVQsXG4gICAgICAgIEFDQ0VTU19UT0tFTl9OQU1FLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICBjb25zdCBlbWFpbEF1dGggPSBuZXcgSHR0cExhbWJkYUF1dGhvcml6ZXIoJ0VtYWlsVmVyaWZpY2F0aW9uQXV0aG9yaXplcicsIGVtYWlsQXV0aExhbWJkYUZ1bmN0aW9uLCB7XG4gICAgICByZXNwb25zZVR5cGVzOiBbSHR0cExhbWJkYVJlc3BvbnNlVHlwZS5TSU1QTEVdLFxuICAgICAgaWRlbnRpdHlTb3VyY2U6IFtgJHJlcXVlc3QucXVlcnlzdHJpbmcuJHtBQ0NFU1NfVE9LRU5fTkFNRX1gXSxcbiAgICB9KTtcblxuICAgIC8vIPCfkYcgY3JlYXRlIEhUVFAgQXBpIEdhdGV3YXlcbiAgICBjb25zdCBodHRwQXBpID0gbmV3IEh0dHBBcGkodGhpcywgXCJodHRwLWFwaVwiLCB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJlLWNvbW1lcmNlIGh0dHAgYXBpIGdhdGV3YXlcIixcbiAgICAgIGNvcnNQcmVmbGlnaHQ6IHtcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXG4gICAgICAgICAgJ1gtQW16LURhdGUnLFxuICAgICAgICAgICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAnWC1BcGktS2V5JyxcbiAgICAgICAgXSxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbXG4gICAgICAgICAgQ29yc0h0dHBNZXRob2QuT1BUSU9OUyxcbiAgICAgICAgICBDb3JzSHR0cE1ldGhvZC5HRVQsXG4gICAgICAgICAgQ29yc0h0dHBNZXRob2QuUE9TVCxcbiAgICAgICAgICBDb3JzSHR0cE1ldGhvZC5QVVQsXG4gICAgICAgICAgQ29yc0h0dHBNZXRob2QuUEFUQ0gsXG4gICAgICAgICAgQ29yc0h0dHBNZXRob2QuREVMRVRFLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiBmYWxzZSxcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBbJyonXSxcbiAgICAgIH0sXG4gICAgfSlcblxuICAgIGNvbnN0IGVDb21tZXJjZUFtcGxpZnlBcHAgPSBuZXcgYW1wbGlmeS5BcHAodGhpcywgJ2VDb21tZXJjZUFtcGxpZnlBcHAnLCB7XG4gICAgICBzb3VyY2VDb2RlUHJvdmlkZXI6IG5ldyBhbXBsaWZ5LkdpdEh1YlNvdXJjZUNvZGVQcm92aWRlcih7XG4gICAgICAgIG93bmVyOiAnZ3BzcGVsbGUnLFxuICAgICAgICByZXBvc2l0b3J5OiAnZS1jb21tZXJjZScsXG4gICAgICAgIG9hdXRoVG9rZW46IGNkay5TZWNyZXRWYWx1ZS5zZWNyZXRzTWFuYWdlcignZ2l0aHViLWFjY2Vzcy10b2tlbicpLFxuICAgICAgfSksXG4gICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbU9iamVjdFRvWWFtbCh7IC8vIEFsdGVybmF0aXZlbHkgYWRkIGEgYGFtcGxpZnkueW1sYCB0byB0aGUgcmVwb1xuICAgICAgICB2ZXJzaW9uOiAnMS4wJyxcbiAgICAgICAgZnJvbnRlbmQ6IHtcbiAgICAgICAgICBwaGFzZXM6IHtcbiAgICAgICAgICAgIHByZUJ1aWxkOiB7XG4gICAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICAgJ25wbSBpbnN0YWxsJ1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgICAnbnBtIHJ1biBidWlsZCdcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgYXJ0aWZhY3RzOiB7XG4gICAgICAgICAgICBiYXNlRGlyZWN0b3J5OiAnYnVpbGQnLFxuICAgICAgICAgICAgZmlsZXM6IFtcbiAgICAgICAgICAgICAgJyoqLyonXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgICBjYWNoZToge1xuICAgICAgICAgICAgcGF0aHM6IFtcbiAgICAgICAgICAgICAgJ25vZGVfbW9kdWxlcy8qKi8qJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczoge1xuICAgICAgICBcIlJFQUNUX0FQUF9SRVNUX0FQSVwiOiByZXN0QXBpLnVybCxcbiAgICAgICAgXCJSRUFDVF9BUFBfUEFHRV9USVRMRVwiOiBQQUdFX1RJVExFLFxuICAgICAgICBcIlJFQUNUX0FQUF9QQUdFX0RFU0NSSVBUSU9OXCI6IFBBR0VfREVTQ1JJUFRJT04sXG4gICAgICAgIFwiUkVBQ1RfQVBQX0FQUF9OQU1FXCI6IEFQUF9OQU1FLFxuICAgICAgICBcIlJFQUNUX0FQUF9QUk9EVUNUX09SREVSXCI6IFBST0RVQ1RfT1JERVIsXG4gICAgICAgIFwiUkVBQ1RfQVBQX1BST0RVQ1RfU1RPQ0tcIjogUFJPRFVDVF9TVE9DSyxcbiAgICAgICAgXCJSRUFDVF9BUFBfQVBQX0NJVFlcIjogQVBQX0NJVFksXG4gICAgICAgIFwiUkVBQ1RfQVBQX0FQUF9TVEFURVwiOiBBUFBfU1RBVEUsXG4gICAgICAgIFwiUkVBQ1RfQVBQX0hFUk9fSEVBREVSX1RFWFRcIjogSEVST19IRUFERVJfVEVYVCxcbiAgICAgICAgXCJSRUFDVF9BUFBfQURWQU5UQUdFU1wiOiBBRFZBTlRBR0VTLFxuICAgICAgICBcIlJFQUNUX0FQUF9BQk9VVF9VU19ERVNDUklQVElPTlwiOiBBQk9VVF9VU19ERVNDUklQVElPTixcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIGZpeGVzIGh0dHBzOi8vZ2l0aHViLmNvbS9hd3MtYW1wbGlmeS9hbXBsaWZ5LWNsaS9pc3N1ZXMvMzYwNlxuICAgIGNvbnN0IGZpeFJlYWN0Um91dGVyRG9tNDAzQ2xvdWRGcm9udElzc3VlQ3VzdG9tUnVsZSA9IG5ldyBhbXBsaWZ5LkN1c3RvbVJ1bGUoe1xuICAgICAgc291cmNlOiAnPC9eW14uXSskfFxcXFwuKD8hKGNzc3xnaWZ8aWNvfGpwZ3xqc3xwbmd8dHh0fHN2Z3x3b2ZmfHR0ZnxtYXB8anNvbikkKShbXi5dKyQpLz4nLFxuICAgICAgdGFyZ2V0OiAnL2luZGV4Lmh0bWwnLFxuICAgICAgc3RhdHVzOiBhbXBsaWZ5LlJlZGlyZWN0U3RhdHVzLlJFV1JJVEUsXG4gICAgfSlcblxuICAgIGVDb21tZXJjZUFtcGxpZnlBcHAuYWRkQ3VzdG9tUnVsZShmaXhSZWFjdFJvdXRlckRvbTQwM0Nsb3VkRnJvbnRJc3N1ZUN1c3RvbVJ1bGUpXG4gICAgY29uc3QgZUNvbW1lcmNlQnJhbmNoID0gZUNvbW1lcmNlQW1wbGlmeUFwcC5hZGRCcmFuY2goXCJtYXN0ZXJcIik7XG5cbiAgICBpZiAoQ1VTVE9NX0RPTUFJTiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IGVDb21tZXJjZURvbWFpbiA9IG5ldyBhbXBsaWZ5LkRvbWFpbih0aGlzLCBcImUtY29tbWVyY2UtZG9tYWluXCIsIHtcbiAgICAgICAgICAgIGFwcDogZUNvbW1lcmNlQW1wbGlmeUFwcCxcbiAgICAgICAgICAgIGRvbWFpbk5hbWU6IENVU1RPTV9ET01BSU4sXG4gICAgICAgICAgfSk7XG4gICAgICAgIGVDb21tZXJjZURvbWFpbi5tYXBSb290KGVDb21tZXJjZUJyYW5jaClcbiAgICB9XG5cbiAgICBjb25zdCBlQ29tbWVyY2VBZG1pbkFtcGxpZnlBcHAgPSBuZXcgYW1wbGlmeS5BcHAodGhpcywgJ2VDb21tZXJjZUFkbWluQW1wbGlmeUFwcCcsIHtcbiAgICAgIHNvdXJjZUNvZGVQcm92aWRlcjogbmV3IGFtcGxpZnkuR2l0SHViU291cmNlQ29kZVByb3ZpZGVyKHtcbiAgICAgICAgb3duZXI6ICdncHNwZWxsZScsXG4gICAgICAgIHJlcG9zaXRvcnk6ICdhZG1pbi1lLWNvbW1lcmNlJyxcbiAgICAgICAgb2F1dGhUb2tlbjogY2RrLlNlY3JldFZhbHVlLnNlY3JldHNNYW5hZ2VyKCdnaXRodWItYWNjZXNzLXRva2VuJyksXG4gICAgICB9KSxcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0VG9ZYW1sKHsgLy8gQWx0ZXJuYXRpdmVseSBhZGQgYSBgYW1wbGlmeS55bWxgIHRvIHRoZSByZXBvXG4gICAgICAgIHZlcnNpb246ICcxLjAnLFxuICAgICAgICBmcm9udGVuZDoge1xuICAgICAgICAgIHBoYXNlczoge1xuICAgICAgICAgICAgcHJlQnVpbGQ6IHtcbiAgICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgICAnbnBtIGluc3RhbGwnXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAgICducG0gcnVuIGJ1aWxkJ1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhcnRpZmFjdHM6IHtcbiAgICAgICAgICAgIGJhc2VEaXJlY3Rvcnk6ICdidWlsZCcsXG4gICAgICAgICAgICBmaWxlczogW1xuICAgICAgICAgICAgICAnKiovKidcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGNhY2hlOiB7XG4gICAgICAgICAgICBwYXRoczogW1xuICAgICAgICAgICAgICAnbm9kZV9tb2R1bGVzLyoqLyonXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiB7XG4gICAgICAgIFwiUkVBQ1RfQVBQX1JFU1RfQVBJXCI6IHJlc3RBcGkudXJsLFxuICAgICAgICBcIlJFQUNUX0FQUF9IVFRQX0FQSVwiOiBodHRwQXBpLmFwaUVuZHBvaW50LFxuICAgICAgICBcIlJFQUNUX0FQUF9BQ0NFU1NfVE9LRU5fTkFNRVwiOiBBQ0NFU1NfVE9LRU5fTkFNRSwgXG4gICAgICAgIFwiUkVBQ1RfQVBQX05PX1RBR1NfU1RSSU5HXCI6IE5PX1RBR1NfU1RSSU5HLFxuICAgICAgICBcIlJFQUNUX0FQUF9QUk9EVUNUU19EVU1QX0ZJTEVfTkFNRVwiOiBQUk9EVUNUU19EVU1QLFxuICAgICAgICBcIlJFQUNUX0FQUF9BRE1JTlNfQlVDS0VUXCI6IEFETUlOU19CVUNLRVQsXG4gICAgICAgIFwiUkVBQ1RfQVBQX1BST0RVQ1RfT1JERVJcIjogUFJPRFVDVF9PUkRFUixcbiAgICAgICAgXCJSRUFDVF9BUFBfUFJPRFVDVF9TVE9DS1wiOiBQUk9EVUNUX1NUT0NLLFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgZUNvbW1lcmNlQWRtaW5BbXBsaWZ5QXBwLmFkZEN1c3RvbVJ1bGUoZml4UmVhY3RSb3V0ZXJEb200MDNDbG91ZEZyb250SXNzdWVDdXN0b21SdWxlKVxuICAgIGNvbnN0IGVDb21tZXJjZUFkbWluQnJhbmNoID0gZUNvbW1lcmNlQWRtaW5BbXBsaWZ5QXBwLmFkZEJyYW5jaChcIm1hc3RlclwiKTtcblxuICAgIGlmIChDVVNUT01fRE9NQUlOICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgZUNvbW1lcmNlQWRtaW5Eb21haW4gPSBuZXcgYW1wbGlmeS5Eb21haW4odGhpcywgXCJlLWNvbW1lcmNlLWFkbWluLWRvbWFpblwiLCB7XG4gICAgICAgICAgICBhcHA6IGVDb21tZXJjZUFkbWluQW1wbGlmeUFwcCxcbiAgICAgICAgICAgIGRvbWFpbk5hbWU6IENVU1RPTV9ET01BSU4sXG4gICAgICAgIH0pO1xuICAgICAgICBlQ29tbWVyY2VBZG1pbkRvbWFpbi5tYXBTdWJEb21haW4oZUNvbW1lcmNlQWRtaW5CcmFuY2gsIFwiYWRtaW5cIilcbiAgICB9XG5cbiAgICAvLyDwn5GHIGNyZWF0ZSBhbiBPdXRwdXQgZm9yIHRoZSBBUEkgVVJMXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJodHRwQXBpVXJsXCIsIHsgdmFsdWU6IGh0dHBBcGkuYXBpRW5kcG9pbnQgfSlcblxuICAgIC8vIPCfkYcgYWRkIGEgL2FjY291bnQgcmVzb3VyY2VcbiAgICBjb25zdCBhY2NvdW50ID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwiYWNjb3VudFwiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvYWNjb3VudCByZXNvdXJjZVxuICAgIGNvbnN0IGFjY291bnRzID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwiYWNjb3VudHNcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL2xvZ2luIHJlc291cmNlXG4gICAgY29uc3QgbG9naW4gPSByZXN0QXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJsb2dpblwiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvcHJvZHVjdCByZXNvdXJjZVxuICAgIGNvbnN0IHByb2R1Y3QgPSByZXN0QXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJwcm9kdWN0XCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9wcm9kdWN0cyByZXNvdXJjZVxuICAgIGNvbnN0IHByb2R1Y3RzID0gcmVzdEFwaS5yb290LmFkZFJlc291cmNlKFwicHJvZHVjdHNcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL2N1c3RvbWVyLXByb2R1Y3QgcmVzb3VyY2VcbiAgICBjb25zdCBjdXN0b21lclByb2R1Y3QgPSByZXN0QXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJjdXN0b21lci1wcm9kdWN0XCIpXG5cbiAgICAvLyDwn5GHIGFkZCBhIC9jdXN0b21lci1wcm9kdWN0cyByZXNvdXJjZVxuICAgIGNvbnN0IGN1c3RvbWVyUHJvZHVjdHMgPSByZXN0QXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJjdXN0b21lci1wcm9kdWN0c1wiKVxuXG4gICAgLy8g8J+RhyBhZGQgYSAvdGFncyByZXNvdXJjZVxuICAgIGNvbnN0IHRhZ3MgPSByZXN0QXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJ0YWdzXCIpXG4gICAgXG4gICAgLy8g8J+RhyBhZGQgYSAvZHVtcC1wcm9kdWN0cyByZXNvdXJjZVxuICAgIGNvbnN0IGR1bXBQcm9kdWN0cyA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImR1bXAtcHJvZHVjdHNcIilcblxuICAgIC8vIPCfkYcgYWRkIGEgL2JhdGNoLXByb2R1Y3RzIHJlc291cmNlXG4gICAgY29uc3QgYmF0Y2hQcm9kdWN0cyA9IHJlc3RBcGkucm9vdC5hZGRSZXNvdXJjZShcImJhdGNoLXByb2R1Y3RzXCIpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQVVQgYWNjb3VudCBmdW5jdGlvblxuICAgIGNvbnN0IHB1dEFjY291bnRMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicHV0LWFjY291bnQtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcHV0LWFjY291bnQvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFETUlOU19UQUJMRSxcbiAgICAgICAgQURNSU5TX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICAgIEhBU0hfQUxHLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBQVVQgL2FjY291bnQgd2l0aCBwdXRBY2NvdW50TGFtYmRhXG4gICAgYWNjb3VudC5hZGRNZXRob2QoXG4gICAgICBcIlBVVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHV0QWNjb3VudExhbWJkYSlcbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSBwdXQgcGVybWlzc2lvbnMgdG8gdGhlIGFkbWlucyB0YWJsZVxuICAgIGFkbWluc1RhYmxlLmdyYW50V3JpdGVEYXRhKHB1dEFjY291bnRMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQQVRDSCBhY2NvdW50IGZ1bmN0aW9uXG4gICAgY29uc3QgcGF0Y2hBY2NvdW50TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcInBhdGNoLWFjY291bnQtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcGF0Y2gtYWNjb3VudC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQURNSU5TX1RBQkxFLFxuICAgICAgICBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSEFTSF9BTEcsXG4gICAgICAgIEFETUlOU19CVUNLRVQsXG4gICAgICAgIFNBTUVfT1JJR0lOQUxfUFJPRklMRV9QSE9UT19TVFJJTkcsXG4gICAgICAgIFNFQ1JFVCxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUEFUQ0ggL2FjY291bnQgd2l0aCBwYXRjaEFjY291bnRMYW1iZGFcbiAgICBhY2NvdW50LmFkZE1ldGhvZChcbiAgICAgIFwiUEFUQ0hcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBhdGNoQWNjb3VudExhbWJkYSksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgICAgYXV0aG9yaXplcjogYWRtaW5BdXRoLFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHB1dCBwZXJtaXNzaW9ucyB0byB0aGUgYWRtaW5zIHRhYmxlXG4gICAgYWRtaW5zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHBhdGNoQWNjb3VudExhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIEdFVCBhY2NvdW50IGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0QWNjb3VudExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtYWNjb3VudC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtYWNjb3VudC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQURNSU5TX1RBQkxFLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL2FjY291bnQgd2l0aCBnZXRBY2NvdW50TGFtYmRhXG4gICAgYWNjb3VudC5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0QWNjb3VudExhbWJkYSksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcbiAgICAgICAgYXV0aG9yaXplcjogYWRtaW5BdXRoLFxuICAgICAgfVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIGdldCBwZXJtaXNzaW9ucyB0byB0aGUgYWRtaW5zIHRhYmxlXG4gICAgYWRtaW5zVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRBY2NvdW50TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUFVUIGFjY291bnQgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRBY2NvdW50c0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtYWNjb3VudHMtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LWFjY291bnRzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvYWNjb3VudHMgd2l0aCBnZXRBY2NvdW50c0xhbWJkYVxuICAgIGFjY291bnRzLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRBY2NvdW50c0xhbWJkYSlcbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFJlYWREYXRhKGdldEFjY291bnRzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUE9TVCBsb2dpbiBmdW5jdGlvblxuICAgIGNvbnN0IHBvc3RMb2dpbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJwb3N0LWxvZ2luLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3Bvc3QtbG9naW4vZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRUNSRVQsXG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgQURNSU5TX1RBQkxFLFxuICAgICAgICBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSEFTSF9BTEdcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUE9TVCAvbG9naW4gd2l0aCBwb3N0TG9naW5MYW1iZGFcbiAgICBsb2dpbi5hZGRNZXRob2QoXG4gICAgICBcIlBPU1RcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBvc3RMb2dpbkxhbWJkYSlcbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIHBlcm1pc3Npb25zIHRvIHRoZSBhZG1pbnMgdGFibGVcbiAgICBhZG1pbnNUYWJsZS5ncmFudFJlYWREYXRhKHBvc3RMb2dpbkxhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIEdFVCBwcm9kdWN0cyBmdW5jdGlvblxuICAgIGNvbnN0IGdldFByb2R1Y3RzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1wcm9kdWN0cy1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvZ2V0LXByb2R1Y3RzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBHRVQgL3Byb2R1Y3RzIHdpdGggZ2V0UHJvZHVjdHNMYW1iZGFcbiAgICBwcm9kdWN0cy5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0UHJvZHVjdHNMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0cyB0YWJsZVxuICAgIHByb2R1Y3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRQcm9kdWN0c0xhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIEdFVCBjdXN0b21lciBwcm9kdWN0IGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0Q3VzdG9tZXJQcm9kdWN0TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1jdXN0b21lci1wcm9kdWN0LWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2dldC1jdXN0b21lci1wcm9kdWN0L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgR0VUIC9jdXN0b21lci1wcm9kdWN0IHdpdGggZ2V0Q3VzdG9tZXJQcm9kdWN0TGFtYmRhXG4gICAgY3VzdG9tZXJQcm9kdWN0LmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRDdXN0b21lclByb2R1Y3RMYW1iZGEpXG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgcmVhZCBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0Q3VzdG9tZXJQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIGN1c3RvbWVyIHByb2R1Y3RzIGZ1bmN0aW9uXG4gICAgY29uc3QgZ2V0Q3VzdG9tZXJQcm9kdWN0c0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtY3VzdG9tZXItcHJvZHVjdHMtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2dldC1jdXN0b21lci1wcm9kdWN0cy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgR0VUIC9jdXN0b21lci1wcm9kdWN0cyB3aXRoIGdldEN1c3RvbWVyUHJvZHVjdHNMYW1iZGFcbiAgICBjdXN0b21lclByb2R1Y3RzLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRDdXN0b21lclByb2R1Y3RzTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldEN1c3RvbWVyUHJvZHVjdHNMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBQVVQgcHJvZHVjdCBmdW5jdGlvblxuICAgIGNvbnN0IHB1dFByb2R1Y3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicHV0LXByb2R1Y3QtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3B1dC1wcm9kdWN0L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSU1BR0VTX0JVQ0tFVCxcbiAgICAgICAgTk9fVEFHU19TVFJJTkcsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIFBVVCAvcHJvZHVjdCB3aXRoIHB1dFByb2R1Y3RMYW1iZGFcbiAgICBwcm9kdWN0LmFkZE1ldGhvZChcbiAgICAgIFwiUFVUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwdXRQcm9kdWN0TGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFdyaXRlRGF0YShwdXRQcm9kdWN0TGFtYmRhKVxuICAgIFxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHdyaXRlIHBlcm1pc3Npb25zIHRvIHRoZSBwcm9kdWN0IHRhZ3MgdGFibGVcbiAgICBwcm9kdWN0VGFnc1RhYmxlLmdyYW50V3JpdGVEYXRhKHB1dFByb2R1Y3RMYW1iZGEpXG5cbiAgICAvLyDwn5GHIGRlZmluZSBERUxFVEUgcHJvZHVjdCBmdW5jdGlvblxuICAgIGNvbnN0IGRlbGV0ZVByb2R1Y3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZGVsZXRlLXByb2R1Y3QtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwMCksXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL2RlbGV0ZS1wcm9kdWN0L2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVFNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgSU1BR0VTX0JVQ0tFVCxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgREVMRVRFIC9wcm9kdWN0IHdpdGggZGVsZXRlUHJvZHVjdExhbWJkYVxuICAgIHByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJERUxFVEVcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGRlbGV0ZVByb2R1Y3RMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShkZWxldGVQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRXcml0ZURhdGEoZGVsZXRlUHJvZHVjdExhbWJkYSlcblxuICAgIC8vIPCfkYcgZGVmaW5lIFBBVENIIHByb2R1Y3QgZnVuY3Rpb25cbiAgICBjb25zdCBwYXRjaFByb2R1Y3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicGF0Y2gtcHJvZHVjdC1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcGF0Y2gtcHJvZHVjdC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVFNfVEFCTEUsXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICAgIFBST0RVQ1RfVEFHU19UQUJMRSxcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFX1BBUlRJVElPTl9LRVksXG4gICAgICAgIElNQUdFU19CVUNLRVQsXG4gICAgICAgIE5PX1RBR1NfU1RSSU5HLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBQQVRDSCAvcHJvZHVjdCB3aXRoIHBhdGNoUHJvZHVjdExhbWJkYVxuICAgIHByb2R1Y3QuYWRkTWV0aG9kKFxuICAgICAgXCJQQVRDSFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF0Y2hQcm9kdWN0TGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEocGF0Y2hQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRXcml0ZURhdGEocGF0Y2hQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgR0VUIHRhZ3MgZnVuY3Rpb25cbiAgICBjb25zdCBnZXRUYWdzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC10YWdzLWxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMDApLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtdGFncy9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFR0lPTixcbiAgICAgICAgUFJPRFVDVF9UQUdTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUX1RBR1NfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgICAgTk9fVEFHU19TVFJJTkcsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvdGFncyB3aXRoIGdldFRhZ3NMYW1iZGFcbiAgICB0YWdzLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihnZXRUYWdzTGFtYmRhKVxuICAgIClcblxuICAgIC8vIPCfkYcgZ3JhbnQgdGhlIGxhbWJkYSByb2xlIHJlYWQgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3QgdGFncyB0YWJsZVxuICAgIHByb2R1Y3RUYWdzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUYWdzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgUFVUIGR1bXAgcHJvZHVjdHMgZnVuY3Rpb25cbiAgICBjb25zdCBwdXREdW1wUHJvZHVjdHNMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwicHV0LWR1bXAtcHJvZHVjdHMtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvcHV0LWR1bXAtcHJvZHVjdHMvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFETUlOU19CVUNLRVQsXG4gICAgICAgIFBST0RVQ1RTX0RVTVAsXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIPCfkYcgaW50ZWdyYXRlIEdFVCAvZHVtcFByb2R1Y3RzIHdpdGggcHV0RHVtcFByb2R1Y3RzTGFtYmRhXG4gICAgZHVtcFByb2R1Y3RzLmFkZE1ldGhvZChcbiAgICAgIFwiUFVUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwdXREdW1wUHJvZHVjdHNMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGRlZmluZSBkZWxldGUgYmF0Y2ggcHJvZHVjdHMgcHJvZHVjdHMgZnVuY3Rpb25cbiAgICBjb25zdCBkZWxldGVCYXRjaFByb2R1Y3RzTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImJhdGNoLWRlbGV0ZS1wcm9kdWN0cy1sYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9iYXRjaC1kZWxldGUtcHJvZHVjdHMvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyDwn5GHIGludGVncmF0ZSBERUxFVEUgL2JhdGNoLXByb2R1Y3RzIHdpdGggZGVsZXRlQmF0Y2hQcm9kdWN0c0xhbWJkYVxuICAgIGJhdGNoUHJvZHVjdHMuYWRkTWV0aG9kKFxuICAgICAgXCJERUxFVEVcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGRlbGV0ZUJhdGNoUHJvZHVjdHNMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXG4gICAgICAgIGF1dGhvcml6ZXI6IGFkbWluQXV0aCxcbiAgICAgIH1cbiAgICApXG5cbiAgICAvLyDwn5GHIGdyYW50IHRoZSBsYW1iZGEgcm9sZSByZWFkIGFuZCB3cml0ZSBwZXJtaXNzaW9ucyB0byB0aGUgcHJvZHVjdHMgdGFibGVcbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShkZWxldGVCYXRjaFByb2R1Y3RzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBkZWZpbmUgcHV0IGJhdGNoIHByb2R1Y3RzIHByb2R1Y3RzIGZ1bmN0aW9uXG4gICAgY29uc3QgcHV0QmF0Y2hQcm9kdWN0c0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJiYXRjaC1wdXQtcHJvZHVjdHMtbGFtYmRhXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvYmF0Y2gtcHV0LXByb2R1Y3RzL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBQUk9EVUNUU19UQUJMRSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBpbnRlZ3JhdGUgUFVUIC9iYXRjaC1wcm9kdWN0cyB3aXRoIHB1dEJhdGNoUHJvZHVjdHNMYW1iZGFcbiAgICBiYXRjaFByb2R1Y3RzLmFkZE1ldGhvZChcbiAgICAgIFwiUFVUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwdXRCYXRjaFByb2R1Y3RzTGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxuICAgICAgICBhdXRob3JpemVyOiBhZG1pbkF1dGgsXG4gICAgICB9XG4gICAgKVxuXG4gICAgLy8g8J+RhyBncmFudCB0aGUgbGFtYmRhIHJvbGUgd3JpdGUgcGVybWlzc2lvbnMgdG8gdGhlIHByb2R1Y3RzIHRhYmxlXG4gICAgcHJvZHVjdHNUYWJsZS5ncmFudFdyaXRlRGF0YShwdXRCYXRjaFByb2R1Y3RzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgaW1hZ2VzIGJ1Y2tldFxuICAgIGNvbnN0IGltYWdlc1MzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcInMzLWJ1Y2tldFwiLCB7XG4gICAgICBidWNrZXROYW1lOiBJTUFHRVNfQlVDS0VULFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuR0VULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBVVCxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXCIqXCJdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDM2NSksXG4gICAgICAgICAgdHJhbnNpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuSU5GUkVRVUVOVF9BQ0NFU1MsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KVxuXG4gICAgLy8g8J+RhyBncmFudCB3cml0ZSBhY2Nlc3MgdG8gYnVja2V0XG4gICAgaW1hZ2VzUzNCdWNrZXQuZ3JhbnRXcml0ZShwdXRQcm9kdWN0TGFtYmRhKVxuICAgIC8vIPCfkYcgZ3JhbnQgcmVhZCBhbmQgd3JpdGUgYWNjZXNzIHRvIGJ1Y2tldFxuICAgIGltYWdlc1MzQnVja2V0LmdyYW50UmVhZFdyaXRlKGRlbGV0ZVByb2R1Y3RMYW1iZGEpXG4gICAgLy8g8J+RhyBncmFudCByZWFkIGFuZCB3cml0ZSBhY2Nlc3MgdG8gYnVja2V0XG4gICAgaW1hZ2VzUzNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocGF0Y2hQcm9kdWN0TGFtYmRhKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgYWRtaW5zIGJ1Y2tldFxuICAgIGNvbnN0IGFkbWluc1MzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcInMzLWFkbWlucy1idWNrZXRcIiwge1xuICAgICAgYnVja2V0TmFtZTogQURNSU5TX0JVQ0tFVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLkdFVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBPU1QsXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5QVVQsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogW1wiKlwiXSxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogW1wiKlwiXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzNjUpLFxuICAgICAgICAgIHRyYW5zaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLklORlJFUVVFTlRfQUNDRVNTLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSlcblxuICAgIC8vIPCfkYcgZ3JhbnQgcmVhZCBhbmQgd3JpdGUgYWNjZXNzIHRvIGJ1Y2tldFxuICAgIGFkbWluc1MzQnVja2V0LmdyYW50UmVhZFdyaXRlKHBhdGNoQWNjb3VudExhbWJkYSlcblxuICAgIC8vIPCfkYcgZ3JhbnQgd3JpdGUgYWNjZXNzIHRvIGJ1Y2tldFxuICAgIGFkbWluc1MzQnVja2V0LmdyYW50V3JpdGUocHV0RHVtcFByb2R1Y3RzTGFtYmRhKVxuXG4gICAgLy8g8J+RhyBjcmVhdGUgdGhlIGxhbWJkYSB0aGF0IHNlbmRzIHZlcmlmaWNhdGlvbiBlbWFpbHNcbiAgICBjb25zdCBzZW5kVmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ3NlbmQtdmVyaWZpY2F0aW9uLWVtYWlsLWxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgbWVtb3J5U2l6ZTogMTI4LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMyksXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9zZW5kLXZlcmlmaWNhdGlvbi1lbWFpbC9kaXN0XCIpKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFU19FTUFJTF9GUk9NLFxuICAgICAgICBSRUdJT04sXG4gICAgICAgIEFQSV9FTkRQT0lOVDogaHR0cEFwaS5hcGlFbmRwb2ludCxcbiAgICAgICAgU0VDUkVULFxuICAgICAgICBBQ0NFU1NfVE9LRU5fTkFNRSxcbiAgICAgICAgRU1BSUxfVkVSSUZJQ0FUSU9OX0xJTktfRU5EUE9JTlQsXG4gICAgICAgIEVNQUlMX1NJR05BVFVSRSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8g8J+RhyBBZGQgcGVybWlzc2lvbnMgdG8gdGhlIExhbWJkYSBmdW5jdGlvbiB0byBzZW5kIHZlcmlmaWNhdGlvbiBlbWFpbHNcbiAgICBzZW5kVmVyaWZpY2F0aW9uRW1haWxMYW1iZGFGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzZXM6U2VuZEVtYWlsJyxcbiAgICAgICAgICAnc2VzOlNlbmRSYXdFbWFpbCcsXG4gICAgICAgICAgJ3NlczpTZW5kVGVtcGxhdGVkRW1haWwnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzZXM6JHtSRUdJT059OiR7XG4gICAgICAgICAgICBBQ0NPVU5UXG4gICAgICAgICAgfTppZGVudGl0eS8qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgIClcblxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uLmFkZEV2ZW50U291cmNlKFxuICAgICAgbmV3IER5bmFtb0V2ZW50U291cmNlKGFkbWluc1RhYmxlLCB7XG4gICAgICAgIHN0YXJ0aW5nUG9zaXRpb246IGxhbWJkYS5TdGFydGluZ1Bvc2l0aW9uLlRSSU1fSE9SSVpPTixcbiAgICAgICAgYmF0Y2hTaXplOiAxLFxuICAgICAgICBiaXNlY3RCYXRjaE9uRXJyb3I6IHRydWUsXG4gICAgICAgIHJldHJ5QXR0ZW1wdHM6IDEwLFxuICAgICAgfSksXG4gICAgKVxuXG4gICAgY29uc3Qgc2VuZFZlcmlmaWNhdGlvbkVtYWlsSW50ZWdyYXRpb24gPSBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdTZW5kVmVyaWZpY2F0aW9uRW1haWxJbnRlZ3JhdGlvbicsIHNlbmRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uKTtcblxuICAgIGh0dHBBcGkuYWRkUm91dGVzKHtcbiAgICAgIHBhdGg6IGAvc2VuZC12ZXJpZnktZW1haWxgLFxuICAgICAgbWV0aG9kczogWyBIdHRwTWV0aG9kLlBPU1QgXSxcbiAgICAgIGludGVncmF0aW9uOiBzZW5kVmVyaWZpY2F0aW9uRW1haWxJbnRlZ3JhdGlvbixcbiAgICAgIGF1dGhvcml6ZXI6IGVtYWlsQXV0aCxcbiAgICB9KTtcblxuICAgIC8vIPCfkYcgY3JlYXRlIHRoZSBsYW1iZGEgdGhhdCBhcHBseSBlbWFpbCB2ZXJpZmljYXRpb25cbiAgICBjb25zdCBnZXRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnZ2V0LXZlcmlmaWNhdGlvbi1lbWFpbCcsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xNF9YLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICBoYW5kbGVyOiBcIm1haW4uaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uL3NyYy9nZXQtdmVyaWZpY2F0aW9uLWVtYWlsL2Rpc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBBRE1JTlNfVEFCTEUsXG4gICAgICAgIEFETUlOU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICBhZG1pbnNUYWJsZS5ncmFudFdyaXRlRGF0YShnZXRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uKVxuXG4gICAgY29uc3QgZW1haWxWZXJpZmljYXRpb25JbnRlZ3JhdGlvbiA9IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0VtYWlsVmVyaWZpY2F0aW9uSW50ZWdyYXRpb24nLCBnZXRWZXJpZmljYXRpb25FbWFpbExhbWJkYUZ1bmN0aW9uKTtcblxuICAgIGh0dHBBcGkuYWRkUm91dGVzKHtcbiAgICAgIHBhdGg6IGAvJHtFTUFJTF9WRVJJRklDQVRJT05fTElOS19FTkRQT0lOVH1gLFxuICAgICAgbWV0aG9kczogWyBIdHRwTWV0aG9kLkdFVCBdLFxuICAgICAgaW50ZWdyYXRpb246IGVtYWlsVmVyaWZpY2F0aW9uSW50ZWdyYXRpb24sXG4gICAgICBhdXRob3JpemVyOiBlbWFpbEF1dGgsXG4gICAgfSk7XG5cbiAgICAvLyDwn5GHIGNyZWF0ZSB0aGUgbGFtYmRhIHRoYXQgc2VuZHMgZm9yZ290IHBhc3N3b3JkIGVtYWlsc1xuICAgIGNvbnN0IHNlbmRGb3Jnb3RQYXNzd29yZEVtYWlsTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdzZW5kLWZvcmdvdC1wYXNzd29yZC1lbWFpbC1sYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIG1lbW9yeVNpemU6IDEyOCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMpLFxuICAgICAgaGFuZGxlcjogXCJtYWluLmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi8uLi9zcmMvc2VuZC1mb3Jnb3QtcGFzc3dvcmQtZW1haWwvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRVNfRU1BSUxfRlJPTSxcbiAgICAgICAgUkVHSU9OLFxuICAgICAgICBTRUNSRVQsXG4gICAgICAgIEFDQ0VTU19UT0tFTl9OQU1FLFxuICAgICAgICBDSEFOR0VfRk9SR09UX1BBU1NXT1JEX0xJTkssXG4gICAgICAgIEVNQUlMX1NJR05BVFVSRSxcbiAgICAgICAgQURNSU5fQ1VTVE9NX0RPTUFJTjogQ1VTVE9NX0RPTUFJTiA/IGBodHRwczovL2FkbWluLiR7Q1VTVE9NX0RPTUFJTn1gIDogXCJsb2NhbGhvc3Q6MzAwMFwiLFxuICAgICAgICBBRE1JTlNfVEFCTEVfUEFSVElUSU9OX0tFWSxcbiAgICAgIH1cbiAgICB9KVxuICAgIFxuICAgIC8vIPCfkYcgQWRkIHBlcm1pc3Npb25zIHRvIHRoZSBMYW1iZGEgZnVuY3Rpb24gdG8gc2VuZCBmb3Jnb3QgcGFzc3dvcmQgZW1haWxzXG4gICAgc2VuZEZvcmdvdFBhc3N3b3JkRW1haWxMYW1iZGFGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzZXM6U2VuZEVtYWlsJyxcbiAgICAgICAgICAnc2VzOlNlbmRSYXdFbWFpbCcsXG4gICAgICAgICAgJ3NlczpTZW5kVGVtcGxhdGVkRW1haWwnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzZXM6JHtSRUdJT059OiR7XG4gICAgICAgICAgICBBQ0NPVU5UXG4gICAgICAgICAgfTppZGVudGl0eS8qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgIClcblxuICAgIGNvbnN0IHNlbmRGb3Jnb3RQYXNzd29yZEVtYWlsSW50ZWdyYXRpb24gPSBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdTZW5kRm9yZ290UGFzc3dvcmRFbWFpbEludGVncmF0aW9uJywgc2VuZEZvcmdvdFBhc3N3b3JkRW1haWxMYW1iZGFGdW5jdGlvbik7XG5cbiAgICBodHRwQXBpLmFkZFJvdXRlcyh7XG4gICAgICBwYXRoOiBgL3NlbmQtZm9yZ290LXBhc3N3b3JkLWVtYWlsYCxcbiAgICAgIG1ldGhvZHM6IFsgSHR0cE1ldGhvZC5QT1NUIF0sXG4gICAgICBpbnRlZ3JhdGlvbjogc2VuZEZvcmdvdFBhc3N3b3JkRW1haWxJbnRlZ3JhdGlvbixcbiAgICB9KTtcblxuICAgIC8vIPCfkYcgY3JlYXRlIHRoZSB0cmFuc2Zvcm0gZXhwaXJlZCBsaWdodG5pbmcgZGVhbHMgaW50byBub3JtYWwgcHJvZHVjdHNcbiAgICBjb25zdCBwcm9jZXNzRXhwaXJlZExpZ2h0bmluZ0RlYWxzTGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdwcm9jZXNzLWV4cGlyZWQtbGlnaHRuaW5nLWRlYWxzJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgIGhhbmRsZXI6IFwibWFpbi5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vc3JjL3Byb2Nlc3MtZXhwaXJlZC1saWdodG5pbmctZGVhbHMvZGlzdFwiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUdJT04sXG4gICAgICAgIFBST0RVQ1RTX1RBQkxFLFxuICAgICAgICBQUk9EVUNUU19UQUJMRV9QQVJUSVRJT05fS0VZLFxuICAgICAgfVxuICAgIH0pXG5cbiAgICBwcm9kdWN0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShwcm9jZXNzRXhwaXJlZExpZ2h0bmluZ0RlYWxzTGFtYmRhRnVuY3Rpb24pXG5cbiAgICBjb25zdCBydWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdjcm9uLWV2ZXJ5LTUtbWludXRlcycsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUuZXhwcmVzc2lvbigncmF0ZSg1IG1pbnV0ZXMpJylcbiAgICB9KVxuXG4gICAgcnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24ocHJvY2Vzc0V4cGlyZWRMaWdodG5pbmdEZWFsc0xhbWJkYUZ1bmN0aW9uKSlcbiAgfVxufVxuIl19