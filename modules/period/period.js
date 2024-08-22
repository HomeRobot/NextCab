const { DBase, DBPrefix } = require('../DB/db')

const getPeriods = async (req, res) => {
    const query = JSON.stringify(req.query),
        response = await DBase.read('periods', query),
        range = req.query.range,
        records = response.records,
        totalRows = response.totalRows

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}



module.exports = {
    getPeriods
}