const { DBase, DBPrefix } = require('../DB/db')
const ccxt = require('ccxt')

const getCCXTDatabyParams = async (req, res) => {
    const cctxQuery = JSON.parse(req.params.params)

    if (cctxQuery.exchangeId) {
        if (cctxQuery.queryDataType == 'candles') {
            const pairSymbol = `${cctxQuery.pairAltCur}/${cctxQuery.pairBaseCur}`
            const queryBot = JSON.stringify({
                filter: {
                    id: cctxQuery.botId
                }
            })
            const responseBot = await DBase.read(`${DBPrefix}bot_bot`, queryBot)
            if (responseBot.records.length > 0) {
                // const bot = responseBot.records[0]
                let cctxExchange

                if (cctxQuery.exchangeId == 1) {
                    cctxExchange = new ccxt.binance(
                        {
                            //"apiKey": bot.apikey,
                            //"secret": bot.apisecret,
                            "options": {
                                'defaultType': 'spot'
                            }
                        }
                    )
                }
                if (cctxQuery.exchangeId == 2) {
                    cctxExchange = new ccxt.bybit(
                        {
                            //"apiKey": bot.apikey,
                            //"secret": bot.apisecret,
                            "options": {
                                'createMarketBuyOrderRequiresPrice': true,
                                'accountType': 'UNIFIED'
                            }
                        }
                    )
                }
                if (cctxQuery.exchangeId == 3) {
                    cctxExchange = new ccxt.okx({
                        //"apiKey": bot.apikey,
                        //"secret": bot.apisecret,
                        //"password": bot.apipassword,
                        "options": {
                            'defaultType': 'spot'
                        }
                    })
                }

                try {
                    const candles = await cctxExchange.fetchOHLCV(pairSymbol, cctxQuery.timeframe, undefined, cctxQuery.limit)
                    const response = {
                        candles: candles,
                        responseTime: new Date().getTime() - 60 * 60 * 1000,
                    }
                    return res.status(200).json(response)
                } catch (error) {
                    return res.status(500).json({ error: error.message });
                }
            } else {
                return res.status(500).json({ error: 'Bot not found' });
            }
        } else {
            return res.status(500).json({ error: 'Exchange not found' });
        }
    } else {
        return res.status(500).json({ error: 'Exchange id not found' });
    }
}



module.exports = {
    getCCXTDatabyParams,
}