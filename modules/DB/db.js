const mysql = require('mysql2')
const Database = require('../../libraries/DBdata')
const config = require('../../config')

// Database connection
const db = mysql.createPool({
    user: config.DB_USERNAME,
    database: config.DB_DATABASE,
    host: config.DB_HOST,
    password: config.DB_PASSWORD
})

const dbp = db.promise()
const DBase = new Database(dbp);
const DBPrefix = config.DB_PREFIX;



module.exports = {
    db,
    DBase,
    DBPrefix
}