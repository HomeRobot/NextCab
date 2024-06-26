// import text from './constants.json'

const express = require('express')
const https = require('https');
const fs = require('fs');
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

app.post('/login', (req, res) => {
    console.log('Поступил запрос на авторизацию: ', req.body);
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Пожалуйста, заполните все поля' });
    }

    db.query('SELECT * FROM eielu_users WHERE username = ?', [username], (err, results) => {
        if (err) {
            console.error('Ошибка при запросе к базе данных:', err);
            return res.status(500).json({ error: 'Ошибка при запросе к базе данных' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        const user = results[0];
        bcrypt.compare(password, user.password, (bcryptErr, bcryptResult) => {
            if (bcryptErr || !bcryptResult) {
                console.log('bcryptResult' , bcryptResult);
                console.log('bcryptErr' , bcryptErr);
                console.log('user' , user);
                console.log('password' , password);
                console.log('user.password' , user.password);
                return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
            }
            const userRole = user.role,
                userPermissions = RBAC.roles[userRole];

            // Создание JWT токена
            const token = jwt.sign({
                userId: user.id,
                role: user.role
            }, config.secretKey, { expiresIn: '10min' });

            console.log('Токен: ' + token);

            // res.setHeader('Content-Type', 'application/javascript');
            return res.status(200).json({
                "token": token,
                "permissions": userPermissions,
                "uid": user.id,
                "username": user.username,
                "role": userRole
            });
        });
    });
});

app.post('/logout', (req, res) => {
    console.log('Поступил запрос на выход: ', req.body);
    const { username, userId } = req.body;
    // res.header('Access-Control-Allow-Origin', allowedOrigins);
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

/* app.get('/user', verifyToken, (req, res) => {
    console.log('Вызван GET-метод. Запрос /user с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'users')) {
        const user = core.getUser(userId)
        console.log(user)
        return res.status(200).json(JSON.stringify(user))
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
}) */

app.put('/users/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван PUT-метод /users. Запрос /users/:id с параметрами: ', req.body);
    const userId = req.userId
    if (core.canUserAction(userId, 'update', 'users')) {
        const password = req.body.password,
            saltRounds = 10
        if (password) {
            try {
                const passHash = await bcrypt.hash(password, saltRounds),
                    queryFieldsWithHashedPassword = req.body

                queryFieldsWithHashedPassword['password'] = passHash
                const query = JSON.stringify({
                    'fields': helper.formatDatesInObject(queryFieldsWithHashedPassword, 'YYYY-MM-DD HH:mm:ss'),
                    'uniqueFields': ['username', 'email']
                }),
                    response = await DBase.update('eielu_users', query)
                return res.status(200).json(response)
            } catch (error) {
                return res.status(500).json({
                    error: error.message
                })
            }
        } else {
            const query = JSON.stringify({
                'fields': helper.formatDatesInObject(req.body, 'YYYY-MM-DD HH:mm:ss'),
                'uniqueFields': ['username', 'email']
            }),
                response = await DBase.update('eielu_users', query)
            return res.status(200).json(response)
        }
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
            saltRounds = 10
        try {
            const passHash = await bcrypt.hash(password, saltRounds),
                queryFieldsWithHashedPassword = req.body

            queryFieldsWithHashedPassword['password'] = passHash
            const query = JSON.stringify({
                'queryFields': queryFieldsWithHashedPassword,
                'requiredFields': ['username', 'password', 'firstName', 'lastName', 'email', 'telegram', 'role', 'officeId', 'state'],
                'uniqueFields': ['username', 'email']
            }),
                response = JSON.parse(await DBase.create('eielu_users', query)),
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
        const query = JSON.stringify({
            'fields': JSON.stringify(req.body)
        }),
            response = JSON.parse(await DBase.update('exchange', query))
        // const exchange = await core.updateExchange(id, req.body)
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
            excludeFields = 'apikey, apisecret, apipassword',
            excludeFieldsArr = excludeFields.split(', ')

        requestQuery['excludeFields'] = excludeFieldsArr

        const query = JSON.stringify(requestQuery),
            response = await DBase.read('eielu_bot_bot', query),
            range = requestQuery.range,
            records = response.records,
            totalRows = response.totalRows

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

        if ('apikey' in record) {
            delete record.apikey
        }
        if ('apisecret' in record) {
            delete record.apisecret
        }
        if ('apipassword' in record) {
            delete record.apipassword
        }

        return res.status(200).json(record)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/bots/:id', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Вызван PUT-метод /bots. Запрос /bots/:id с параметрами: ', req.body);
    const userId = req.userId
    if (core.canUserAction(userId, 'update', 'bots')) {
        const query = JSON.stringify({
            'fields': helper.formatDatesInObject(req.body, 'YYYY-MM-DD HH:mm:ss')
        }),
            response = await DBase.update('eielu_bot_bot', query)
        return res.status(200).json(response)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-bot', verifyToken, async (req, res) => {
    // Эндпоинт проверен, работает и точно нужен!!!
    console.log('Поступил POST запрос на создание офиса: ', req.body);
    const userId = req.userId

    if (core.canUserAction(userId, 'create', 'bot')) {
        const query = JSON.stringify({
            'queryFields': JSON.stringify(req.body),
            'requiredFields': ['title', 'exchange', 'client_id', 'state'],
            'uniqueFields': ['title']
        })

        const response = JSON.parse(await DBase.create('eielu_bot_bot', query)),
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
            range = requestQuery.range,
            requestExchangeId = filterParsed.exchange_id,
            requestBotId = filterParsed.bot_id
        if (requestExchangeId) {
            const botsQuery = {
                filter: { exchange_id: requestExchangeId }
            },
                excludeFields = 'apikey, apisecret, apipassword',
                excludeFieldsArr = excludeFields.split(', ')

            botsQuery['excludeFields'] = excludeFieldsArr

            const botsByExchangeId = await DBase.read('eielu_bot_bot', JSON.stringify(botsQuery)),
                bots = botsByExchangeId.records
            if (bots.length > 0) {
                const botIdsArrayByExchangeId = bots.map(bot => bot.id),
                    pairsQuery = {
                        filter: { bot_id: botIdsArrayByExchangeId }
                    },
                    response = await DBase.read('eielu_bot_pair', JSON.stringify(pairsQuery))
                // console.log('botsByExchangeId: ', botsByExchangeId);
                console.log('range: ', range);
                records = response.records,
                    totalRows = response.totalRows

                res.setHeader('content-range', `${range}/${totalRows}`);
                return res.status(200).json(records)
            }
        } else {
            const query = JSON.stringify(requestQuery),
                response = await DBase.read('eielu_bot_pair', query),
                records = response.records,
                totalRows = response.totalRows

            res.setHeader('content-range', `${range}/${totalRows}`);
            return res.status(200).json(records)
        }
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
            response = await DBase.read('eielu_bot_pair', query),
            record = response.records[0]

        return res.status(200).json(record)
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
        reqObject['created_by'] = userId
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
            range = query.range,
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
            range = query.range,
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


const port = 3003;
https.createServer(options, app).listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});