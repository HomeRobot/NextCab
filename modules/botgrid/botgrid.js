const { DBase, DBPrefix } = require('../DB/db')

const getBotGrid = async (req, res) => {
    const requestQuery = req.query,
        range = requestQuery.range
    const query = JSON.stringify(requestQuery),
        response = await DBase.read(`${DBPrefix}bot_grid`, query),
        records = response.records,
        totalRows = response.totalRows

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}

const getBotGridByBot = async (req, res) => {
    try {
        const elId = parseInt(req.params.id),
            response = {}

        response.id = elId

        const queryInTrades = JSON.stringify({
            filter: {
                "bot_id": elId,
                "order_done": 1,
                "sell_done": 0
            },
            sort: '["id","ASC"]',
            expression: 'sum(qty_usd) as inTrades'
        })

        inTradesResponse = await DBase.read(`${DBPrefix}bot_grid`, queryInTrades);
        response.in_trades = inTradesResponse.records[0].inTrades
        if (inTradesResponse.records.length > 0) {
            response.in_trades = inTradesResponse.records[0].inTrades
        }

        const queryProfit = JSON.stringify({
            filter: {
                "bot_id": elId,
                "sell_done": 1
            },
            sort: '["id","ASC"]',
            expression: 'sum(sell_qty * sell_price - price * qty) as profit'
        })

        profitResponse = await DBase.read(`${DBPrefix}bot_grid`, queryProfit);
        response.profit = profitResponse.records[0].profit
        if (profitResponse.records.length > 0) {
            response.profit = profitResponse.records[0].profit
        }

        return res.status(200).json(response)
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

const getBotGridByPair = async (req, res) => {
    const elId = parseInt(req.params.id),
        response = {}

    response.id = elId

    const queryInOrders = JSON.stringify({
        filter: {
            "pair_id": elId,
            "order_done": 1,
            "sell_done": 0
        },
        sort: '["id","ASC"]',
        expression: 'sum(qty_usd) as inTrades'
    })

    inTradesResponse = await DBase.read(`${DBPrefix}bot_grid`, queryInOrders);
    response.in_orders = inTradesResponse.records[0].inTrades

    const queryPurchases = JSON.stringify({
        filter: {
            "pair_id": elId,
            "order_done": 1,
            "sell_done": 0
        },
        //sort: '["id","ASC"]',
        expression: 'count(id) as purchases'
    })

    purchasesResponse = await DBase.read(`${DBPrefix}bot_grid`, queryPurchases);
    response.purchases = purchasesResponse.records[0].purchases

    const querySales = JSON.stringify({
        filter: {
            "pair_id": elId,
            "order_done": 1,
            "sell_done": 1
        },
        // sort: '["id","ASC"]',
        expression: 'count(id) as sales'
    })

    salesResponse = await DBase.read(`${DBPrefix}bot_grid`, querySales);
    response.sales = salesResponse.records[0].sales

    return res.status(200).json(response)
}

module.exports = {
    getBotGrid,
    getBotGridByBot,
    getBotGridByPair,
}