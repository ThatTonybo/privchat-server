const Server = require('./src/Server');

const { port, debug } = require('./config.json');

new Server(port, debug));