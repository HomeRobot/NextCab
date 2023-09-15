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
app.use(cors());

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
    const { username, password } = req.body;


    if (!username || !password) {
        return res.status(400).json({ error: 'Пожалуйста, заполните все поля' });
    }

    // Хеширование пароля перед сохранением в базу данных
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка хеширования пароля' });
        }

        const user = { username, password: hash };
        db.query('INSERT INTO users SET ?', user, (err, result) => {
            if (err) {
                console.error('Ошибка при создании пользователя:', err);
                return res.status(500).json({ error: 'Ошибка при создании пользователя' });
            }

            return res.status(201).json({ message: 'Пользователь успешно создан' });
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

            /* console.log('Токен: ' + token);
            console.log('user role: ' + userRole);
            console.log('permissons: ' + userPermissions); */

            return res.status(200).json({
                "token": token,
                "permissions": userPermissions,
                "userdata": {
                    "id": user.id,
                    "username": user.username,
                    "role": userRole
                }
            });
        });
    });
});

app.get('/protected', verifyToken, (req, res) => {
    // Маршрут доступен только для авторизованных пользователей
    res.json({ message: 'Это защищенный маршрут. Только авторизованные пользователи могут видеть это.' });
});

function verifyToken(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    jwt.verify(token, config.secretKey, (err, decoded) => {
        if (err) {
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

app.get('/users', verifyToken, (req, res) => {
    const userId = req.userId
    if(core.canUserAction(userId, 'getList', 'users')){
        const users = core.getUserList()
        return res.status(200).json(JSON.stringify(users))
    }
    else{
        return res.status(403).json({ error: 'Недостаточно прав' });
    }
})

app.get('/user', verifyToken, (req, res) => {
    const userId = req.userId
    if(core.canUserAction(userId, 'read', 'users')){
        const user = core.getUser(userId)
        return res.status(200).json(JSON.stringify(user))
    }
    else{
        return res.status(403).json({ error: 'Недостаточно прав' });
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

const port = 3003;
app.listen(port, () => {
    console.log(`Сервер запущен на порте ${port}`);
});