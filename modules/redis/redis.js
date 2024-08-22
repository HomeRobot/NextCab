
const Redis = require('ioredis');
const config = require('../../config')

// Redis connection
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
    console.log('Redis connection established');
});
redis.on('error', function (err) {
    console.error('Redis error:', err);
});
redis.on('ready', () => {
    console.log('Redis client is ready to work');
});
redisSub.on("message", (channel, message) => {
    console.log('redisSub message: ', channel, message)
})



module.exports = {
    redis,
    redisSub
}