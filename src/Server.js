const ws = require('ws');
const randomID = require('random-id');

class Server extends ws.Server {
    constructor(port, debug = false) {
        super({ port });

        this.serverID === randomID();

        this.debug = debug;
        this.activeClients = new Map();

        this.on('listening', async () => console.log(`Opened server on port ${port}`));

        this.on('error', async (error) => console.error(error));

        this.on('connection', async (client) => {
            client.serverSessionID = randomID();
            client.auth = {};
            client.lastPing = null;
            client.pingTimeout = null;
            
            this.activeClients.set(client.serverSessionID, client);

            await this.send(client, {
                // code 0 - hello
                code: 0,
                data: {
                    sessionID: client.serverSessionID,
                    pingInterval: 45
                }
            });

            if (this.debug) console.debug(`Client logged in, session ID is ${client.serverSessionID}`);

            client.on('message', async (str) => {
                const data = JSON.parse(str);
                return this.message(client, data);
            });

            client.on('close', async () => {
                const user = this.activeClients.get(client.serverSessionID);

                if (this.debug) console.debug(`Client logged off, session ID was ${client.serverSessionID}`);

                await this.broadcast(this.serverID, {
                    username: user.auth.username
                    // ev 3 - user logged off
                }, 3);

                return this.activeClients.delete(client.serverSessionID);
            });
        });
    }

    async send(client, data) {
        return client.send(JSON.stringify(data));
    }

    async broadcast(sender, data, ev = null) {
        this.activeClients.forEach(async (cli) => {
            if (!cli.serverSessionID) return false;

            if (cli.serverSessionID === this.serverID) return false;
            if (cli.serverSessionID === sender) return false;

            await this.send(cli, {
                // code 5 - data
                code: 5,
                ev,
                data
            });
        });
    }

    async message(client, { code, data, ev = null }) {
        // code 1 - authorize
        if (code === 1) {
            const auth = {
                username: data.username,
                uniqueAuth: data.uniqueAuth,
                joinedAt: Date.now()
            }

            this.activeClients.get(client.serverSessionID).auth = auth;

            await this.send(client, {
                // code 2 - authorized
                code: 2, data: auth
            });

            await this.broadcast(this.serverID, {
                username: auth.username
                // ev 2 - user logged on
            }, 2);
        }

        // code 3 - ping
        if (code === 3) {
            this.activeClients.get(client.serverSessionID).lastPing = Date.now();

            clearTimeout(this.activeClients.get(client.serverSessionID).pingTimeout);

            await this.send(client, {
                // code 4 - ping acknowledged
                code: 4, data: {}
            });

            if (this.debug) console.debug(`Ping received from ${client.serverSessionID}`);

            this.activeClients.get(client.serverSessionID).pingTimeout = setTimeout(async () => {
                const user = this.activeClients.get(client.serverSessionID);
                if (!user) return;

                await this.broadcast(data.sessionID, {
                    username: user.auth.username
                    // ev 3 - user logged off
                }, 3);

                this.activeClients.delete(client.serverSessionID);
                client.close();
            }, 50 * 1000);
        }

        // code 5 - data
        if (code === 5) {
            // ev 1 - message
            if (ev === 1) {
                await this.broadcast(data.sessionID, {
                    username: this.activeClients.get(data.sessionID).auth.username,
                    content: data.content
                    // ev 1 - message
                }, 1);
            }
        }

        // code 6 - data request/receive
        if (code === 6) {
            // ev 1 - requesting online users
            if (ev === 1) {
                const users = [...this.activeClients.values()].map((x) => x.auth.username);

                await this.send(client, {
                    // code 6 - data request/receive
                    code: 6,
                    // ev 1 - requesting online users
                    ev: 1,
                    data: {
                        users
                    }
                });
            }
        }
    }
}

module.exports = Server;