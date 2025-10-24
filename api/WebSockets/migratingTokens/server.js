const WebSocket = require('ws');
const http = require('http');

class MigratingTokensWebSocketServer {
  constructor(port = 4002) {
    this.port = port;
    this.clients = new Set();
    this.server = null;
    this.wss = null;
    this.pumpPortalWs = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;

    this.setupServer();
    this.connectToPumpPortal();
  }

  setupServer() {
    this.server = http.createServer();
    this.wss = new WebSocket.Server({
      server: this.server,
      perMessageDeflate: false,
      maxPayload: 16 * 1024 * 1024 // 16MB
    });

    this.wss.on('connection', (ws, req) => {
      console.log(`New client connected from ${req.socket.remoteAddress}`);
      this.clients.add(ws);
      ws.isAlive = true;

      ws.on('close', (code, reason) => {
        console.log(`Client disconnected: ${code} - ${reason}`);
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('Client WebSocket error:', error.message);
        this.clients.delete(ws);
      });

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      try {
        ws.send(JSON.stringify({
          type: 'connection',
          status: 'connected',
          message: 'Connected to Migrating Tokens stream',
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('Error sending connection message:', error.message);
      }
    });

    setInterval(() => { 
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          ws.terminate();
          this.clients.delete(ws);
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.server.listen(this.port, () => {
      console.log(`Migrating Tokens WebSocket server running on port ${this.port}`);
    });
  }

  connectToPumpPortal() {
    console.log('Connecting to PumpPortal...');

    this.pumpPortalWs = new WebSocket('wss://pumpportal.fun/api/data', {
      perMessageDeflate: false
    });

    this.pumpPortalWs.on('open', () => {
      console.log('Connected to PumpPortal');
      this.reconnectAttempts = 0;

      // Subscribe to migration events
      const subscribeMessage = {
        method: 'subscribeMigration'
      };

      this.pumpPortalWs.send(JSON.stringify(subscribeMessage));
      console.log('Subscribed to token migration events');
    });

    this.pumpPortalWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received token migration event');

        // Broadcast to all connected clients
        this.broadcast({
          type: 'migration',
          data: message,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error parsing PumpPortal message:', error.message);
      }
    });

    this.pumpPortalWs.on('error', (error) => {
      console.error('PumpPortal WebSocket error:', error.message);
    });

    this.pumpPortalWs.on('close', () => {
      console.log('Disconnected from PumpPortal');

      // Attempt to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`Reconnecting to PumpPortal in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connectToPumpPortal(), delay);
      } else {
        console.error('Max reconnection attempts reached. Please restart the server.');
      }
    });
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    const deadClients = [];

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('Error sending message to client:', error.message);
          deadClients.push(client);
        }
      } else {
        deadClients.push(client);
      }
    });

    deadClients.forEach(client => this.clients.delete(client));

    if (this.clients.size > 0) {
      console.log(`Broadcasted message to ${this.clients.size} clients`);
    }
  }

  stop() {
    if (this.pumpPortalWs) {
      this.pumpPortalWs.close();
    }

    this.wss.close(() => {
      this.server.close(() => {
        console.log('Migrating Tokens WebSocket server stopped');
      });
    });
  }
}

// Start the server
const server = new MigratingTokensWebSocketServer(4002);

process.on('SIGINT', () => {
  console.log('Shutting down');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down');
  server.stop();
  process.exit(0);
});

module.exports = MigratingTokensWebSocketServer;
