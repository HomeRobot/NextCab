const { DBase, DBPrefix } = require('../DB/db')
const helper = require('../../helper')
const { redis, redisSub } = require('../redis/redis')

const createBot = async (req, res) => {
  const crtQuery = { ...req.body }
  crtQuery.checked_out_time = '0000-00-00 00:00:00'
  crtQuery.created = helper.getDateTimeNow()
  const crtBotQuery = JSON.stringify({
    'queryFields': JSON.stringify(crtQuery),
    'requiredFields': ['title', 'exchange', 'client_id', 'state'],
    'uniqueFields': ['title']
  })

  const response = JSON.parse(await DBase.create(`${DBPrefix}bot_bot`, crtBotQuery)),
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

const getBotById = async (req, res) => {
  const query = JSON.stringify({ filter: req.params }),
    response = await DBase.read(`${DBPrefix}bot_bot`, query),
    record = response.records[0]

  if (record) {
    if ('apikey' in record && 'apisecret' in record) {
      record.api_ready = 1
    } else {
      record.api_ready = 0
    }
  }

  return res.status(200).json(record)
}

const getBots = async (req, res) => {
  const requestQuery = req.query,
    query = JSON.stringify(requestQuery),
    response = await DBase.read(`${DBPrefix}bot_bot`, query),
    range = requestQuery.range,
    records = response.records,
    totalRows = response.totalRows

  if (records) {
    records.forEach((record) => {
      if (record.apikey && record.apikey.trim().length > 0 && record.apisecret && record.apisecret.trim().length > 0) {
        record.api_ready = 1
      } else {
        record.api_ready = 0
      }

      if ('apikey' in record) {
        delete record.apikey
      }
      if ('apisecret' in record) {
        delete record.apisecret
      }
      if ('apipassword' in record) {
        delete record.apipassword
      }
    })
  }

  res.setHeader('content-range', `${range}/${totalRows}`);
  return res.status(200).json(records)
}

const updateBotById = async (req, res) => {
  const updQuery = { ...req.body },
    botId = parseInt(req.params.id),
    botState = updQuery.state ? parseInt(updQuery.state) : false,
    isStrategy = updQuery.is_strategy,
    useStrategy = updQuery.use_strategy
  let botUpdstatus = true,
    botPairsUpdStatus = true,
    generalUpdStatus = true,
    redis_publish = false,
    redis_targetBotState = '',
    redis_status = ''

  updQuery.id = botId
  delete updQuery.api_ready
  updQuery.checked_out_time = '0000-00-00 00:00:00'

  if (isStrategy) {
    delete updQuery.use_strategy
    updQuery.is_strategy = 1
    updQuery.strategy = null
  }

  const checkBotQuery = JSON.stringify({
    filter: { id: botId }
  }),
    checkBotResponse = await DBase.read(`${DBPrefix}bot_bot`, checkBotQuery),
    botToUpd = checkBotResponse.records[0]

  if (botToUpd) {
    if (botState == false) {
      const botParamsNamesEqualPairsParamsNames = helper.getBotParamsNamesEqualPairParamsNames()

      if (isStrategy == false) {
        updQuery.is_strategy = 0
        if (useStrategy) {
          if (updQuery.strategy) {
            const strategyOriginQuery = JSON.stringify({
              filter: { id: updQuery.strategy }
            })
            const strategyOriginResponse = await DBase.read(`${DBPrefix}bot_bot`, strategyOriginQuery),
              strategyOrigin = strategyOriginResponse.records[0]

            if (strategyOrigin) {
              for (const key in botParamsNamesEqualPairsParamsNames) {
                if (botParamsNamesEqualPairsParamsNames.hasOwnProperty(key) && strategyOrigin.hasOwnProperty(key)) {
                  updQuery[key] = strategyOrigin[key];
                }
              }
            } else {
              return res.status(403).json({ error: 'No strategy for update was found' })
            }
          } else {
            updQuery.strategy = null
          }
        } else {
          updQuery.strategy = null
        }
      }

      const botChangedData = {};
      for (const key in updQuery) {
        if (updQuery.hasOwnProperty(key) && botParamsNamesEqualPairsParamsNames.hasOwnProperty(key)) {
          if (updQuery[key] !== botToUpd[key]) {
            botChangedData[key] = updQuery[key];
          }
        }
      }

      if (Object.keys(botChangedData).length > 0) {
        const botPairFieldsToUpd = {}
        for (const key in botChangedData) {
          if (botChangedData.hasOwnProperty(key)) {
            const mappedKey = botParamsNamesEqualPairsParamsNames[key];
            botPairFieldsToUpd[mappedKey] = botChangedData[key];
          }
        }
        const botPairsQuery = JSON.stringify({
          'fields': helper.formatDatesInObject(botPairFieldsToUpd, 'YYYY-MM-DD HH:mm:ss'),
          filter: { bot_id: botId }
        })
        const botPairsUpdResponse = await DBase.update(`${DBPrefix}bot_pair`, botPairsQuery)

        if (botPairsUpdResponse.status !== true) {
          botPairsUpdStatus = false
        }
      }
    } else {
      if (botState === 1 || botState === 2) {
        const setPauseStartEndResponse = await helper.setPauseStartEnd('bot', botId, botState, false)
        if ((setPauseStartEndResponse.result == "success") || (setPauseStartEndResponse.procedure == "update" && setPauseStartEndResponse.status)) {
          redis_publish = true
          if (botState === 2) {
            redis_targetBotState = 'pause';
          }
          if (botState === 1) {
            redis_targetBotState = 'start';
          }
        }
      } else {
        if (botState === 0) {
          redis_publish = true
          redis_targetBotState = 'stop';
        }
      }
    }

    delete updQuery.use_strategy

    const botQuery = JSON.stringify({
      'fields': helper.formatDatesInObject(updQuery, 'YYYY-MM-DD HH:mm:ss')
    })
    const botUpdResponse = await DBase.update(`${DBPrefix}bot_bot`, botQuery)

    if (botUpdResponse.status !== true) {
      botUpdstatus = false
    }

    if (redis_publish && botUpdResponse.status) {
      const redisMessage = {
        'id': parseInt(botId),
        'command': redis_targetBotState,
      }
      redis.publish('main', JSON.stringify(redisMessage))
      redisSub.on('message', function (channel, message) {
        if (channel === 'main') {
          const redisResponse = JSON.parse(message)
          if (redisResponse.id === botId) {
            redis_status = 'ready'
          }
        }
      });
    }

    if (!botUpdstatus && !botPairsUpdStatus && redis_status == '') {
      generalUpdStatus = false
    }

    const response = {
      'id': botId,
      'procedure': 'update',
      'status': generalUpdStatus
    }
    if (generalUpdStatus) {
      return res.status(200).json(response)
    } else {
      return res.status(403).json(response)
    }
  } else {
    return res.status(403).json({ error: 'No bot to update was found' })
  }
}



module.exports = {
  createBot,
  getBotById,
  getBots,
  updateBotById,
}