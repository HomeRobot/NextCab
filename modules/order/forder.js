const { DBase, DBPrefix } = require('../DB/db')

const getFOrders = async (req, res) => {
    try {
        const requestQuery = req.query,
            range = requestQuery.range
        const query = JSON.stringify(requestQuery),
            response = await DBase.read(`${DBPrefix}bot_fgrid`, query),
            records = response.records,
            totalRows = response.totalRows

        const fieldsToKeep = ['id', 'pair_id', 'symbol', 'price', 'qty', 'startOrder', 'sell_price', 'sell_qty', 'profit', 'order_done', 'sell_done', 'sellOrder'];
        const recordsWithLimitedFields = records.map(record => {
            const limitedRecord = {};
            fieldsToKeep.forEach(field => {
                if (field in record) {
                    limitedRecord[field] = record[field];
                }
            });
            return limitedRecord;
        });

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(recordsWithLimitedFields)
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}



module.exports = {
    getFOrders
}