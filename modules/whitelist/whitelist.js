const { DBase, DBPrefix } = require('../DB/db')

const createWhitelist = async (req, res) => {
    const query = JSON.stringify({
        'queryFields': JSON.stringify(req.body),
        'requiredFields': ['symbol'],
        'uniqueFields': ['symbol']
    }),
        response = JSON.parse(await DBase.create('whitelist', query)),
        { result: responseResult, resultText: responseText, resultData: responseData } = response

    if (responseResult == 'success') {
        return res.status(201).json({
            id: responseData[0].insertId,
            message: responseText
        });
    }
    if (responseResult == 'error') {
        return res.status(500).json({
            error: responseText,
            errorData: responseData
        });
    }
}

const getWhitelists = async (req, res) => {
    const query = JSON.stringify(req.query),
        response = await DBase.read('whitelist', query),
        range = req.query.range,
        records = response.records,
        totalRows = response.totalRows

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}

const getWhitelistById = async (req, res) => {
    const query = JSON.stringify({ filter: req.params }),
        response = await DBase.read('whitelist', query),
        record = response.records[0]

    return res.status(200).json(record)
}

const updateWhitelistById = async (req, res) => {
    const query = JSON.stringify({
        'fields': JSON.stringify(req.body)
    }),
        response = await DBase.update('whitelist', query)
    return res.status(200).json(response)
}



module.exports = {
    createWhitelist,
    getWhitelists,
    getWhitelistById,
    updateWhitelistById,
}