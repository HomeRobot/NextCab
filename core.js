
const mysql = require('mysql')
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
    const userId = req.userId;
    const [results] = await dbp.query('SELECT role FROM users WHERE id = ?', [userId])
    return results[0].role
}

async function getUserPermissions(userId) {
    const role = await getUserRole(userId)
    return RBAC.roles[role]
}

async function canUserAction(userId, action, resource) {
    const permissions = await getUserPermissions(userId)
    for (const role of Object.values(permissions)) {
        const resourcePermissions = role.find(permission => permission.resource === resource);
        if (resourcePermissions && resourcePermissions.action.includes(action)) {
            return true;
        }
    }
}

module.exports = {
    getUserRole,
    getUserPermissions,
    canUserAction
}