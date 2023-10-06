
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
    return true
    const permissions = await getUserPermissions(userId)
    for(let act of permissions){
        if(act.includes(action) && act.resource == resource){
            return true
        }
    }
    return false
}

async function getUserList(){
    const users = await dbp.query('SELECT id, username, role, firstName, lastName, email, telegram, ip, lastVisit, registrationDate, officeId, state FROM users', [])
    if (users.length === 0) {
        return []
    } else {
        return users[0]
    }
}

async function getOfficesList(){
    const offices = await dbp.query('SELECT id, title, address, phone, url, state FROM office', [])
    if (offices.length === 0) {
        return []
    } else {
        return offices[0]
    }
}

async function getUser(userId){
    const [user] = await dbp.query('SELECT id, username, role, firstName, lastName, email, telegram, ip, lastVisit, registrationDate, officeId, state FROM users where id = ?', [userId])
    if(user.length === 0){
        return false
    }
    return user[0]
}

async function updateUser(userId, data){
    const [user] = await dbp.query('UPDATE users SET ? WHERE id = ?', [data, userId])
    return user
}

async function getOfficeList(){
    const rows = await dbp.query('SELECT * FROM office', [])
    if (rows.length === 0) {
        return []
    } else {
        return rows[0]
    }
}

async function getOffice(officeId){
    const [office] = await dbp.query('SELECT * FROM office where id in (?)', [officeId])
    // console.log(office)
    if(office.length === 0){
        return false
    }
    if(office.length === 1){
        return office[0]
    }
    return office
}

async function updateOffice(userId, data){
    const [office] = await dbp.query('UPDATE office SET ? WHERE id = ?', [data, userId])
    return office
}

async function addUserOffice(userId, officeId, role){
    const res = await dbp.query('INSERT INTO user_office (user_id, officeId, role) VALUES (?, ?, ?)', [userId, officeId, role])
    return res.insertId
}

async function getExchangeList(){
    const rows = await dbp.query('SELECT * FROM exchange', [])
    if (rows.length === 0) {
        return []
    } else {
        return rows[0]
    }
}

async function getExchange(exchangeId){
    const [row] = await dbp.query('SELECT * FROM exchange where id = ?', [exchangeId])
    return row
}

async function addExchange(title){
    const res = await dbp.query('INSERT INTO exchange (title) VALUES (?)', [title])
    return res.insertId
}

async function editExchange(id, title = '', state = ''){
    if(title == '' && state == ''){
        return false
    }
    if(title == ''){
        await dbp.query('UPDATE exchange SET state = ? WHERE id = ?', [state, id])
        return true
    }
    if(state == ''){
        await dbp.query('UPDATE exchange SET title = ? WHERE id = ?', [title, id])
        return true
    }
    await dbp.query('UPDATE exchange SET title = ?, state = ? WHERE id = ?', [title, state, id])
    return true
}

async function getBotList(officeId = ''){
    if(officeId != ''){
        const rows = await dbp.query('SELECT * FROM bot where officeId = ?', [officeId])
        if (rows.length === 0) {
            return []
        } else {
            return rows[0]
        }
    }
    const rows = await dbp.query('SELECT * FROM bot', [])
    if (rows.length === 0) {
        return []
    } else {
        return rows[0]
    }
}

async function getBot(botId){
    const [row] = await dbp.query('SELECT * FROM bot where id = ?', [botId])
    row.secretKey = ''
    return row
}

async function addBot(botData){
    const res = await dbp.query('INSERT INTO bot SET ?', botData)
    return res.insertId
}

async function stopBot(botId){
    await dbp.query('UPDATE bot SET status = 0 WHERE id = ?', [botId])
}

async function startBot(botId){
    await dbp.query('UPDATE bot SET status = 1, pause_until = null WHERE id = ?', [botId])
}

async function pauseBot(botId, pauseUntil = null){
    await dbp.query('UPDATE bot SET status = 2, pause_until = ? WHERE id = ?', [botId, pauseUntil])
}

async function getStatesList(){
    const states = await dbp.query('SELECT * FROM states', [])
    if (states.length === 0) {
        return []
    } else {
        return states[0]
    }
}

async function getRolesList(){
    const states = await dbp.query('SELECT * FROM roles', [])
    if (states.length === 0) {
        return []
    } else {
        return states[0]
    }
}

module.exports = {
    getStatesList,
    getRolesList,
    getUserRole,
    getUserPermissions,
    canUserAction,
    getUserList,
    getOfficesList,
    getUser,
    updateUser,
    getOfficeList,
    getOffice,
    updateOffice,
    addUserOffice,
    getExchangeList,
    getExchange,
    addExchange,
    editExchange,
    getBotList,
    getBot,
    addBot,
    stopBot,
    startBot,
    pauseBot
}