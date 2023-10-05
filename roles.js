const roles = {
    'admin': [
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'users' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'clients' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'bots' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'pairs' },
        { 'action': ['read', 'update', 'changeState', 'delete', 'create', 'getList'], 'resource': 'departments' },
    ],
    'franchisee': [
        { 'action': ['read', 'update', 'changeState'], 'resource': 'clients' },
        { 'action': ['read', 'update', 'changeState', 'create', 'getList'], 'resource': 'bots' },
        { 'action': ['read', 'update', 'changeState', 'create', 'getList'], 'resource': 'pairs' },
    ],
    'client': [
        { 'action': ['read', 'update', 'changeState', 'getList'], 'resource': 'bots' },
        { 'action': ['read', 'update', 'changeState', 'create', 'getList'], 'resource': 'pairs' },
    ]
}

module.exports = {
    roles
}