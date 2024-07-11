const moment = require('moment')
const bcrypt = require('bcrypt')

function extractBcryptHash(joomlaHash) {
  // Joomla bcrypt format: $2y$[cost]$[22 character salt][31 character hash]
  const bcryptRegex = /^\$2y\$(1\d)\$([\w.\/]{22}[\w.\/]{31})$/;
  const match = joomlaHash.match(bcryptRegex);

  if (match) {
    // Convert $2y$ to $2a$ for Node.js bcrypt compatibility
    return `\$2a\$${match[1]}\$${match[2]}`;
  }
  return null;
}

async function verifyJoomlaPassword(plainPassword, joomlaHash) {
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

function formatDatesInObject(obj, format) {
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

function getDateTimeNow() {
  const dateNow = new Date();
  const year = dateNow.getFullYear();
  const month = String(dateNow.getMonth() + 1).padStart(2, '0');
  const day = String(dateNow.getDate()).padStart(2, '0');
  const hours = String(dateNow.getHours()).padStart(2, '0');
  const minutes = String(dateNow.getMinutes()).padStart(2, '0');
  const seconds = String(dateNow.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getBotParamsNamesEqualPairParamsNames() {
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

module.exports = {
  formatDatesInObject,
  getBotParamsNamesEqualPairParamsNames,
  getDateTimeNow,
  verifyJoomlaPassword
}