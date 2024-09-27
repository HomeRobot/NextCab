// import text from './constants.json'

// Load libraries and helpers
const express = require('express')
const https = require('https')
const fs = require('fs')
const cors = require('cors')
const bodyParser = require('body-parser')
const config = require('./config')
const RBAC = require('./roles')
const helper = require('./helper')

// Load modules
const authorization = require('./modules/authorization/authorization')
const botgrid = require('./modules/botgrid/botgrid')
const bots = require('./modules/bots/bots')
const ccxt = require('./modules/ccxt/ccxt')
const exchange = require('./modules/exchange/exchange')
const fbotgrid = require('./modules/botgrid/fbotgrid')
const fbots = require('./modules/bots/fbots')
const forder = require('./modules/order/forder')
const fpairs = require('./modules/pairs/fpairs')
const fpause = require('./modules/pause/fpause')
const office = require('./modules/office/office')
const order = require('./modules/order/order')
const pairs = require('./modules/pairs/pairs')
const pause = require('./modules/pause/pause')
const period = require('./modules/period/period')
const role = require('./modules/role/role')
const state = require('./modules/state/state')
const strategy = require('./modules/strategy/strategy')
const timeframe = require('./modules/timeframe/timeframe')
const user = require('./modules/user/user')
const whitelist = require('./modules/whitelist/whitelist')



// Create express app
const app = express();

// App set body parser
app.use(bodyParser.json());

// Enable CORS for all routes
app.use(cors({
    origin: config.ALLOWED_ORIGINS,
    exposedHeaders: ['content-range'],
    methods: ['GET', 'POST', 'PUT'],
}));

// Establishing MIME types for all files with extensions
app.use('/', express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.tsx')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    },
}));



// AUTHORIZATION AND REGISTRATION ENDPOINTS
app.post('/register', (req, res) => {
    console.log('Поступил POST запрос на регистрацию пользователя: ', req.body);
    return authorization.userRegistration(req, res)
});

app.post('/login', async (req, res) => {
    console.log('Поступил запрос на авторизацию пользователя: ', req.body);
    return authorization.userLogin(req, res)
});

app.post('/logout', async (req, res) => {
    console.log('Поступил запрос на выход: ', req.body);
    return authorization.userLogout(req, res)
})

app.get('/getPermissions', helper.verifyToken, (req, res) => {
    return res.json(RBAC.roles)
})
// ---



// USERS ENDPOINTS
app.get('/users', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /users: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'users')) {
        return await user.getUsers(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/users/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод /users. Запрос /users/:id с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'users')) {
        return await user.getUserById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/users/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод /users. Запрос /users/:id с параметрами: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'update', 'users')) {
        return await user.updateUserById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-user', helper.verifyToken, async (req, res) => {
    console.log('Вызван POST-метод /create-user');
    if (helper.checkPermissionsByUid(req.userId, 'create', 'users')) {
        return await user.createUser(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---



// EXCHANGES ENDPOINTS
app.get('/exchanges', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /exchanges: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'exchange')) {
        return await exchange.getExchanges(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/exchange', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /exchange: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, '', 'exchange')) {
        return await exchange.getExchange(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/exchanges/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /exchange/:id с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'exchange')) {
        return await exchange.getExchangeById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-exchange', helper.verifyToken, async (req, res) => {
    console.log('Поступил POST запрос на создание биржи: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'create', 'exchange')) {
        return await exchange.createExchange(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});

app.put('/exchanges/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод /exchanges. Запрос /exchanges/:id с параметрами: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'update', 'exchange')) {
        return await exchange.updateExchangeById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---



// OFFICES ENDPOINTS
app.get('/offices', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /offices: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'office')) {
        return await office.getOffices(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/offices/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /offices/:id с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'office')) {
        return await office.getOfficeById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/offices/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод /offices. Запрос /offices/:id с параметрами: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'update', 'offices')) {
        return await office.updateOfficeById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-office', helper.verifyToken, async (req, res) => {
    console.log('Поступил POST запрос на создание офиса: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'create', 'office')) {
        return await office.createOffice(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});
// ---



// BOTS ENDPOINTS
app.get('/bots', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /bots: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'bots')) {
        return await bots.getBots(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/bots/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /bots/:id с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'bots')) {
        return await bots.getBotById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/bots/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод. Тело запроса /bots/:id: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'update', 'bots')) {
        return await bots.updateBotById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-bot', helper.verifyToken, async (req, res) => {
    console.log('Поступил POST запрос на создание бота: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'create', 'bot')) {
        return await bots.createBot(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});
// ---



// FBOTS ENDPOINTS
app.get('/fbots', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /fbots: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'fbots')) {
        return await fbots.getFBots(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/fbots/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /fbots/:id с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'fbots')) {
        return await fbots.getFBotById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/fbots/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод. Тело запроса /fbots/:id: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'update', 'fbots')) {
        return await fbots.updateFBotById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-fbot', helper.verifyToken, async (req, res) => {
    console.log('Поступил POST запрос на создание fбота: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'create', 'fbot')) {
        return await fbots.createFBot(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});
// ---



// PAIRS ENDPOINTS
app.get('/pairs', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /pairs: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'pairs')) {
        return await pairs.getPairs(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/pairs/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /pairs/:id с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'pairs')) {
        return await pairs.getPairById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/pairs/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод. Тело запроса /pairs/:id: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'update', 'pairs')) {
        return await pairs.updatePairById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-pair', helper.verifyToken, async (req, res) => {
    console.log('Поступил POST запрос на создание пары: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'create', 'pair')) {
        return await pairs.createPair(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});
// ---



// FPAIRS ENDPOINTS
app.get('/fpairs', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /fpairs: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'fpairs')) {
        return await fpairs.getFPairs(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/fpairs/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /fpairs/:id с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'fpairs')) {
        return await fpairs.getFPairById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/fpairs/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод. Тело запроса /fpairs/:id: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'update', 'fpairs')) {
        return await fpairs.updateFPairById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-fpair', helper.verifyToken, async (req, res) => {
    console.log('Поступил POST запрос на создание fпары: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'create', 'fpair')) {
        return await fpairs.createFPair(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});
// ---



// STATES ENDPOINTS
app.get('/states', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /states: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'states')) {
        return await state.getStates(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/states/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /states/:id ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'states')) {
        return await state.getStateById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---



// ROLES ENDPOINTS
app.get('/roles', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /roles: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'roles')) {
        return await role.getRoles(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// TIMEFRAMES ENDPOINTS
app.get('/timeframes', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /timeframes: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'timeframes')) {
        return await timeframe.getTimeframes(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// PERIODS ENDPOINTS
app.get('/periods', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /periods: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'periods')) {
        return await period.getPeriods(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// STRATEGIES ENDPOINTS
app.get('/strategies', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /strategies: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'strategies')) {
        return await strategy.getStrategies(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// BOT GRID ENDPOINTS
app.get('/botgrid', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /botgrid: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'botgrid')) {
        return await botgrid.getBotGrid(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/botgrid-by-bot/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /botgrid-by-bot: с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'botgrid')) {
        return await botgrid.getBotGridByBot(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/botgrid-by-pair/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /botgrid-by-pair: с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'botgrid')) {
        return await botgrid.getBotGridByPair(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---



// FBOT GRID ENDPOINTS
app.get('/fbotgrid', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /fbotgrid: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'fbotgrid')) {
        return await fbotgrid.getFBotGrid(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/botgrid-by-fbot/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /botgrid-by-fbot: с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'fbotgrid')) {
        return await fbotgrid.getFBotGridByBot(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/botgrid-by-fpair/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /botgrid-by-fpair: с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'fbotgrid')) {
        return await fbotgrid.getFBotGridByPair(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---



// ORDERS ENDPOINTS
app.get('/orders/', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /orders: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'botgrid')) {
        return await order.getOrders(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---



// FORDERS ENDPOINTS
app.get('/forders/', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /forders: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'getList', 'botfgrid')) {
        return await forder.getFOrders(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---



// PAUSES ENDPOINTS
app.get('/bot_pause/', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /bot_pause/ с параметрами: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'bot_pause')) {
        return await pause.getBotPauses(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---



// FPAUSES ENDPOINTS
app.get('/bot_fpause/', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /bot_fpause/ с параметрами: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'bot_fpause')) {
        return await fpause.getBotFPauses(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---



// WHITELIST ENDPOINTS
app.get('/whitelist/', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /whitelist/ с параметрами: ', req.query);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'whitelist')) {
        return await whitelist.getWhitelists(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/whitelist/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /whitelist/:id с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'whitelist')) {
        return await whitelist.getWhitelistById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-whitelist', helper.verifyToken, async (req, res) => {
    console.log('Поступил POST запрос на создание whitelist: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'create', 'whitelist')) {
        return await whitelist.createWhitelist(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});

app.put('/whitelist/:id', helper.verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод /whitelist. Запрос /whitelist/:id с параметрами: ', req.body);
    if (helper.checkPermissionsByUid(req.userId, 'update', 'whitelist')) {
        return await whitelist.updateWhitelistById(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
//---



// CCTX ENDPOINTS
app.get('/cctx/:params', helper.verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /cctx/ с параметрами: ', req.params);
    if (helper.checkPermissionsByUid(req.userId, 'read', 'cctx')) {
        return await ccxt.getCCXTDatabyParams(req, res)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
//---



// Server options
const options = {
    key: fs.readFileSync(config.SSL_KEY_PATH),
    cert: fs.readFileSync(config.SSL_CERT_PATH),
};
const port = 3003;

// Start server
https.createServer(options, app).listen(port, () => {
    console.log(`SERVER STARTED on port ${port}`);
});