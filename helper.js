const bcrypt = require('bcrypt')
const config = require('./config')
const { DBase, DBPrefix } = require('./modules/DB/db')
const jwt = require('jsonwebtoken')
const moment = require('moment')

const checkPermissionsByUid = (uid, action, resource) => {
  return true
}

const extractBcryptHash = (joomlaHash) => {
  // Joomla bcrypt format: $2y$[cost]$[22 character salt][31 character hash]
  const bcryptRegex = /^\$2y\$(1\d)\$([\w.\/]{22}[\w.\/]{31})$/;
  const match = joomlaHash.match(bcryptRegex);

  if (match) {
    // Convert $2y$ to $2a$ for Node.js bcrypt compatibility
    return `\$2a\$${match[1]}\$${match[2]}`;
  }
  return null;
}

const formatDatesInObject = (obj, format) => {
  // Recursive function to traverse all properties of the object
  function traverse(obj) {
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'object') {
          traverse(value); // Recursive call for nested objects
        } else if (typeof value === 'string' && moment(value, moment.ISO_8601).isValid()) {
          obj[key] = moment(value).format(format);  // Date formatting
        } else if (typeof value === 'number') {
          // Skip formatting of numbers
          continue;
        }
      }
    }
  }

  const newObj = { ...obj }; // Create a copy of the object to avoid modifying the original
  traverse(newObj); // Traverse the object to format dates
  return newObj;
}

const getBotParamsNamesEqualPairParamsNames = () => {
  return {
    auto_limit_pair: 'pair_limit',
    auto_long_tf: 'rsi_long_tf',
    auto_martin: 'martin',
    auto_offset: 'start_offset',
    auto_on: 'is_auto',
    auto_order_count: 'start_orders',
    auto_pair_tf: 'auto_pair_tf',
    auto_pd_down: 'pd_down',
    auto_pd_up: 'pd_up',
    auto_profit: 'profit',
    auto_rsi_diff: 'rsi_diff',
    auto_rsi_max_1h: 'rsi_max_1h',
    auto_rsi_max_big: 'auto_rsi_max_big',
    auto_rsi_max_sell: 'auto_rsi_max_sell',
    auto_rsi_max: 'rsi_max',
    auto_rsi_min_1h: 'rsi_min_1h',
    auto_rsi_min_big: 'auto_rsi_min_big',
    auto_rsi_min_sell: 'auto_rsi_min_sell',
    auto_rsi_min: 'rsi_min',
    auto_rsi_period_1h: 'rsi_period_1h',
    auto_rsi_period: 'rsi_period',
    auto_sell_period: 'auto_sell_period',
    auto_sell_tf: 'auto_sell_tf',
    auto_short_tf: 'rsi_short_tf',
    auto_squiz: 'squiz',
    auto_start_sum: 'start_sum',
    auto_step: 'step',
    auto_use_ltf: 'use_ltf',
    long_dump: 'long_dump',
    long_pump: 'long_pump',
    next_buy_timeout: 'next_buy_timeout',
    rsi_sell_diff: 'rsi_sell_diff',
    rsi_sell: 'rsi_sell',
    timeframe: 'rsi_timeframe',
    timeout: 'start_timeout',
  }
}

const getDateTimeNow = () => {
  const dateNow = new Date();
  const year = dateNow.getFullYear();
  const month = String(dateNow.getMonth() + 1).padStart(2, '0');
  const day = String(dateNow.getDate()).padStart(2, '0');
  const hours = String(dateNow.getHours()).padStart(2, '0');
  const minutes = String(dateNow.getMinutes()).padStart(2, '0');
  const seconds = String(dateNow.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const setPauseStartEnd = async (entity, entityId, targetState, useFEntity) => {
  let fEntity = ''
  if (useFEntity) {
    fEntity = 'f'
  }
  const checkEntityQuery = JSON.stringify({
    filter: { id: entityId },
  })
  const entityResponse = await DBase.read(`${DBPrefix}bot_${fEntity}${entity}`, checkEntityQuery),
    entityToUpd = entityResponse.records[0]

  if (typeof entityToUpd == 'object') {
    if (entityToUpd.state === 1 && targetState === 2) {
      const startPauseQuery = JSON.stringify({
        'queryFields': JSON.stringify({ [`${entity}_id`]: entityId, pause_start: getDateTimeNow() }),
        'requiredFields': ['pause_start'],
        'uniqueFields': []
      })
      const pauseResponse = await DBase.create(`${DBPrefix}bot_${fEntity}pause`, startPauseQuery)
      return JSON.parse(pauseResponse)
    }
    if ((entityToUpd.state === 0 || entityToUpd.state === 2) && targetState == 1) {
      const getCurrPauseQuery = JSON.stringify({
        filter: { [`${entity}_id`]: entityId, pause_end: null },
        expression: 'MAX(id) as targetPauseId'
      })

      const getCurrPauseResponse = await DBase.read(`${DBPrefix}bot_${fEntity}pause`, getCurrPauseQuery),
        targetPauseId = getCurrPauseResponse.records[0].targetPauseId

      const stopPauseQuery = JSON.stringify({
        'fields': { id: targetPauseId, pause_end: getDateTimeNow() }
      })

      const stopPauseResponse = await DBase.update(`${DBPrefix}bot_${fEntity}pause`, stopPauseQuery)
      return stopPauseResponse
    }

    return {
      result: 'error',
      errorText: 'The record has not been updated because it is in an inappropriate state'
    }
  } else {
    return {
      result: 'error',
      errorText: 'Record not found or cannot be updated'
    }
  }
}

const verifyJoomlaPassword = async (plainPassword, joomlaHash) => {
  const bcryptHash = extractBcryptHash(joomlaHash);

  if (!bcryptHash) {
    throw new Error('Invalid Joomla bcrypt hash format');
  }

  try {
    return await bcrypt.compare(plainPassword, bcryptHash);
  } catch (error) {
    console.error('Error comparing passwords:', error);
    return false;
  }
}

const verifyToken = (req, res, next) => {
  let token = req.headers['authorization'];

  if (!token) {
      console.log('No token provided')
      return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, config.secretKey, (err, decoded) => {
      if (err) {
          console.log('Token verification failed: ', err)
          console.log(err)
          const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
          if (err.name === 'TokenExpiredError' && decoded.exp < currentTime) {
              console.log('Token expired')
              return res.status(401).json({ error: 'Token expired' });
          }
          return res.status(500).json({ error: err.name });
      }

      /* const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
      if (decoded.exp < currentTime) {
          return res.status(401).json({ error: 'Token expired' });
      } */

      // Decoded data from the token containing the user ID
      req.userId = decoded.userId;
      next();
  });
}



module.exports = {
  checkPermissionsByUid,
  formatDatesInObject,
  getBotParamsNamesEqualPairParamsNames,
  getDateTimeNow,
  setPauseStartEnd,
  verifyJoomlaPassword,
  verifyToken,
}