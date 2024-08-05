// import text from './constants.json'

const express = require('express')
const https = require('https')
const fs = require('fs')
const cors = require('cors')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const mysql = require('mysql2')
const config = require('./config')
const RBAC = require('./roles')
const core = require('./core')
const helper = require('./helper')
const Database = require('./libraries/DBdata')
const Redis = require('ioredis');
const ccxt = require('ccxt')
const { error } = require('console')

const app = express();

// Загрузка сертификата и ключа
const options = {
    key: fs.readFileSync(config.SSL_KEY_PATH),
    cert: fs.readFileSync(config.SSL_CERT_PATH),
};

app.use(bodyParser.json());
// Включение CORS для всех маршрутов
app.use(cors({
    origin: config.ALLOWED_ORIGINS,
    exposedHeaders: ['content-range'],
    methods: ['GET', 'POST', 'PUT'],
}));

// Подключение к базе данных MySQL
const db = mysql.createPool({
    user: config.DB_USERNAME,
    database: config.DB_DATABASE,
    host: config.DB_HOST,
    password: config.DB_PASSWORD
})

const dbp = db.promise()
const DBase = new Database(dbp);

// Подключение к серверу Redis
const redis = new Redis({
    host: config.REDIS_HOST_01,
    port: config.REDIS_PORT_01,
    password: config.REDIS_PASS_01
});

const redisSub = new Redis({
    host: config.REDIS_HOST_01,
    port: config.REDIS_PORT_01,
    password: config.REDIS_PASS_01
});

redisSub.subscribe('main', 'auto');
redis.on('connect', function () {
    console.log('Подключение к Redis установлено');
});
redis.on('error', function (err) {
    console.error('Ошибка Redis:', err);
});
redis.on('ready', () => {
    console.log('Клиент Redis готов к работе');
});
redisSub.on("message", (channel, message) => {
    console.log('redisSub message: ', channel, message)
})

// Установка MIME типа для всех файлов с определенным расширением
app.use('/', express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.tsx')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    },
}));

// Маршруты для создания пользователя и авторизации
app.post('/register', (req, res) => {
    console.log('Поступил POST запрос на регистрацию: ', req.body);
    const { username, password, email } = req.body;


    if (!username || !password) {
        return res.status(400).json({ error: 'Please, fill all fields' });
    }

    // Хеширование пароля перед сохранением в базу данных
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            return res.status(500).json({ error: 'Password hash error' });
        }

        const user = { username, password: hash, email, role: 3 };
        db.query('INSERT INTO eielu_users SET ?', user, (err, result) => {
            if (err) {
                console.error('Ошибка при создании пользователя:', err);
                return res.status(500).json({ error: 'Error while creating user' });
            }
            return res.status(201).json({
                id: result.insertId,
                message: 'User created successfully'
            });
        });
    });
});

app.post('/login', async (req, res) => {
    console.log('Поступил запрос на авторизацию: ', req.body);
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Please fill all fields' });
    }

    db.query('SELECT * FROM eielu_users WHERE username = ?', [username], async (err, results) => {
        if (err) {
            console.error('Ошибка при запросе к базе данных:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = results[0]
        plainPassword = password,
            joomlaHash = user.password

        try {
            const isMatch = await helper.verifyJoomlaPassword(plainPassword, joomlaHash);
            if (!isMatch) {
                return res.status(401).json({ error: 'Wrong username or password' });
            }
            if (isMatch) {
                const userRole = user.role,
                    userPermissions = RBAC.roles[userRole];

                // Создание JWT токена
                const token = jwt.sign({
                    userId: user.id,
                    role: user.role
                }, config.secretKey, { expiresIn: '10min' });

                //console.log('Токен: ' + token);
                // res.setHeader('Content-Type', 'application/javascript');
                return res.status(200).json({
                    "token": token,
                    "permissions": userPermissions,
                    "uid": user.id,
                    "username": user.username,
                    "role": userRole
                });
            }
        } catch (error) {
            console.error('User verification failed:', error.message);
            return res.status(401).json({ error: 'User verification failed' });
        }
    });
});

app.post('/logout', async (req, res) => {
    console.log('Поступил запрос на выход: ', req.body);
    const { username, userId } = req.body;
    // res.header('Access-Control-Allow-Origin', allowedOrigins);

    // Исправить!!! Приходит пустой req.body и проверить результат апдейта
    /* if (userId) {
        const userQuery = {
            'id': req.userId,
            'lastvisitDate': helper.getNowDate(),
        }
        const logOutQuery = JSON.stringify({
            'fields': helper.formatDatesInObject(userQuery, 'YYYY-MM-DD HH:mm:ss'),
            'uniqueFields': []
        })
        DBase.update('eielu_users', logOutQuery)
    } */

    return res.status(200).json({
        'action': 'logout',
        'status': 'ok'
    })
})

app.get('/protected', verifyToken, (req, res) => {
    // Маршрут доступен только для авторизованных пользователей
    res.json({ message: 'Это защищенный маршрут. Только авторизованные пользователи могут видеть это.' });
});

function verifyToken(req, res, next) {
    let token = req.headers['authorization'];

    if (!token) {
        // token = req.token
    }

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    // console.log('Проверка токена (функция verifyToken): ' + token)
    jwt.verify(token, config.secretKey, (err, decoded) => {
        if (err) {
            console.log('Токен не прошел проверку')
            console.log(err)
            const currentTime = Math.floor(Date.now() / 1000); // Текущее время в секундах
            if (err.name === 'TokenExpiredError' && decoded.exp < currentTime) {
                console.log('Токен протух')
                return res.status(401).json({ error: 'Token expired' });
            }
            return res.status(500).json({ error: err.name });
        }

        /* const currentTime = Math.floor(Date.now() / 1000); // Текущее время в секундах
        if (decoded.exp < currentTime) {
            return res.status(401).json({ error: 'Token expired' });
        } */

        // Декодированные данные из токена, содержащие идентификатор пользователя (userId)
        req.userId = decoded.userId;
        next();
    });
}

async function setPauseStartEnd(entity, entityId, targetState) {
    const checkEntityQuery = JSON.stringify({
        filter: { id: entityId },
    })
    const entityResponse = await DBase.read(`eielu_bot_${entity}`, checkEntityQuery),
        entityToUpd = entityResponse.records[0]

    if (typeof entityToUpd == 'object') {
        if (entityToUpd.state === 1 && targetState === 2) {
            const startPauseQuery = JSON.stringify({
                'queryFields': JSON.stringify({ [`${entity}_id`]: entityId, pause_start: helper.getDateTimeNow() }),
                'requiredFields': ['pause_start'],
                'uniqueFields': []
            })
            const pauseResponse = await DBase.create('eielu_bot_pause', startPauseQuery)
            return pauseResponse
        }
        if ((entityToUpd.state === 0 || entityToUpd.state === 2) && targetState == 1) {
            const getCurrPauseQuery = JSON.stringify({
                filter: { [`${entity}_id`]: entityId, pause_end: null },
                expression: 'MAX(id) as targetPauseId'
            })

            const getCurrPauseResponse = await DBase.read('eielu_bot_pause', getCurrPauseQuery),
                targetPauseId = getCurrPauseResponse.records[0].targetPauseId

            const stopPauseQuery = JSON.stringify({
                'fields': { id: targetPauseId, pause_end: helper.getDateTimeNow() }
            })

            const stopPasueResponse = await DBase.update('eielu_bot_pause', stopPauseQuery)
            return stopPasueResponse
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

app.get('/me', verifyToken, (req, res) => {
    const userId = req.userId;

    db.query('SELECT id, username, firstName, lastName, avatar, email, telegram, lastvisitDateDate, registerDate, role FROM eielu_users WHERE id = ?', [userId], (err, results) => {
        if (err) {
            console.error('Ошибка при запросе к базе данных:', err);
            return res.status(500).json({ error: 'Ошибка при запросе к базе данных' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = results[0];
        return res.json(user);
    });
});

app.get('/getPermissions', verifyToken, (req, res) => {
    return res.json(RBAC.roles)
})



// USERS ENDPOINTS
app.get('/users', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /users: ', req.query);
    const userId = req.userId

    if (core.canUserAction(userId, 'getList', 'users')) {
        const queryFields = 'id, username, role, firstName, lastName, email, telegram, ip, lastvisitDate, registerDate, officeId, state',
            queryFieldsArr = queryFields.split(', '),
            requestQuery = req.query

        requestQuery['fields'] = queryFieldsArr
        const query = JSON.stringify(requestQuery),
            response = await DBase.read('eielu_users', query),
            range = requestQuery.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/users/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод /users. Запрос /users/:id с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'users')) {
        const query = JSON.stringify({ filter: req.params }),
            response = await DBase.read('eielu_users', query),
            record = response.records[0]

        if ('password' in record) {
            delete record.password
        }

        return res.status(200).json(record)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/users/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван PUT-метод /users. Запрос /users/:id с параметрами: ', req.body);
    const userId = req.userId
    if (core.canUserAction(userId, 'update', 'users')) {
        const lastvisitDate = req.body.lastvisitDate
        lastResetTime = req.body.lastResetTime,
            password = req.body.password,
            saltRounds = 10,
            updQuery = req.body

        if (password) {
            try {
                const passHash = await bcrypt.hash(password, saltRounds)
                updQuery['password'] = passHash
            } catch (error) {
                return res.status(500).json({
                    error: error.message
                })
            }
        }

        if (lastvisitDate == null || lastvisitDate == undefined) {
            updQuery['lastvisitDate'] = '0000-00-00 00:00:00'
        }

        if (lastResetTime == null || lastResetTime == undefined) {
            updQuery['lastResetTime'] = '0000-00-00 00:00:00'
        }

        const userUpdQuery = JSON.stringify({
            'fields': helper.formatDatesInObject(updQuery, 'YYYY-MM-DD HH:mm:ss'),
            'uniqueFields': ['username', 'email']
        }),
            response = await DBase.update('eielu_users', userUpdQuery)
        return res.status(200).json(response)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-user', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван POST-метод /create-user');
    const userId = req.userId

    if (core.canUserAction(userId, 'create', 'users')) {
        const { password } = req.body,
            saltRounds = 10,
            createQuery = req.body
        try {
            const passHash = await bcrypt.hash(password, saltRounds)
            createQuery['password'] = passHash
            createQuery['registerDate'] = helper.getDateTimeNow()

            const createUserQuery = JSON.stringify({
                'queryFields': createQuery,
                'requiredFields': ['username', 'password', 'firstName', 'lastName', 'email', 'telegram', 'role', 'officeId', 'state'],
                'uniqueFields': ['username', 'email']
            }),
                response = JSON.parse(await DBase.create('eielu_users', createUserQuery)),
                { result: responseResult, resultText: responseText, resultData: responseData } = response
            if (responseResult == 'success') {
                return res.status(201).json({
                    id: responseData[0].insertId,
                    message: responseText
                })
            }
            if (responseResult == 'error') {
                return res.status(500).json({
                    error: responseText,
                    errorData: responseData
                })
            }
        } catch (error) {
            return res.status(500).json({
                error: error.message
            })
        }
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// EXCHANGES ENDPOINTS
app.get('/exchanges', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /exchanges: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'exchange')) {
        const requestQuery = req.query,
            query = JSON.stringify(requestQuery),
            response = await DBase.read('exchange', query),
            range = requestQuery.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/exchange', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /exchange: ', req.query);
    const userId = req.userId

    if (core.canUserAction(userId, '', 'exchange')) {
        const requestQuery = req.query,
            query = JSON.stringify(requestQuery),
            response = await DBase.read('exchange', query),
            range = requestQuery.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)

    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

/* app.get('/exchange/:id', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /exchange/:id с параметрами: ', req.params);
    const id = req.params.id,
        userId = req.userId
    if (core.canUserAction(userId, 'read', 'exchange')) {
        const exchange = await core.getExchange(id)
        return res.status(200).json(exchange)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
}) */

app.get('/exchanges/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /exchange/:id с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'exchange')) {
        const query = JSON.stringify({ filter: req.params }),
            response = await DBase.read('exchange', query),
            record = response.records[0]

        return res.status(200).json(record)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-exchange', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Поступил POST запрос на создание биржи: ', req.body);
    const userId = req.userId

    if (core.canUserAction(userId, 'create', 'exchange')) {
        const query = JSON.stringify({
            'queryFields': JSON.stringify(req.body),
            'requiredFields': ['title', 'currencies', 'state'],
            'uniqueFields': ['title']
        }),
            response = JSON.parse(await DBase.create('exchange', query)),
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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});

app.put('/exchanges/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван PUT-метод /exchanges. Запрос /exchanges/:id с параметрами: ', req.body);
    const userId = req.userId

    if (core.canUserAction(userId, 'update', 'exchange')) {
        const updQuery = { ...req.body }
        updQuery.checked_out_time = '0000-00-00 00:00:00'
        const updExchangeQuery = JSON.stringify({
            'fields': JSON.stringify(updQuery)
        }),
            response = await DBase.update('exchange', updExchangeQuery)
        return res.status(200).json(response)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// OFFICES ENDPOINTS
app.get('/office', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /office с параметрами: ', req.params);
    const filter = JSON.parse(req.query.filter)
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'offices')) {
        const office = await core.getOffice(filter.id),
            range = office.length
        res.setHeader('content-range', range);
        return res.status(200).json(office)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/offices', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /offices: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'office')) {
        const requestQuery = req.query,
            query = JSON.stringify(requestQuery),
            response = await DBase.read('office', query),
            range = requestQuery.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/offices/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /officess/:id с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'office')) {
        const query = JSON.stringify({ filter: req.params }),
            response = await DBase.read('office', query),
            record = response.records[0]

        return res.status(200).json(record)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/offices/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван PUT-метод /offices. Запрос /offices/:id с параметрами: ', req.body);
    const userId = req.userId
    if (core.canUserAction(userId, 'update', 'offices')) {
        const query = JSON.stringify({
            'fields': JSON.stringify(req.body)
        }),
            response = await DBase.update('office', query)
        return res.status(200).json(response)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-office', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Поступил POST запрос на создание офиса: ', req.body);
    const userId = req.userId

    if (core.canUserAction(userId, 'create', 'office')) {
        const query = JSON.stringify({
            'queryFields': JSON.stringify(req.body),
            'requiredFields': ['title', 'address', 'phone', 'state'],
            'uniqueFields': ['title', 'address', 'phone']
        })

        const response = JSON.parse(await DBase.create('office', query)),
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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});
// ---


// BOTS ENDPOINTS
app.get('/bots', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /bots: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'bots')) {
        const requestQuery = req.query,
            query = JSON.stringify(requestQuery),
            response = await DBase.read('eielu_bot_bot', query),
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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/bots/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /bots/:id с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'bots')) {
        const query = JSON.stringify({ filter: req.params }),
            response = await DBase.read('eielu_bot_bot', query),
            record = response.records[0]

        if (record) {
            if ('apikey' in record && 'apisecret' in record) {
                record.api_ready = 1
            } else {
                record.api_ready = 0
            }
        }

        /* if ('apikey' in record) {
            delete record.apikey
        }
        if ('apisecret' in record) {
            delete record.apisecret
        }
        if ('apipassword' in record) {
            delete record.apipassword
        } */

        return res.status(200).json(record)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/bots/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван PUT-метод /bots. Тело запроса /bots/:id: ', req.body);
    const userId = req.userId
    if (core.canUserAction(userId, 'update', 'bots')) {
        const updQuery = { ...req.body },
            botId = parseInt(req.params.id),
            botState = parseInt(updQuery.state)
        let botUpdstatus = true,
            botPairsUpdStatus = true,
            generalUpdStatus = true,
            redis_publish = false,
            redis_targetBotState = '',
            redis_status = ''

        delete updQuery.api_ready

        updQuery.checked_out_time = '0000-00-00 00:00:00'

        const checkBotQuery = JSON.stringify({
            filter: { id: botId }
        }),
            checkBotResponse = await DBase.read('eielu_bot_bot', checkBotQuery),
            botToUpd = checkBotResponse.records[0]

        if (botToUpd) {
            if (botToUpd.state == botState) {
                const botParamsNamesEqualPairsParamsNames = helper.getBotParamsNamesEqualPairParamsNames()

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
                    const botPairsUpdResponse = await DBase.update('eielu_bot_pair', botPairsQuery)

                    if (botPairsUpdResponse.status !== true) {
                        botPairsUpdStatus = false
                    }
                }
            } else {
                if (botState === 1 || botState === 2) {
                    const setPauseStartEndResponse = await setPauseStartEnd('bot', botId, botState)
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

            const botQuery = JSON.stringify({
                'fields': helper.formatDatesInObject(updQuery, 'YYYY-MM-DD HH:mm:ss')
            })

            const botUpdResponse = await DBase.update('eielu_bot_bot', botQuery)

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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-bot', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Поступил POST запрос на создание бота: ', req.body);
    const userId = req.userId

    if (core.canUserAction(userId, 'create', 'bot')) {
        const crtQuery = { ...req.body }
        crtQuery.checked_out_time = '0000-00-00 00:00:00'
        crtQuery.created = helper.getDateTimeNow()
        const crtBotQuery = JSON.stringify({
            'queryFields': JSON.stringify(crtQuery),
            'requiredFields': ['title', 'exchange', 'client_id', 'state'],
            'uniqueFields': ['title']
        })

        const response = JSON.parse(await DBase.create('eielu_bot_bot', crtBotQuery)),
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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});
// ---


// PAIRS ENDPOINTS
app.get('/pairs', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /pairs: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'pairs')) {
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

            const botsByExchangeId = await DBase.read('eielu_bot_bot', JSON.stringify(botsQuery)),
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
            response = await DBase.read('eielu_bot_pair', query),
            records = response.records,
            totalRows = response.totalRows

        const promises = records.map(async (record) => {
            const queryBot = JSON.stringify({
                filter: {
                    "id": record.bot_id
                },
            })
            const botResponse = await DBase.read('eielu_bot_bot', queryBot);
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
            const ordersOpenedResponse = await DBase.read('eielu_bot_grid', queryOrdersOpened);

            const inTradesQuery = JSON.stringify({
                filter: {
                    "pair_id": record.id,
                    "order_done": 1,
                    "sell_done": 0
                },
                expression: 'sum(qty_usd) as inTrades'
            });
            const inTradesResponse = await DBase.read('eielu_bot_grid', inTradesQuery);

            const queryProfit = JSON.stringify({
                filter: {
                    "pair_id": record.id,
                    "sell_done": 1
                },
                expression: 'sum(sell_qty * sell_price - price * qty) as profit'
            })
            const profitResponse = await DBase.read('eielu_bot_grid', queryProfit);

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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/pairs/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /pairs/:id с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'pairs')) {
        const query = JSON.stringify({ filter: req.params }),
            response = await DBase.read('eielu_bot_pair', query)

        if (response.records && response.records.length > 0) {
            record = response.records[0]

            const pairBotId = record.bot_id
            if (pairBotId) {
                const queryBot = JSON.stringify({
                    filter: {
                        "id": pairBotId
                    },
                })
                const botResponse = await DBase.read('eielu_bot_bot', queryBot);
                const bot = botResponse.records[0];
                if (bot) {
                    const queryExchange = JSON.stringify({
                        filter: {
                            "id": bot.exchange_id
                        },
                    })
                    const exchangeResponse = await DBase.read('exchange', queryExchange);
                    record.exchange_id = exchangeResponse.records[0] ? exchangeResponse.records[0].id : null
                }
            }
            return res.status(200).json(record)
        } else {
            return res.status(404).json({ error: 'No data found' })
        }
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/pairs/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван PUT-метод /pairs. Тело запроса /pairs/:id: ', req.body);
    const userId = req.userId
    if (core.canUserAction(userId, 'update', 'pairs')) {
        const updQuery = { ...req.body },
            pairId = parseInt(req.params.id),
            pairState = parseInt(updQuery.state)
        let generalUpdStatus = true,
            redis_publish = false,
            redis_targetPairState = '',
            redis_status = ''

        updQuery.checked_out_time = '0000-00-00 00:00:00'

        const checkPairQuery = JSON.stringify({
            filter: { id: pairId }
        }),
            checkPairResponse = await DBase.read('eielu_bot_pair', checkPairQuery),
            pairToUpd = checkPairResponse.records[0]

        if (pairState !== pairToUpd.state) {
            if (pairState === 1 || pairState === 2) {
                const setPauseStartEndResponse = await setPauseStartEnd('pair', pairId, updQuery.state)
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

        const query = JSON.stringify({
            'fields': helper.formatDatesInObject(updQuery, 'YYYY-MM-DD HH:mm:ss')
        })

        const response = await DBase.update('eielu_bot_pair', query)

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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-pair', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Поступил POST запрос на создание пары: ', req.body);
    const userId = req.userId

    if (core.canUserAction(userId, 'create', 'pair')) {
        const reqObject = req.body
        const query = JSON.stringify({
            'queryFields': JSON.stringify(reqObject),
            'requiredFields': ['symbol', 'bot_id', 'state'],
            'uniqueFields': []
        }),
            response = JSON.parse(await DBase.create('eielu_bot_pair', query)),
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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});
// ---


// STATES ENDPOINTS
app.get('/states', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /states: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'states')) {
        const requestQuery = req.query,
            query = JSON.stringify(requestQuery),
            response = await DBase.read('states', query),
            range = requestQuery.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/states/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /states/:id ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'states')) {
        const query = JSON.stringify({ filter: req.params }),
            response = await DBase.read('states', query),
            record = response.records[0]

        return res.status(200).json(record)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// ROLES ENDPOINTS
app.get('/roles', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /roles: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'roles')) {
        const roleQuery = req.query,
            query = JSON.stringify(roleQuery),
            response = await DBase.read('roles', query),
            range = roleQuery.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// TIMEFRAMES ENDPOINTS
app.get('/timeframes', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /timeframes: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'timeframes')) {
        const query = JSON.stringify(req.query),
            response = await DBase.read('timeframes', query),
            range = req.query.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// PERIODS ENDPOINTS
app.get('/periods', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /periods: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'periods')) {
        const query = JSON.stringify(req.query),
            response = await DBase.read('periods', query),
            range = req.query.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
        /* const periods = await core.getPeriods(),
            range = periods.length
        res.setHeader('content-range', range);
        return res.status(200).json(periods) */
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// STRATEGIES ENDPOINTS
app.get('/strategies', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /strategies: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'strategies')) {
        const roleQuery = req.query,
            query = JSON.stringify(roleQuery),
            response = await DBase.read('strategies', query),
            range = roleQuery.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// BOT GRID ENDPOINTS
app.get('/botgrid', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /botgrid: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'botgrid')) {
        const requestQuery = req.query,
            range = requestQuery.range
        const query = JSON.stringify(requestQuery),
            response = await DBase.read('eielu_bot_grid', query),
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})


app.get('/botgrid-by-bot/:id', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /botgrid-by-bot: с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'botgrid')) {
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

            inTradesResponse = await DBase.read('eielu_bot_grid', queryInTrades);
            response.in_trades = inTradesResponse.records[0].inTrades

            const queryProfit = JSON.stringify({
                filter: {
                    "bot_id": elId,
                    "sell_done": 1
                },
                sort: '["id","ASC"]',
                expression: 'sum(sell_qty * sell_price - price * qty) as profit'
            })

            profitResponse = await DBase.read('eielu_bot_grid', queryProfit);
            response.profit = profitResponse.records[0].profit

            return res.status(200).json(response)
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})


app.get('/botgrid-by-pair/:id', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /botgrid-by-pair: с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'botgrid')) {
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

        inTradesResponse = await DBase.read('eielu_bot_grid', queryInOrders);
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

        purchasesResponse = await DBase.read('eielu_bot_grid', queryPurchases);
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

        salesResponse = await DBase.read('eielu_bot_grid', querySales);
        response.sales = salesResponse.records[0].sales

        return res.status(200).json(response)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---

// ORDERS ENDPOINTS
app.get('/orders/', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /orders: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'botgrid')) {
        try {
            const requestQuery = req.query,
                range = requestQuery.range
            const query = JSON.stringify(requestQuery),
                response = await DBase.read('eielu_bot_grid', query),
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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// PAUSES ENDPOINTS
app.get('/bot_pause/', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /bot_pause/ с параметрами: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'bot_pause')) {
        const query = JSON.stringify(req.query),
            response = await DBase.read('eielu_bot_pause', query),
            range = req.query.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
// ---


// WHITELIST ENDPOINTS
app.get('/whitelist/', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /whitelist/ с параметрами: ', req.query);
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'whitelist')) {
        const query = JSON.stringify(req.query),
            response = await DBase.read('whitelist', query),
            range = req.query.range,
            records = response.records,
            totalRows = response.totalRows

        res.setHeader('content-range', `${range}/${totalRows}`);
        return res.status(200).json(records)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/whitelist/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван GET-метод. Запрос /whitelist/:id с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'whitelist')) {
        const query = JSON.stringify({ filter: req.params }),
            response = await DBase.read('whitelist', query),
            record = response.records[0]

        return res.status(200).json(record)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-whitelist', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Поступил POST запрос на создание whitelist: ', req.body);
    const userId = req.userId

    if (core.canUserAction(userId, 'create', 'whitelist')) {
        const query = JSON.stringify({
            'queryFields': JSON.stringify(req.body),
            'requiredFields': ['symbol'],
            'uniqueFields': ['symbol']
        }),
            response = JSON.parse(await DBase.create('whitelist', query)),
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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
});

app.put('/whitelist/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван PUT-метод /whitelist. Запрос /whitelist/:id с параметрами: ', req.body);
    const userId = req.userId
    if (core.canUserAction(userId, 'update', 'whitelist')) {
        const query = JSON.stringify({
            'fields': JSON.stringify(req.body)
        }),
            response = await DBase.update('whitelist', query)
        return res.status(200).json(response)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
//---


// CCTX ENDPOINTS
app.get('/cctx/:params', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /cctx/ с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'update', 'whitelist')) {
        const cctxQuery = JSON.parse(req.params.params)
        console.log('cctxQueryParams: ', cctxQuery);
        if (cctxQuery.exchangeId) {
            if (cctxQuery.queryDataType == 'candles') {
                const pairSymbol = `${cctxQuery.pairAltCur}/${cctxQuery.pairBaseCur}`
                const queryBot = JSON.stringify({
                    filter: {
                        id: cctxQuery.botId
                    }
                })
                const responseBot = await DBase.read('eielu_bot_bot', queryBot)
                if (responseBot.records.length > 0) {
                    const bot = responseBot.records[0]
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
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})
//---


const port = 3003;
https.createServer(options, app).listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});