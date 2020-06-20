const Server = require('./src/Server');
const args = require('yargs-parser')(process.argv);

const { port: confPort, debug } = require('./config.json');

let port = args.port || args.p || confPort || 8080;

new Server(port, debug);