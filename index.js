const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const mysql = require('mysql2')
const config = require('./config')
const RBAC = require('./roles')
const core = require('./core')
const helper = require('./helper')

const app = express();
app.use(bodyParser.json());
// Включение CORS для всех маршрутов
app.use(cors({ exposedHeaders: ['content-range'] }));

// Подключение к базе данных MySQL
const db = mysql.createPool({
    user: config.DB_USERNAME,
    database: config.DB_DATABASE,
    host: config.DB_HOST,
    password: config.DB_PASSWORD
})

// Маршруты для создания пользователя и авторизации
app.post('/register', (req, res) => {
    console.log('Поступил запрос на регистрацию: ', req.body);
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

        const user = { username, password: hash, email, role: 'client' };
        db.query('INSERT INTO users SET ?', user, (err, result) => {
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

    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
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
                return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
            }
            const userRole = user.role,
                userPermissions = RBAC.roles[userRole];

            // Создание JWT токена
            const token = jwt.sign({
                userId: user.id,
                role: user.role
            }, config.secretKey, { expiresIn: '1h' });

            console.log('Токен: ' + token);

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
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    // console.log('Проверка токена (функция verifyToken): ' + token)
    jwt.verify(token, config.secretKey, (err, decoded) => {
        if (err) {
            console.log('Токен не прошел проверку', err)
            return res.status(500).json({ error: 'Ошибка при проверке токена' });
        }

        const currentTime = Math.floor(Date.now() / 1000); // Текущее время в секундах
        if (decoded.exp < currentTime) {
            return res.status(401).json({ error: 'Токен истек' });
        }

        // Декодированные данные из токена, содержащие идентификатор пользователя (userId)
        req.userId = decoded.userId;
        next();
    });
}

app.get('/users', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /users с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'users')) {
        const users = await core.getUserList(),
            range = users.length
        res.setHeader('content-range', range);
        return res.status(200).json(users)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/users/:id', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод /users. Запрос /users/:id с параметрами: ', req.params);
    const id = req.params.id,
        userId = req.userId
    if (core.canUserAction(userId, 'getList', 'users')) {
        const users = await core.getUser(id)
        console.log('Это результат вызова функции core.getUser', users)
        if (typeof users == Array) {
            const range = users.length
            res.setHeader('content-range', range);
        }
        return res.status(200).json(users)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/users/:id', verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод /users. Запрос /users/:id с параметрами: ', req.body);
    const id = req.params.id,
        userId = req.userId,
        dataNew = req.body

    if (core.canUserAction(userId, 'getList', 'users')) {
        const dataToUpdate = helper.formatDatesInObject(dataNew, 'YYYY-MM-DD HH:mm:ss')
        const user = await core.updateUser(id, dataToUpdate)
        return res.status(200).json({
            'id': userId,
            'procedure': 'updated',
            'status': 'updated'
        })
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/user', verifyToken, (req, res) => {
    console.log('Вызван GET-метод. Запрос /user с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'users')) {
        const user = core.getUser(userId)
        console.log(user)
        return res.status(200).json(JSON.stringify(user))
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-user', verifyToken, async (req, res) => {
    console.log('Вызван POST-метод /create-user');
    const userId = req.userId,
        userRole = await core.getUserRole(userId)
    console.log(req.body);

    const { username, password, firstName, lastName, email, telegram, role, officeId, state } = req.body

    if (userRole !== 1) {
        return res.status(403).json({ error: 'No permissions' });
    }

    // Хеширование пароля перед сохранением в базу данных
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            return res.status(500).json({ error: 'Password hash error' });
        }

        const user = { username, password: hash, firstName, lastName, email, telegram, role, officeId, state };
        db.query('INSERT INTO users SET ?', user, (err, result) => {
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
})

app.get('/exchanges', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /exchanges с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'exchange')) {
        const users = await core.getExchangeList(),
            range = users.length
        res.setHeader('content-range', range);
        return res.status(200).json(users)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/exchange', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /exchange с параметрами: ', req.params);
    const filter = JSON.parse(req.query.filter)
    const userId = req.userId
    console.log(filter)
    if (core.canUserAction(userId, 'read', 'exchange')) {
        const exchange = await core.getExchange(filter.id),
            range = exchange.length
        res.setHeader('content-range', range);
        return res.status(200).json(exchange)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/exchange/:id', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /exchange/:id с параметрами: ', req.params);
    const id = req.params.id,
        userId = req.userId
    if (core.canUserAction(userId, 'read', 'exchange')) {
        const exchange = await core.getExchange(id)
        return res.status(200).json(exchange)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/exchanges/:id', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /exchange/:id с параметрами: ', req.params);
    const id = req.params.id,
        userId = req.userId
    if (core.canUserAction(userId, 'read', 'exchange')) {
        const exchange = await core.getExchange(id)
        return res.status(200).json(exchange)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-exchange', verifyToken, async (req, res) => {
    console.log('Поступил запрос на создание биржи: ', req.body);
    const { title, currencies, state } = req.body;

    if (!title || !currencies || !state) {
        return res.status(400).json({ error: 'Please provide all required fields' });
    }

    const exchange = { title, currencies, state };
    db.query('INSERT INTO exchange SET ?', exchange, (err, result) => {
        if (err) {
            console.error('Ошибка при создании биржи:', err);
            return res.status(500).json({ error: 'Error while creating exchange' });
        }
        return res.status(201).json({
            id: result.insertId,
            message: 'Exchange created successfully'
        });
    });
});


app.put('/exchanges/:id', verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод /exchanges. Запрос /exchanges/:id с параметрами: ', req.body);
    const id = req.params.id,
        userId = req.userId,
        dataNew = req.body

    if (core.canUserAction(userId, 'getList', 'office')) {
        const exchange = await core.updateExchange(id, dataNew)
        return res.status(200).json({
            'id': id,
            'procedure': 'updated',
            'status': 'updated'
        })
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/bots', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /bots с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'bot')) {
        const users = await core.getBotList(),
            range = users.length
        console.log(range)
        res.setHeader('Content-Range', 10);
        return res.status(200).json(users)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/bots/:id', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /bots/:id с параметрами: ', req.params);
    const id = req.params.id,
        userId = req.userId
    if (core.canUserAction(userId, 'read', 'bots')) {
        const bots = await core.getBot(id)
        return res.status(200).json(bots)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/me', verifyToken, (req, res) => {
    const userId = req.userId;

    db.query('SELECT id, username, firstName, lastName, avatar, email, telegram, lastVisit, registrationDate, role FROM users WHERE id = ?', [userId], (err, results) => {
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

app.delete('/users/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    console.log('Поступил запрос на удаление пользователя: ', req.params);

    if (!id) {
        return res.status(400).json({ error: 'Please provide an id' });
    }

    const query = `DELETE FROM users WHERE id = ?`;
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Ошибка при удалении элемента:', err);
            return res.status(500).json({ error: 'Error while deleting user' });
        }
        return res.status(200).json({ message: 'User deleted successfully' });
    });
});

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
    console.log('Вызван GET-метод. Запрос /offices с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'office')) {
        const offices = await core.getOfficesList(),
            range = offices.length
        res.setHeader('content-range', range);
        return res.status(200).json(offices)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/offices/:id', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /officess/:id с параметрами: ', req.params);
    const id = req.params.id,
        userId = req.userId
    if (core.canUserAction(userId, 'read', 'office')) {
        const office = await core.getOffice(id)
        return res.status(200).json(office)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/offices/:id', verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод /offices. Запрос /offices/:id с параметрами: ', req.body);
    const id = req.params.id,
        userId = req.userId,
        dataNew = req.body

    if (core.canUserAction(userId, 'getList', 'office')) {
        const user = await core.updateOffice(id, dataNew)
        return res.status(200).json({
            'id': userId,
            'procedure': 'updated',
            'status': 'updated'
        })
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.post('/create-office', verifyToken, async (req, res) => {
    console.log('Поступил запрос на создание офиса: ', req.body);
    const { title, address, phone, url, state } = req.body;

    if (!title || !address || !phone || !state) {
        return res.status(400).json({ error: 'Please provide all required fields' });
    }

    const office = { title, address, phone, url, state };
    db.query('INSERT INTO office SET ?', office, (err, result) => {
        if (err) {
            console.error('Ошибка при создании офиса:', err);
            return res.status(500).json({ error: 'Error while creating office' });
        }
        return res.status(201).json({
            id: result.insertId,
            message: 'Office created successfully'
        });
    });
});

app.get('/states', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /states с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'states')) {
        const states = await core.getStatesList(),
            range = states.length
        res.setHeader('content-range', range);
        return res.status(200).json(states)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/roles', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /roles с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'roles')) {
        const states = await core.getRolesList(),
            range = states.length
        res.setHeader('content-range', range);
        return res.status(200).json(states)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/timeframes', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /timeframes с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'roles')) {
        const timeframes = await core.getTimeFrames(),
            range = timeframes.length
        res.setHeader('content-range', range);
        return res.status(200).json(timeframes)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/periods', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод. Запрос /periods с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'roles')) {
        const periods = await core.getPeriods(),
            range = periods.length
        res.setHeader('content-range', range);
        return res.status(200).json(periods)
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

const port = 3003;
app.listen(port, () => {
    console.log(`Сервер запущен на порте ${port}`);
});