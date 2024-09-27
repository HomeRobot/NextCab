const { DBase, DBPrefix } = require('../DB/db')
const helper = require('../../helper')
const { redis, redisSub } = require('../redis/redis')

const createFBot = async (req, res) => {
  const crtQuery = { ...req.body }
  crtQuery.checked_out_time = '0000-00-00 00:00:00'
  crtQuery.created = helper.getDateTimeNow()
  const crtBotQuery = JSON.stringify({
    'queryFields': JSON.stringify(crtQuery),
    'requiredFields': ['title', 'exchange', 'state'],
    'uniqueFields': ['title']
  })

  const response = JSON.parse(await DBase.create(`${DBPrefix}bot_fbot`, crtBotQuery)),
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

const getFBotById = async (req, res) => {
  const query = JSON.stringify({ filter: req.params }),
    response = await DBase.read(`${DBPrefix}bot_fbot`, query),
    record = response.records[0]

  if (record) {
    if ('apikey' in record && 'apisecret' in record) {
      record.api_ready = 1
    } else {
      record.api_ready = 0
    }

    record.checked_out_time = '0000-00-00 00:00:00'

    const botId = record.id,
      indicatorsData = await helper.getIndicatorsDataByBotId(botId)
    let parcedIndicatorsRecord = {}

    if (indicatorsData.length > 0) {
      for (const ind of indicatorsData) {
        const indicator = await helper.getIndicatorById(ind.indicator_id)
        if (indicator) {
          ind.indicator_name = indicator.name

          try {
            const fieldsData = JSON.parse(ind.json_1),
              indicatorSettings = JSON.parse(indicator.json_1),
              indicatorFieldsAttrs = indicatorSettings.fields,
              fieldsDataResult = []

            indicatorFieldsAttrs.forEach((field) => {
              const fieldKey = fieldsData.find(obj => obj[field.name])
              if (fieldKey) {
                const fieldValue = fieldKey[field.name],
                  fieldFullData = { ...field, value: fieldValue }

                fieldFullData[field.name] = fieldValue
                fieldsDataResult.push(fieldFullData)
              }
            });

            ind.fields = fieldsDataResult
          } catch (error) {
            console.log("Parse error in json indicator data.", error)
            try {
              const indicatorSettings = JSON.parse(indicator.json_1)
              ind.fields = indicatorSettings.fields
            } catch (error) {
              console.log("Parse error in json indicator settings.", error)
              ind.fields = []
            }
          }
          delete ind.json_1
        } else {
          return res.status(500).json({ error: 'Indicator not found' })
        }
      }
    }


    if (indicatorsData.length > 0) {
      parcedIndicatorsRecord = { ...record, indicators: indicatorsData }
      return res.status(200).json(parcedIndicatorsRecord)
    }

    return res.status(200).json(record)
  } else {
    return res.status(404).json({ error: 'Data error or fbot not found' })
  }
}

const getFBots = async (req, res) => {
  const requestQuery = req.query,
    query = JSON.stringify(requestQuery),
    response = await DBase.read(`${DBPrefix}bot_fbot`, query),
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

const updateFBotById = async (req, res) => {
  const updQuery = { ...req.body },
    botId = parseInt(req.params.id),
    botState = updQuery.state !== undefined ? parseInt(updQuery.state) : false,
    indicators = updQuery.indicators,
    isStrategy = updQuery.is_strategy,
    useStrategy = updQuery.use_strategy
  let botUpdstatus = true,
    botPairsUpdStatus = true,
    generalUpdStatus = true,
    redis_publish = false,
    redis_targetBotState = '',
    redis_status = ''

  const checkBotQuery = JSON.stringify({
    filter: { id: botId }
  }),
    checkBotResponse = await DBase.read(`${DBPrefix}bot_fbot`, checkBotQuery),
    botToUpd = checkBotResponse.records[0]

  const checkBotPairsQuery = JSON.stringify({
    filter: { bot_id: botId }
  }),
    checkBotPairsResponse = await DBase.read(`${DBPrefix}bot_fpair`, checkBotPairsQuery),
    botPairsQty = checkBotPairsResponse.records.length

  if (botToUpd) {
    // Check if bot is strategy or not. If yes - delete use_strategy as it is synthetic afield
    if (isStrategy) {
      delete updQuery.use_strategy
      updQuery.is_strategy = 1
      updQuery.strategy = null
    }

    // Check if set whitelist data
    if (req.body.whitelist.length == 0) {
      updQuery.whitelist = null
    }

    const updDeltaExcludeFields = ['ap_ready', 'checked_out_time', 'created', 'created_by', 'indicators', 'use_strategy']
    const updDeltaObj = helper.getChangedFields(botToUpd, updQuery, updDeltaExcludeFields)

    if (Object.keys(updDeltaObj).length > 0) {
      redis_publish = true
    }

    updQuery.checked_out_time = '0000-00-00 00:00:00'
    updQuery.id = botId
    delete updQuery.api_ready
    delete updQuery.created
    delete updQuery.created_by
    delete updQuery.indicators

    // Indicators update
    if (indicators && indicators.length > 0) {
      for (const ind of indicators) {
        const indicatorQuery = JSON.stringify({
          filter: { indicator_id: ind.indicator_id, fbot_id: botId },
          fields: {
            enabled: ind.enabled ? 1 : 0,
            json_1: JSON.stringify(ind.fields)
          }
        }),
          indicatorResponse = await DBase.update("indicators_data", indicatorQuery)
      }
    }

    // Bot update if state not changed
    if (botState === false) {
      const botParamsNamesEqualPairsParamsNames = helper.getBotParamsNamesEqualPairParamsNames()

      if (isStrategy == false) {
        updQuery.is_strategy = 0
        if (useStrategy) {
          if (updQuery.strategy) {
            const strategyOriginQuery = JSON.stringify({
              filter: { id: updQuery.strategy }
            })
            const strategyOriginResponse = await DBase.read(`${DBPrefix}bot_fbot`, strategyOriginQuery),
              strategyOrigin = strategyOriginResponse.records[0]

            if (strategyOrigin) {
              console.log('strategyOrigin: ', strategyOrigin)
              const originIndicatorsData = await helper.getIndicatorsDataByBotId(strategyOrigin.id)

              if (originIndicatorsData.length > 0) {
                const indicatorsData = await helper.getIndicatorsDataByBotId(botId)

                console.log('indicatorsData: ', indicatorsData)

                if (indicatorsData.length > 0) {
                  for (const ind of indicatorsData) {
                    console.log('ind: ', ind)
                    const dltIndQuerry = JSON.stringify({
                      'filter': {
                        'id': ind.id
                      },
                    })

                    const dltIndResponse = await DBase.delete('indicators_data', dltIndQuerry)
                    console.log('dltIndResponse: ', dltIndResponse)
                  }
                }

                for (const originInd of originIndicatorsData) {
                  const crtIndQuerry = JSON.stringify({
                    'queryFields': {
                      'indicator_id': originInd.indicator_id,
                      'fbot_id': botId,
                      'enabled': originInd.enabled,
                      'json_1': originInd.json_1

                    },
                    'requiredFields': ['indicator_id', 'fbot_id', 'enabled', 'json_1'],
                    'uniqueFields': []
                  })

                  const crtIndResponse = await DBase.create('indicators_data', crtIndQuerry)
                  console.log('crtIndResponse: ', crtIndResponse)
                }
              }

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

      if (botPairsQty > 0) {
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
          const botPairsUpdResponse = await DBase.update(`${DBPrefix}bot_fpair`, botPairsQuery)

          if (botPairsUpdResponse.status !== true) {
            botPairsUpdStatus = false
          }
        }
      }
    } else {
      // Bot update if state change
      if (botState === 1 || botState === 2) {
        const setPauseStartEndResponse = await helper.setPauseStartEnd('bot', botId, botState, true)
        if ((setPauseStartEndResponse.result == "success") || (setPauseStartEndResponse.procedure == "update" && setPauseStartEndResponse.status)) {
          redis_publish = true
          if (botState === 2) {
            redis_targetBotState = 'pause';
          }
          if (botState === 1) {
            redis_targetBotState = 'start';
          }
        } else {
          console.log('setPauseStartEndResponse failed')
          return res.status(403).json({ error: 'Set pause or start failed' })
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
    const botUpdResponse = await DBase.update(`${DBPrefix}bot_fbot`, botQuery)

    if (botUpdResponse.status !== true) {
      botUpdstatus = false
    }

    if (redis_publish && botUpdResponse.status) {
      const redisMessage = {
        'id': parseInt(botId),
        'command': redis_targetBotState,
      }

      if (Object.keys(updDeltaObj).length > 0) {
        redisMessage.newData = JSON.stringify(updDeltaObj)
      }

      redis.publish('main', JSON.stringify(redisMessage))
      redisSub.on('message', function (channel, message) {
        if (channel === 'main') {
          const redisResponse = JSON.parse(message)
          if (redisResponse.id === botId) {
            redis_status = 'ready'
            // console.log('Redis response: ', redisResponse)
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
    return res.status(403).json({ error: 'No fbot to update was found' })
  }
}



module.exports = {
  createFBot,
  getFBotById,
  getFBots,
  updateFBotById,
}