#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { ECommerceStack } from '../lib/e-commerce';

const beta = { 
    env: { account: '774004686218', region: 'us-east-1' },
    sesEmailFrom: "araras.lojinha@gmail.com",
    imagesBucket: "beta-e-commerce-images-bucket",
    adminsBucket: "us-east-1-beta-e-commerce-admins-bucket"
};

const USEastProd = { 
    env: { account: '453299922179', region: 'us-east-1' }, 
    sesEmailFrom: "gpsunicamp016@gmail.com", 
    imagesBucket: "e-commerce-images-bucket",
    adminsBucket: "us-east-1-prod-e-commerce-admins-bucket"
};

const SAEastProd = { 
    env: { account: '453299922179', region: 'sa-east-1' }, 
    sesEmailFrom: "gpsunicamp016@gmail.com", 
    imagesBucket: "sa-e-commerce-images-bucket",
    adminsBucket: "sa-east-1-prod-e-commerce-images-bucket",
    customDomain: "alojinha.click",
    pageTitle: "Loja das Artes",
    pageDescription: "A loja virtual de Araras",
    appName: "Loja das Artes",
};

const app = new cdk.App();

new ECommerceStack(app, 'ECommerceStackBeta', beta);
new ECommerceStack(app, 'ECommerceStack', USEastProd);
new ECommerceStack(app, 'EcommerceStackProdSAEast', SAEastProd);