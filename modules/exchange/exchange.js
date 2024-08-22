const { DBase, DBPrefix } = require('../DB/db')

const createExchange = async (req, res) => {
    const query = JSON.stringify({
        'queryFields': JSON.stringify(req.body),
        'requiredFields': ['title', 'currencies', 'state'],
        'uniqueFields': ['title']
    }),
        response = JSON.parse(await DBase.create('exchange', query)),
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

const getExchange = async (req, res) => {
    const requestQuery = req.query,
        query = JSON.stringify(requestQuery),
        response = await DBase.read('exchange', query),
        range = requestQuery.range,
        records = response.records,
        totalRows = response.totalRows

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}

const getExchangeById = async (req, res) => {
    const query = JSON.stringify({ filter: req.params }),
        response = await DBase.read('exchange', query),
        record = response.records[0]

    return res.status(200).json(record)
}

const getExchanges = async (req, res) => {
    const requestQuery = req.query,
        query = JSON.stringify(requestQuery),
        response = await DBase.read('exchange', query),
        range = requestQuery.range,
        records = response.records,
        totalRows = response.totalRows

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}

const updateExchangeById = async (req, res) => {
    const updQuery = { ...req.body }
    updQuery.checked_out_time = '0000-00-00 00:00:00'
    const updExchangeQuery = JSON.stringify({
        'fields': JSON.stringify(updQuery)
    }),
        response = await DBase.update('exchange', updExchangeQuery)
    return res.status(200).json(response)
}



module.exports = {
    createExchange,
    getExchange,
    getExchangeById,
    getExchanges,
    updateExchangeById
}