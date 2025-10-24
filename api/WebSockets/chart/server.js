const WebSocket = require('ws');
const http = require('http');
const https = require('https');

class PumpFunWebSocketServer {
  constructor(port = 8080) {
    this.port = port;
    this.clients = new Set();
    this.server = null;
    this.wss = null;
    this.fetchInterval = null;
    this.lastData = null;
    
    this.setupServer();
    this.startDataFetching();
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

      // Send last known data immediately if available
      if (this.lastData) {
        try {
          ws.send(JSON.stringify({
            type: 'candle_data',
            data: this.lastData,
            timestamp: Date.now()
          }));
        } catch (error) {
          console.error('Error sending initial data:', error.message);
        }
      }

      ws.on('close', (code, reason) => {
        console.log(`Client disconnected: ${code} - ${reason}`);
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        this.clients.delete(ws);
      });

      // Send ping to keep connection alive
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          console.log('Received message from client:', data);
        } catch (error) {
          console.error('Invalid message from client:', error.message);
        }
      });
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
      console.log(`WebSocket server running on port ${this.port}`);
    });
  }

  async fetchCandleData() {
    try {
      const currentTimestamp = Date.now();
      const url = `https://swap-api.pump.fun/v2/coins/7JckM7Y4UAcxQHdq3iRknsYAxADYJQWSSfNH7LPrpump/candles?interval=15s&limit=1000&currency=USD&createdTs=${currentTimestamp}`;

      const data = await this.makeRequest(url);
      this.lastData = data;
      
      this.broadcast({
        type: 'candle_data',
        data: data,
        timestamp: Date.now()
      });

      console.log(`Fetched ${data.length} candle records at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('Error fetching candle data:', error.message);
      
      this.broadcast({
        type: 'error',
        message: 'Failed to fetch candle data',
        timestamp: Date.now()
      });
    }
  }

  makeRequest(url) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
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

  startDataFetching() {
    this.fetchCandleData();
    
    this.fetchInterval = setInterval(() => {
      this.fetchCandleData();
    }, 15000); // 15 seconds

    console.log('Started data fetching every 10 seconds');
  }

  stop() {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
    }
    
    this.wss.close(() => {
      this.server.close(() => {
        console.log('Stopped');
      });
    });
  }
}

const server = new PumpFunWebSocketServer(8080);

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

module.exports = PumpFunWebSocketServer;
