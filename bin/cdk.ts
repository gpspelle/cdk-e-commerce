#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { ECommerceStack } from '../lib/cdk-e-commerce-stack';

const beta = { env: { account: '774004686218', region: 'us-east-1' }, sesEmailFrom: "araras.lojinha@gmail.com", imagesBucket: "beta-e-commerce-images-bucket" };
const prod = { env: { account: '453299922179', region: 'us-east-1' }, sesEmailFrom: "gpsunicamp016@gmail.com", imagesBucket: "e-commerce-images-bucket" };

const app = new cdk.App();

new ECommerceStack(app, 'ECommerceStackBeta', beta);
new ECommerceStack(app, 'ECommerceStack', prod);