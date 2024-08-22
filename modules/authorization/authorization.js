const bcrypt = require('bcrypt')
const config = require('../../config')
const { db, DBase, DBPrefix } = require('../DB/db')
const helper = require('../../helper')
const RBAC = require('../../roles')
const jwt = require('jsonwebtoken')

const userLogin = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        console.log('No username or password');
        return res.status(400).json({ error: 'Please fill all fields' });
    }

    db.query(`SELECT * FROM ${DBPrefix}users WHERE username = ?`, [username], async (err, results) => {
        if (err) {
            console.error('DB response error:', err);
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

                // JWT token creation
                const token = jwt.sign({
                    userId: user.id,
                    role: user.role
                }, config.secretKey, { expiresIn: '10min' });

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
}

const userLogout = async (req, res) => {
    const { username, userId } = req.body;
    if (userId) {
        const userQuery = {
            'id': userId,
            'lastvisitDate': helper.getDateTimeNow(),
        }
        const logOutQuery = JSON.stringify({
            'fields': helper.formatDatesInObject(userQuery, 'YYYY-MM-DD HH:mm:ss'),
            'uniqueFields': []
        })

        const response = await DBase.update(`${DBPrefix}users`, logOutQuery)
    }

    return res.status(200).json({
        'action': 'logout',
        'status': 'ok'
    })
}

const userRegistration = async (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Please, fill all fields' });
    }

    // Passord hashing before saving to DB
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            console.error('Password hash error: ', err);
            return res.status(500).json({ error: 'Password hash error' });
        }

        const user = { username, password: hash, email, role: 3 };
        db.query(`INSERT INTO ${DBPrefix}users SET ?`, user, (err, result) => {
            if (err) {
                console.error('User creation error: ', err);
                return res.status(500).json({ error: 'Error while creating user' });
            }
            return res.status(201).json({
                id: result.insertId,
                message: 'User created successfully'
            });
        });
    });
}



module.exports = {
    userLogin,
    userLogout,
    userRegistration,
}