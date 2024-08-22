const { DBase, DBPrefix } = require('../DB/db')

const getStrategies = async (req, res) => {
    const roleQuery = req.query,
        query = JSON.stringify(roleQuery),
        response = await DBase.read('strategies', query),
        range = roleQuery.range,
        records = response.records,
        totalRows = response.totalRows

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}



module.exports = {
    getStrategies
}