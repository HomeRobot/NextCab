'use strict';

const testDB = {
    DB_DATABASE: "citonex_cnnct",
    DB_USERNAME: "citonex_master",
    DB_PASSWORD: "GzkWKR5VsykdamOM",
    DB_PREFIX: "eielu_",
}

const productionDB = {
    DB_DATABASE: "citonex_algo",
    DB_USERNAME: "citonex_algo",
    DB_PASSWORD: "ChoyK6oZfbUPmkr4",
    DB_PREFIX: "eielu_",
}

const currentDB = productionDB



module.exports = {
    DB_HOST: "185.195.69.110",
    DB_DATABASE: currentDB.DB_DATABASE,
    DB_USERNAME: currentDB.DB_USERNAME,
    DB_PASSWORD: currentDB.DB_PASSWORD,
    DB_PREFIX: currentDB.DB_PREFIX,
    secretKey: 'your_secret_key',
    ALLOWED_ORIGINS: ['https://localhost:5173', 'https://192.168.1.11:5173'],
    REDIS_HOST_01: '185.195.69.110',
    REDIS_PORT_01: 6379,
    REDIS_PASS_01: 'cS2PSNU3flzf42rsg',
    SSL_KEY_PATH: '../private.key',
    SSL_CERT_PATH: '../certificate.crt'
}