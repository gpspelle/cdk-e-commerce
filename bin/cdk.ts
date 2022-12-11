#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { ECommerceStack } from '../lib/e-commerce';

const beta = { 
    env: { account: '774004686218', region: 'us-east-1' },
    sesEmailFrom: "araras.lojinha@gmail.com",
    imagesBucket: "beta-e-commerce-images-bucket",
    adminsBucket: "us-east-1-beta-e-commerce-admins-bucket",
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
    appCity: "Araras",
    appState: "São Paulo",
    heroHeaderText: "Loja das Artes, trazendo o melhor do artesanato mais perto de você",
    advantages: '{"advantage_0":{"title":"Feito para você","text":"Comercializamos apenas produtos artesanais, pensados e sob medida para você"},"advantage_1":{"title":"Qualidade sem igual","text":"Nossos produtos são feitos somente com materiais de primeira linha"},"advantage_2":{"title":"Toque de carinho","text":"Comprar produtos artesanais cria uma relação mais próxima com quem desenvolve seus produtos"}}',
    aboutUsDescription: '{"description_0":"A Loja das Artes surgiu como uma ideia para reunir artesãos de Araras e ajudá-los a oferecer seus produtos e serviços por meio de uma plataforma unificada","description_1":"Todos os produtos são feitos carinhosamente e são vendidos à pronta entrega ou sob encomenda"}',
    amazonPayReturnURL: "https://alojinha.click"

};

const app = new cdk.App();

new ECommerceStack(app, 'ECommerceStackBeta', beta);
new ECommerceStack(app, 'EcommerceStackProdSAEast', SAEastProd);