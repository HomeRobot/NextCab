const { DBase, DBPrefix } = require('../DB/db')
const bcrypt = require('bcrypt')
const helper = require('../../helper')

const createUser = async (req, res) => {
    const { password } = req.body,
        saltRounds = 10,
        createQuery = req.body
    try {
        const passHash = await bcrypt.hash(password, saltRounds)
        createQuery['password'] = passHash
        createQuery['registerDate'] = helper.getDateTimeNow()

        const createUserQuery = JSON.stringify({
            'queryFields': createQuery,
            'requiredFields': ['username', 'password', 'firstName', 'lastName', 'email', 'telegram', 'role', 'officeId', 'state'],
            'uniqueFields': ['username', 'email']
        }),
            response = JSON.parse(await DBase.create(`${DBPrefix}users`, createUserQuery)),
            { result: responseResult, resultText: responseText, resultData: responseData } = response
        if (responseResult == 'success') {
            return res.status(201).json({
                id: responseData[0].insertId,
                message: responseText
            })
        }
        if (responseResult == 'error') {
            return res.status(500).json({
                error: responseText,
                errorData: responseData
            })
        }
    } catch (error) {
        return res.status(500).json({
            error: error.message
        })
    }
}

const getUserById = async (req, res) => {
    const query = JSON.stringify({ filter: req.params }),
        response = await DBase.read(`${DBPrefix}users`, query),
        record = response.records[0]

    if ('password' in record) {
        delete record.password
    }

    return res.status(200).json(record)
}

const getUsers = async (req, res) => {
    const queryFields = 'id, username, role, firstName, lastName, email, telegram, ip, lastvisitDate, registerDate, officeId, state',
        queryFieldsArr = queryFields.split(', '),
        requestQuery = req.query

    requestQuery['fields'] = queryFieldsArr

    const query = JSON.stringify(requestQuery),
        response = await DBase.read(`${DBPrefix}users`, query),
        range = requestQuery.range,
        records = response.records,
        totalRows = response.totalRows

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}

const updateUserById = async (req, res) => {
    const lastvisitDate = req.body.lastvisitDate
    lastResetTime = req.body.lastResetTime,
        password = req.body.password,
        saltRounds = 10,
        updQuery = req.body

    if (password) {
        try {
            const passHash = await bcrypt.hash(password, saltRounds)
            updQuery['password'] = passHash
        } catch (error) {
            return res.status(500).json({
                error: error.message
            })
        }
    }

    if (lastvisitDate == null || lastvisitDate == undefined) {
        updQuery['lastvisitDate'] = '0000-00-00 00:00:00'
    }

    if (lastResetTime == null || lastResetTime == undefined) {
        updQuery['lastResetTime'] = '0000-00-00 00:00:00'
    }

    const userUpdQuery = JSON.stringify({
        'fields': helper.formatDatesInObject(updQuery, 'YYYY-MM-DD HH:mm:ss'),
        'uniqueFields': ['username', 'email']
    }),
        response = await DBase.update('eielu_users', userUpdQuery)
    return res.status(200).json(response)
}



module.exports = {
    createUser,
    getUserById,
    getUsers,
    updateUserById,
}