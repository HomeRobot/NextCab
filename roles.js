const roles = {
    'admin': [
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'users' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'clients' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'bots' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'pairs' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'offices' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'exchanges' },
    ],
    'manager': [
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'clients' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'bots' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'pairs' },
    ],
    'client': [
        { 'action': ['read', 'update', 'changeState', 'getList'], 'resource': 'bots' },
        { 'action': ['read', 'update', 'changeState', 'create', 'getList'], 'resource': 'pairs' },
    ]
}

module.exports = {
    roles
}