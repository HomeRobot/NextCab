
const mysql = require('mysql2')
const config = require('./config')
const RBAC = require('./roles')

const db = mysql.createPool({
    user: config.DB_USERNAME,
    database: config.DB_DATABASE,
    host: config.DB_HOST,
    password: config.DB_PASSWORD
})
const dbp = db.promise()

async function getUserRole(userId) {
    const [results] = await dbp.query('SELECT role FROM users WHERE id = ?', [userId])
    return results[0].role
}

async function getUserPermissions(userId) {
    const role = await getUserRole(userId)
    return RBAC.roles[role]
}

async function canUserAction(userId, action, resource) {
    const permissions = await getUserPermissions(userId)
    for(let act of permissions){
        if(act.includes(action) && act.resource == resource){
            return true        
        }
    }
    return false
}

async function getUserList(){
    const users = await dbp.query('SELECT id, username, role, firstName, lastName, email, telegram, ip, lastVisit, registrationDate FROM users', [])
    if (users.length === 0) {
        return []
    } else {
        return users[0]
    }
}

async function getUser(userId){
    const [user] = await dbp.query('SELECT id, username, role, firstName, lastName, email, telegram, ip, lastVisit, registrationDate FROM users where id = ?', [userId])
    return user
}

module.exports = {
    getUserRole,
    getUserPermissions,
    canUserAction,
    getUserList,
    getUser
}