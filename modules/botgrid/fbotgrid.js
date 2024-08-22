const { DBase, DBPrefix } = require('../DB/db')

const getFBotGrid = async (req, res) => {
    const requestQuery = req.query,
        range = requestQuery.range
    const query = JSON.stringify(requestQuery),
        response = await DBase.read(`${DBPrefix}bot_fgrid`, query),
        records = response.records,
        totalRows = response.totalRows

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}

const getFBotGridByBot = async (req, res) => {
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

        inTradesResponse = await DBase.read(`${DBPrefix}bot_fgrid`, queryInTrades);
        response.in_trades = inTradesResponse.records[0].inTrades

        const queryProfit = JSON.stringify({
            filter: {
                "bot_id": elId,
                "sell_done": 1
            },
            sort: '["id","ASC"]',
            expression: 'sum(sell_qty * sell_price - price * qty) as profit'
        })

        profitResponse = await DBase.read(`${DBPrefix}bot_fgrid`, queryProfit);
        response.profit = profitResponse.records[0].profit

        return res.status(200).json(response)
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

const getFBotGridByPair = async (req, res) => {
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

    inTradesResponse = await DBase.read(`${DBPrefix}bot_fgrid`, queryInOrders);
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

    purchasesResponse = await DBase.read(`${DBPrefix}bot_fgrid`, queryPurchases);
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

    salesResponse = await DBase.read(`${DBPrefix}bot_fgrid`, querySales);
    response.sales = salesResponse.records[0].sales

    return res.status(200).json(response)
}

module.exports = {
    getFBotGrid,
    getFBotGridByBot,
    getFBotGridByPair,
}