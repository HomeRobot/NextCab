
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
    for (let act of permissions) {
        if (act.includes(action) && act.resource == resource) {
            return true
        }
    }
    return false
}

async function getUserList(query) {
    const { filter, range, sort } = query;
    let queryString = 'SELECT id, username, role, firstName, lastName, email, telegram, ip, lastVisit, registrationDate, officeId, state FROM users',
        queryParams = [],
        filterObject = JSON.parse(filter),
        rangeArr = JSON.parse(range),
        sortArr = JSON.parse(sort);

    console.log('range', range)
    console.log('range typeof', typeof range)
    console.log('sort typeof', typeof sort)

    if (Object.keys(filterObject).length > 0) {
        const whereClauses = [];

        for (const key in filterObject) {
            const filterValue = filterObject[key];

            if (Array.isArray(filterValue)) {
                const placeholders = Array.from({ length: filterValue.length }, () => '?');
                whereClauses.push(`${key} IN (${placeholders.join(', ')})`);
                queryParams.push(...filterValue);
            } else {
                whereClauses.push(`${key} = ?`);
                queryParams.push(filterValue);
            }
        }

        queryString += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (sortArr && sortArr.length === 2) {
        const [column, order] = sortArr;

        console.log('column', column)
        console.log('order', order)
        queryString += ` ORDER BY ${column} ${order}`;
    }

    if (rangeArr && rangeArr.length === 2) {
        const [offset, limit] = rangeArr;

        console.log('offset', offset)
        console.log('limit', limit)
        queryString += ` LIMIT ${limit} OFFSET ${offset}`;
        queryParams.push(limit, offset);
    }


    console.log('queryString', queryString)
    const users = await dbp.query(queryString, queryParams);

    if (users.length === 0) {
        return [];
    } else {
        return users[0];
    }
}

async function getOfficesList(query) {
    const { filter, range, sort } = query;
    let queryString = 'SELECT id, title, address, phone, url, state FROM office',
        queryParams = [];
    const filterObject = JSON.parse(filter);

    if (Object.keys(filterObject).length > 0) {
        const whereClauses = [];

        for (const key in filterObject) {
            const filterValue = filterObject[key];

            if (Array.isArray(filterValue)) {
                const placeholders = Array.from({ length: filterValue.length }, () => '?');
                whereClauses.push(`${key} IN (${placeholders.join(', ')})`);
                queryParams.push(...filterValue);
            } else {
                whereClauses.push(`${key} = ?`);
                queryParams.push(filterValue);
            }
        }

        queryString += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const offices = await dbp.query(queryString, queryParams);

    if (offices.length === 0) {
        return []
    } else {
        return offices[0]
    }
}

async function getUser(userId) {
    const [user] = await dbp.query('SELECT id, username, role, firstName, lastName, email, telegram, ip, lastVisit, registrationDate, officeId, state FROM users WHERE id in (?)', [userId])

    console.log('Это получили из БД', user)

    if (user.length === 0) {
        return false
    }
    if (user.length === 1) {
        return user[0]
    }
    return user
}

async function updateUser(userId, data) {
    const [user] = await dbp.query('UPDATE users SET ? WHERE id = ?', [data, userId])
    return user
}

async function getOfficeList() {
    const rows = await dbp.query('SELECT * FROM office', [])
    if (rows.length === 0) {
        return []
    } else {
        return rows[0]
    }
}

async function getOffice(officeId) {
    const [office] = await dbp.query('SELECT * FROM office WHERE id in (?)', [officeId])
    console.log('Это результат getOffice получили из БД', office)
    if (office.length === 0) {
        return false
    }
    /* if (office.length === 1) {
        return office[0]
    } */
    return office
}

async function updateOffice(id, data) {
    const [office] = await dbp.query('UPDATE office SET ? WHERE id = ?', [data, id])
    return office
}

async function addUserOffice(userId, officeId, role) {
    const res = await dbp.query('INSERT INTO user_office (user_id, officeId, role) VALUES (?, ?, ?)', [userId, officeId, role])
    return res.insertId
}

async function getExchangeList() {
    const rows = await dbp.query('SELECT * FROM exchange', [])
    if (rows.length === 0) {
        return []
    } else {
        return rows[0]
    }
}

async function getExchange(exchangeId) {
    const [row] = await dbp.query('SELECT * FROM exchange where id in (?)', [exchangeId])
    console.log(exchangeId)
    if (row.length === 0) {
        return false
    }
    if (row.length === 1) {
        return row[0]
    }
    return row
}

async function addExchange(title) {
    const res = await dbp.query('INSERT INTO exchange (title) VALUES (?)', [title])
    return res.insertId
}

async function updateExchange(id, data) {
    const [office] = await dbp.query('UPDATE exchange SET ? WHERE id = ?', [data, id])
    return office
}

async function editExchange(id, title = '', state = '') {
    if (title == '' && state == '') {
        return false
    }
    if (title == '') {
        await dbp.query('UPDATE exchange SET state = ? WHERE id = ?', [state, id])
        return true
    }
    if (state == '') {
        await dbp.query('UPDATE exchange SET title = ? WHERE id = ?', [title, id])
        return true
    }
    await dbp.query('UPDATE exchange SET title = ?, state = ? WHERE id = ?', [title, state, id])
    return true
}

async function getBotList(officeId = '') {
    if (officeId != '') {
        const rows = await dbp.query('SELECT * FROM bots where officeId = ?', [officeId])
        if (rows.length === 0) {
            return []
        } else {
            return rows[0]
        }
    }
    const rows = await dbp.query('SELECT * FROM bots', [])
    if (rows.length === 0) {
        return []
    } else {
        return rows[0]
    }
}

async function getBot(botId) {
    const [row] = await dbp.query('SELECT * FROM bots where id in (?)', [botId])
    row.secretKey = ''
    if (row.length === 0) {
        return false
    }
    if (row.length === 1) {
        return row[0]
    }
    return row
}

async function addBot(botData) {
    const res = await dbp.query('INSERT INTO bot SET ?', botData)
    return res.insertId
}

async function stopBot(botId) {
    await dbp.query('UPDATE bot SET status = 0 WHERE id = ?', [botId])
}

async function startBot(botId) {
    await dbp.query('UPDATE bot SET status = 1, pause_until = null WHERE id = ?', [botId])
}

async function pauseBot(botId, pauseUntil = null) {
    await dbp.query('UPDATE bot SET status = 2, pause_until = ? WHERE id = ?', [botId, pauseUntil])
}

async function getStatesList() {
    const states = await dbp.query('SELECT * FROM states', [])
    if (states.length === 0) {
        return []
    } else {
        return states[0]
    }
}

async function getRolesList(query) {
    const { filter, range, sort } = query;
    let queryString = 'SELECT * FROM roles',
        queryParams = [];
    const filterObject = JSON.parse(filter);

    if (Object.keys(filterObject).length > 0) {
        const whereClauses = [];

        for (const key in filterObject) {
            const filterValue = filterObject[key];

            if (Array.isArray(filterValue)) {
                const placeholders = Array.from({ length: filterValue.length }, () => '?');
                whereClauses.push(`${key} IN (${placeholders.join(', ')})`);
                queryParams.push(...filterValue);
            } else {
                whereClauses.push(`${key} = ?`);
                queryParams.push(filterValue);
            }
        }

        queryString += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const roles = await dbp.query(queryString, queryParams);

    if (roles.length === 0) {
        return []
    } else {
        return roles[0]
    }
}

async function getTimeFrames() {
    const timeframes = await dbp.query('SELECT * FROM timeframes', [])
    if (timeframes.length === 0) {
        return []
    } else {
        return timeframes[0]
    }
}

async function getPeriods() {
    const periods = await dbp.query('SELECT * FROM periods', [])
    if (periods.length === 0) {
        return []
    } else {
        return periods[0]
    }
}

module.exports = {
    getStatesList,
    getRolesList,
    getTimeFrames,
    getPeriods,
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
    updateExchange,
    editExchange,
    getBotList,
    getBot,
    addBot,
    stopBot,
    startBot,
    pauseBot
}