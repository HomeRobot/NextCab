const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const mysql = require('mysql2')
const config = require('./config')
const RBAC = require('./roles')
const core = require('./core')

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

    console.log('Проверка токена (функция verifyToken): ' + token)
    jwt.verify(token, config.secretKey, (err, decoded) => {
        if (err) {
            console.log(err)
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
    console.log('Вызван GET-метод');
    console.log('Запрос /users с параметрами: ', req.params);
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
    console.log('Вызван GET-метод /users');
    console.log('Запрос /users/:id с параметрами: ', req.params);
    const id = req.params.id,
        userId = req.userId
    if (core.canUserAction(userId, 'getList', 'users')) {
        const user = await core.getUser(id)
        // res.setHeader('content-range', 1);
        return res.status(200).json({
            'id': user[0].id,
            'data': user
        })
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.put('/users/:id', verifyToken, async (req, res) => {
    console.log('Вызван PUT-метод /users');
    console.log('Запрос /users/:id с параметрами: ', req.body);
    const id = req.params.id,
        userId = req.userId,
        dataNew = req.body

    if (core.canUserAction(userId, 'getList', 'users')) {
        const user = await core.updateUser(id, dataNew)
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
    const userId = req.userId
    if (core.canUserAction(userId, 'read', 'users')) {
        const user = core.getUser(userId)
        return res.status(200).json(JSON.stringify(user))
    } else {
        return res.status(403).json({ error: 'No permissions' });
    }
})

app.get('/exchanges', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод');
    console.log('Запрос /users с параметрами: ', req.params);
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


app.get('/bots', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод');
    console.log('Запрос /users с параметрами: ', req.params);
    const userId = req.userId
    if (core.canUserAction(userId, 'getList', 'bot')) {
        const users = await core.getBotList(),
            range = users.length
        res.setHeader('content-range', range);
        return res.status(200).json(users)
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


app.get('/offices', verifyToken, async (req, res) => {
    console.log('Вызван GET-метод');
    console.log('Запрос /users с параметрами: ', req.params);
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


app.post('/createoffice', verifyToken, async (req, res) => {
    console.log('Поступил запрос на создание офиса: ', req.body);
    const { title, address, phone, state } = req.body;

    if (!title || !address || !phone || !state) {
        return res.status(400).json({ error: 'Please provide all required fields' });
    }

    const office = { title, address, phone, state };
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

const port = 3003;
app.listen(port, () => {
    console.log(`Сервер запущен на порте ${port}`);
});