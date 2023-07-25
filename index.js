const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql');

const app = express();
app.use(bodyParser.json());

// Подключение к базе данных MySQL
const dbConfig = {
  host: 'localhost',
  user: 'your_mysql_username',
  password: 'your_mysql_password',
  database: 'your_database_name',
};

const db = mysql.createConnection(dbConfig);
db.connect((err) => {
  if (err) {
    console.error('Ошибка подключения к базе данных:', err);
    return;
  }
  console.log('Подключено к базе данных MySQL');
});

// Маршруты для создания пользователя и авторизации
app.post('/register', (req, res) => {
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

      // Создание JWT токена
      const secretKey = 'your_secret_key';
      const token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '1h' });

      return res.status(200).json({ token });
    });
  });
});

const port = 3000;
app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});