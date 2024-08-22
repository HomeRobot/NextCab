const { DBase, DBPrefix } = require('../DB/db')
const helper = require('../../helper')
// const { redis, redisSub } = require('../redis/redis')

const createFPair = async (req, res) => {
    const reqObject = req.body
    const query = JSON.stringify({
        'queryFields': JSON.stringify(reqObject),
        'requiredFields': ['symbol', 'bot_id', 'state'],
        'uniqueFields': []
    }),
        response = JSON.parse(await DBase.create(`${DBPrefix}bot_fpair`, query)),
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

const getFPairById = async (req, res) => {
    const query = JSON.stringify({ filter: req.params }),
        response = await DBase.read(`${DBPrefix}bot_fpair`, query)

    if (response.records && response.records.length > 0) {
        record = response.records[0]

        const pairBotId = record.bot_id
        if (pairBotId) {
            const queryBot = JSON.stringify({
                filter: {
                    "id": pairBotId
                },
            })
            const botResponse = await DBase.read(`${DBPrefix}bot_fbot`, queryBot);
            const bot = botResponse.records[0];
            if (bot) {
                const queryExchange = JSON.stringify({
                    filter: {
                        "id": bot.exchange_id
                    },
                })
                const exchangeResponse = await DBase.read('exchange', queryExchange);
                record.exchange_id = exchangeResponse.records[0] ? exchangeResponse.records[0].id : null

                return res.status(200).json(record)
            } else {
                return res.status(404).json({ error: 'No bot found' })
            }
        } else {
            return res.status(404).json({ error: 'No bot id found' })
        }
    } else {
        return res.status(404).json({ error: 'No data found' })
    }
}

const getFPairs = async (req, res) => {
    const requestQuery = req.query,
        filterParsed = JSON.parse(requestQuery.filter),
        filterParsedWithoutExchangeId = Object.assign({}, filterParsed),
        range = requestQuery.range,
        requestExchangeId = filterParsed.exchange_id,
        requestBotId = filterParsed.bot_id

    delete filterParsedWithoutExchangeId.exchange_id

    let filterWithExchangeOrBot = {}

    if (requestExchangeId && requestExchangeId >= 0) {
        const botsQuery = {
            filter: { exchange_id: requestExchangeId }
        },
            excludeFields = 'apikey, apisecret, apipassword',
            excludeFieldsArr = excludeFields.split(', ')

        botsQuery['excludeFields'] = excludeFieldsArr

        const botsByExchangeId = await DBase.read(`${DBPrefix}bot_fbot`, JSON.stringify(botsQuery)),
            bots = botsByExchangeId.records

        if (bots.length > 0) {
            const botIdsArrayByExchangeId = bots.map(bot => bot.id)
            if (requestBotId) {
                const checkRequestedBotInExchange = botIdsArrayByExchangeId.includes(requestBotId)
                if (!checkRequestedBotInExchange) {
                    res.setHeader('content-range', `${range}/0`);
                    return res.status(200).json([])
                } else {
                    filterWithExchangeOrBot.bot_id = requestBotId
                }
            } else {
                filterWithExchangeOrBot.bot_id = botIdsArrayByExchangeId
            }
            filterWithExchangeOrBot = Object.assign({}, filterWithExchangeOrBot, filterParsedWithoutExchangeId)
        } else {
            res.setHeader('content-range', `${range}/0`);
            return res.status(200).json([])
        }

        requestQuery.filter = JSON.stringify(filterWithExchangeOrBot)
    }

    const query = JSON.stringify(requestQuery),
        response = await DBase.read(`${DBPrefix}bot_fpair`, query),
        records = response.records,
        totalRows = response.totalRows

    const promises = records.map(async (record) => {
        const queryBot = JSON.stringify({
            filter: {
                "id": record.bot_id
            },
        })
        const botResponse = await DBase.read(`${DBPrefix}bot_fbot`, queryBot);
        const bot = botResponse.records[0];

        const queryExchange = JSON.stringify({
            filter: {
                "id": bot.exchange_id
            },
        })
        const exchangeResponse = await DBase.read('exchange', queryExchange);

        const queryOrdersOpened = JSON.stringify({
            filter: {
                "pair_id": record.id,
                "order_done": 1,
                "sell_done": 0,
            },
            expression: 'count(id) as ordersOpened'
        });
        const ordersOpenedResponse = await DBase.read(`${DBPrefix}bot_fgrid`, queryOrdersOpened);

        const inTradesQuery = JSON.stringify({
            filter: {
                "pair_id": record.id,
                "order_done": 1,
                "sell_done": 0
            },
            expression: 'sum(qty_usd) as inTrades'
        });
        const inTradesResponse = await DBase.read(`${DBPrefix}bot_fgrid`, inTradesQuery);

        const queryProfit = JSON.stringify({
            filter: {
                "pair_id": record.id,
                "sell_done": 1
            },
            expression: 'sum(sell_qty * sell_price - price * qty) as profit'
        })
        const profitResponse = await DBase.read(`${DBPrefix}bot_fgrid`, queryProfit);

        return {
            id: record.id,
            exchange_id: exchangeResponse.records[0].id,
            exchange_title: exchangeResponse.records[0].title,
            ordersOpened: ordersOpenedResponse.records[0].ordersOpened,
            inTrades: inTradesResponse.records[0].inTrades,
            profit: profitResponse.records[0].profit
        };
    });

    const syntheticIndicators = await Promise.all(promises);

    syntheticIndicators.forEach((result) => {
        const record = records.find((record) => record.id === result.id);
        record.exchange_id = result.exchange_id;
        record.exchange_title = result.exchange_title;
        record.ordersOpened = result.ordersOpened;
        record.inTrades = result.inTrades;
        record.profit = result.profit;
    });

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}

const updateFPairById = async (req, res) => {
    const updQuery = { ...req.body },
        pairId = parseInt(req.params.id),
        pairState = parseInt(updQuery.state)
    let generalUpdStatus = true,
        redis_publish = false,
        redis_targetPairState = ''
    // redis_status = ''

    updQuery.checked_out_time = '0000-00-00 00:00:00'

    const checkPairQuery = JSON.stringify({
        filter: { id: pairId }
    }),
        checkPairResponse = await DBase.read(`${DBPrefix}bot_fpair`, checkPairQuery),
        pairToUpd = checkPairResponse.records[0]

    if (pairState !== pairToUpd.state) {
        if (pairState === 1 || pairState === 2) {
            const setPauseStartEndResponse = await helper.setPauseStartEnd('pair', pairId, updQuery.state, true)
            if ((setPauseStartEndResponse.result == "success") || (setPauseStartEndResponse.procedure == "update" && setPauseStartEndResponse.status)) {
                redis_publish = true
                if (pairState === 2) {
                    redis_targetPairState = 'pause';
                }
                if (pairState === 1) {
                    redis_targetPairState = 'start';
                }
            } else {
                if (pairState === 0) {
                    redis_publish = true
                    redis_targetPairState = 'stop';
                }
            }
        }
    }

    delete updQuery.exchange_id

    const query = JSON.stringify({
        'fields': helper.formatDatesInObject(updQuery, 'YYYY-MM-DD HH:mm:ss')
    })

    const response = await DBase.update(`${DBPrefix}bot_fpair`, query)

    /* if (redis_publish && response.status) {
        const redisMessage = {
            'id': pairId,
            'command': redis_targetPairState,
        }
        redis.publish('bot-' + pairToUpd.bot_id, JSON.stringify(redisMessage))
        redisSub.on('message', function(channel, message) {
            if (channel === 'bot-' + pairToUpd.bot_id) {
                const redisResponse = JSON.parse(message)
                if (redisResponse.id === pairId) {
                    redis_status = 'ready'
                }
            }
        });
    } */

    if (!response.status /* && redis_status == '' */) {
        generalUpdStatus = false
    }

    if (generalUpdStatus) {
        return res.status(200).json(response)
    } else {
        return res.status(403).json(response)
    }
}



module.exports = {
    createFPair,
    getFPairById,
    getFPairs,
    updateFPairById,
}