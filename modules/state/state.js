const { DBase, DBPrefix } = require('../DB/db')

const getStateById = async (req, res) => {
    const query = JSON.stringify({ filter: req.params }),
        response = await DBase.read('states', query),
        record = response.records[0]

    return res.status(200).json(record)
}

const getStates = async (req, res) => {
    const requestQuery = req.query,
        query = JSON.stringify(requestQuery),
        response = await DBase.read('states', query),
        range = requestQuery.range,
        records = response.records,
        totalRows = response.totalRows

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}



module.exports = {
    getStateById,
    getStates
}