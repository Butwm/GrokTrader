const WebSocket = require('ws');
const http = require('http');
const url = require('url');

class TradesWebSocketServer {
  constructor(port = 4001) {
    this.port = port;
    this.clients = new Map();
    this.tokenSubscriptions = new Map();
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
      const params = url.parse(req.url, true).query;
      const tokenAddress = params.token;

      if (!tokenAddress) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Missing token parameter. Connect using: ws://localhost:4001?token=TOKEN_ADDRESS',
          timestamp: Date.now()
        }));
        ws.close(1008, 'Missing token parameter');
        return;
      }

      console.log(`New client connected from ${req.socket.remoteAddress} for token: ${tokenAddress}`);

      ws.isAlive = true;
      this.clients.set(ws, new Set([tokenAddress]));

      if (!this.tokenSubscriptions.has(tokenAddress)) {
        this.tokenSubscriptions.set(tokenAddress, new Set());
        this.subscribeToToken(tokenAddress);
      }
      this.tokenSubscriptions.get(tokenAddress).add(ws);

      ws.on('close', (code, reason) => {
        console.log(`Client disconnected: ${code} - ${reason}`);
        this.removeClient(ws);
      });

      ws.on('error', (error) => {
        console.error('Client WebSocket error:', error.message);
        this.removeClient(ws);
      });

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      try {
        ws.send(JSON.stringify({
          type: 'connection',
          status: 'connected',
          message: `Subscribed to trades for token: ${tokenAddress}`,
          token: tokenAddress,
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
          this.removeClient(ws);
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.server.listen(this.port, () => {
      console.log(`Trades WebSocket server running on http://localhost:${this.port}`);
    });
  }

  removeClient(ws) {
    const tokens = this.clients.get(ws);
    if (tokens) {
      tokens.forEach(token => {
        const subscribers = this.tokenSubscriptions.get(token);
        if (subscribers) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            this.unsubscribeFromToken(token);
            this.tokenSubscriptions.delete(token);
            console.log(`No more subscribers for token ${token}, unsubscribed`);
          }
        }
      });
    }
    this.clients.delete(ws);
  }

  connectToPumpPortal() {
    console.log('Connecting to PumpPortal...');

    this.pumpPortalWs = new WebSocket('wss://pumpportal.fun/api/data', {
      perMessageDeflate: false
    });

    this.pumpPortalWs.on('open', () => {
      console.log('Connected to PumpPortal');
      this.reconnectAttempts = 0;

      const tokens = Array.from(this.tokenSubscriptions.keys());
      if (tokens.length > 0) {
        this.subscribeToTokens(tokens);
      }
    });

    this.pumpPortalWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        const tokenAddress = message.mint || message.token || message.address;

        if (tokenAddress) {
          console.log(`Received trade for token: ${tokenAddress}`);

          this.broadcastToToken(tokenAddress, {
            type: 'trade',
            token: tokenAddress,
            data: message,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error('Error parsing PumpPortal message:', error.message);
      }
    });

    this.pumpPortalWs.on('error', (error) => {
      console.error('PumpPortal WebSocket error:', error.message);
    });

    this.pumpPortalWs.on('close', () => {
      console.log('Disconnected from PumpPortal');

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

  subscribeToToken(tokenAddress) {
    if (this.pumpPortalWs && this.pumpPortalWs.readyState === WebSocket.OPEN) {
      const subscribeMessage = {
        method: 'subscribeTokenTrade',
        keys: [tokenAddress]
      };
      this.pumpPortalWs.send(JSON.stringify(subscribeMessage));
      console.log(`Subscribed to trades for token: ${tokenAddress}`);
    }
  }

  subscribeToTokens(tokenAddresses) {
    if (this.pumpPortalWs && this.pumpPortalWs.readyState === WebSocket.OPEN) {
      const subscribeMessage = {
        method: 'subscribeTokenTrade',
        keys: tokenAddresses
      };
      this.pumpPortalWs.send(JSON.stringify(subscribeMessage));
      console.log(`Subscribed to trades for ${tokenAddresses.length} tokens`);
    }
  }

  unsubscribeFromToken(tokenAddress) {
    if (this.pumpPortalWs && this.pumpPortalWs.readyState === WebSocket.OPEN) {
      const unsubscribeMessage = {
        method: 'unsubscribeTokenTrade',
        keys: [tokenAddress]
      };
      this.pumpPortalWs.send(JSON.stringify(unsubscribeMessage));
      console.log(`Unsubscribed from trades for token: ${tokenAddress}`);
    }
  }

  broadcastToToken(tokenAddress, message) {
    const messageStr = JSON.stringify(message);
    const subscribers = this.tokenSubscriptions.get(tokenAddress);

    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const deadClients = [];

    subscribers.forEach((client) => {
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

    deadClients.forEach(client => this.removeClient(client));

    console.log(`Broadcasted trade to ${subscribers.size} clients for token ${tokenAddress}`);
  }

  stop() {
    if (this.pumpPortalWs) {
      this.pumpPortalWs.close();
    }

    this.wss.close(() => {
      this.server.close(() => {
        console.log('Trades WebSocket server stopped');
      });
    });
  }
}

const server = new TradesWebSocketServer(4001);

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  server.stop();
  process.exit(0);
});

module.exports = TradesWebSocketServer;
