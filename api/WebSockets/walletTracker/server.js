const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

class WalletTrackerWebSocketServer {
  constructor(port = 4003) {
    this.port = port;
    this.clients = new Set();
    this.server = null;
    this.wss = null;
    this.pumpPortalWs = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.kols = [];
    this.walletToKolMap = new Map(); // Map wallet address to KOL info

    this.loadKols();
    this.setupServer();
    this.connectToPumpPortal();
  }

  loadKols() {
    try {
      const kolsPath = path.join(__dirname, '../../data/kols.json');
      const kolsData = fs.readFileSync(kolsPath, 'utf8');
      this.kols = JSON.parse(kolsData);

      // Create wallet to KOL mapping for quick lookup  
      this.kols.forEach((kol, index) => {
        this.walletToKolMap.set(kol.wallet, {
          name: kol.name,
          twitter: kol.x_link,
          wallet: kol.wallet
        });
      });

      console.log(`INFO: Loaded ${this.kols.length}`);
    } catch (error) {
      console.error('ERROR: Failed to load kols.json -', error.message);
      process.exit(1);
    }
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
          message: `Tracking ${this.kols.length} KOL wallets`,
          tracked_wallets: this.kols.length,
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
      console.log(`Wallet Tracker WebSocket server running on http://localhost:${this.port}`);
    });
  }

  connectToPumpPortal() {
    console.log('INFO: Connecting to PumpPortal...');

    this.pumpPortalWs = new WebSocket('wss://pumpportal.fun/api/data', {
      perMessageDeflate: false
    });

    this.pumpPortalWs.on('open', () => {
      console.log('INFO: Connected to PumpPortal');
      this.reconnectAttempts = 0;

      const walletAddresses = this.kols.map(kol => kol.wallet);

      const batchSize = 100;
      const totalBatches = Math.ceil(walletAddresses.length / batchSize);

      for (let i = 0; i < walletAddresses.length; i += batchSize) {
        const batch = walletAddresses.slice(i, i + batchSize);

        const subscribeMessage = {
          method: 'subscribeAccountTrade',
          keys: batch
        };

        this.pumpPortalWs.send(JSON.stringify(subscribeMessage));
      }

      console.log(`INFO: Subscribed to ${walletAddresses.length} wallets in ${totalBatches} batches`);
    });

    this.pumpPortalWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        const walletAddress = message.wallet || message.traderPublicKey || message.user || message.owner || message.signer;

        if (walletAddress && this.walletToKolMap.has(walletAddress)) {
          const kolInfo = this.walletToKolMap.get(walletAddress);

          const isBuy = this.determineBuyAction(message);
          const action = isBuy ? 'buy' : 'sell';

          console.log(`${action.toUpperCase()}: ${kolInfo.name} | ${message.mint || 'unknown'} | ${message.solAmount || 0} SOL`);

          this.broadcast({
            type: 'kol_trade',
            action: action,
            kol_name: kolInfo.name,
            kol_twitter: kolInfo.twitter,
            kol_wallet: kolInfo.wallet,
            trade_data: message,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error('ERROR: Failed to parse message -', error.message);
      }
    });

    this.pumpPortalWs.on('error', (error) => {
      console.error('ERROR: PumpPortal connection error -', error.message);
    });

    this.pumpPortalWs.on('close', (code, reason) => {
      console.log(`WARN: PumpPortal disconnected (code: ${code})`);

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`INFO: Reconnecting in ${Math.round(delay/1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connectToPumpPortal(), delay);
      } else {
        console.error('ERROR: Max reconnection attempts reached');
      }
    });
  }

  determineBuyAction(message) {
    if (message.txType === 'sell' || message.type === 'sell' || message.action === 'sell') {
      return false;
    }

    if (message.isBuy === false || message.is_buy === false) {
      return false;
    }

    if (message.txType === 'buy' || message.type === 'buy' || message.action === 'buy') {
      return true;
    }

    if (message.isBuy === true || message.is_buy === true) {
      return true;
    }

    if (message.solAmount) {
      const solAmount = parseFloat(message.solAmount);
      if (solAmount < 0) return true;
      if (solAmount > 0) return false;
    }

    return false;
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    const deadClients = [];

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          deadClients.push(client);
        }
      } else {
        deadClients.push(client);
      }
    });

    deadClients.forEach(client => this.clients.delete(client));
  }

  stop() {
    if (this.pumpPortalWs) {
      this.pumpPortalWs.close();
    }

    this.wss.close(() => {
      this.server.close(() => {
        console.log('Wallet Tracker WebSocket server stopped');
      });
    });
  }
}

const server = new WalletTrackerWebSocketServer(4003);

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

module.exports = WalletTrackerWebSocketServer;
