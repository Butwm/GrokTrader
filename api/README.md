# GrokTrader API

**Production-ready unified API** - All endpoints on one port.

## 🚀 Quick Start

```bash
cd api
npm start
```

Server runs on **http://localhost:3000**

## 📋 API Endpoints

All endpoints are on **one server, one port** (localhost:3000):

### **Trading**

#### POST /api/buy
Buy tokens on Pump.fun

**Request:**
```json
{
  "mint": "token-contract-address",
  "amountSol": 0.1,
  "slippage": 5,
  "priorityFee": 0.0001
}
```

**Response:**
```json
{
  "success": true,
  "signature": "transaction-signature",
  "message": "Successfully bought 0.1 SOL worth of...",
  "transaction": { ... }
}
```

#### POST /api/sell
Sell tokens (supports percentages: "10%", "50%", "100%")

**Request:**
```json
{
  "mint": "token-contract-address",
  "amount": "50%",
  "slippage": 5,
  "priorityFee": 0.0001
}
```

**Response:**
```json
{
  "success": true,
  "signature": "transaction-signature",
  "message": "Successfully sold 50% of...",
  "transaction": { ... }
}
```

### **Balance**

#### GET /api/balance/:address
Get SOL balance for a wallet

**Request:**
```bash
GET http://localhost:3000/api/balance/YOUR_WALLET_ADDRESS
```

**Response:**
```json
{
  "success": true,
  "address": "vines1vzr...",
  "network": "mainnet",
  "balance": {
    "lamports": 1500000000,
    "sol": 1.5,
    "formatted": "1.500000000 SOL"
  }
}
```

#### POST /api/balance
Get balances for multiple wallets (batch, max 100)

**Request:**
```json
{
  "addresses": ["address1", "address2", "address3"]
}
```

**Response:**
```json
{
  "success": true,
  "network": "mainnet",
  "count": 3,
  "balances": [
    {
      "address": "address1",
      "success": true,
      "balance": { ... }
    },
    ...
  ]
}
```

## ⚙️ Configuration

Create `.env` file in `api/trading/.env`:

```env
PUMPPORTAL_API_KEY=your-api-key-here
PORT=3000
```

If no API key is set, you must include `apiKey` in each trading request.

## 📦 Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run server (production) |
| `npm run dev` | Run with auto-reload (development) |

## 🌐 Network

- **Mainnet only** - All operations on Solana mainnet
- No testnet/devnet support

## 📡 Example Usage

### JavaScript/TypeScript

```javascript
// Buy tokens
const buyResponse = await fetch('http://localhost:3000/api/buy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mint: 'token-address',
    amountSol: 0.01,
    slippage: 5
  })
});

// Sell 50% of tokens
const sellResponse = await fetch('http://localhost:3000/api/sell', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mint: 'token-address',
    amount: '50%',
    slippage: 5
  })
});

// Check balance
const balanceResponse = await fetch('http://localhost:3000/api/balance/YOUR_ADDRESS');
const { balance } = await balanceResponse.json();
console.log(`Balance: ${balance.formatted}`);
```

### cURL

```bash
# Buy
curl -X POST http://localhost:3000/api/buy \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "token-address",
    "amountSol": 0.01,
    "slippage": 5
  }'

# Sell
curl -X POST http://localhost:3000/api/sell \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "token-address",
    "amount": "50%",
    "slippage": 5
  }'

# Check balance
curl http://localhost:3000/api/balance/YOUR_WALLET_ADDRESS
```

## 🔐 Security

- API key stored in `.env` (not committed to git)
- CORS enabled for cross-origin requests
- Input validation on all endpoints
- Error handling for invalid addresses/amounts

## 🏗️ Architecture

**Single unified server** (`server.js`) with:
- ✅ Trading endpoints (buy/sell)
- ✅ Balance endpoints (single/batch)
- ✅ All on port 3000
- ✅ Production-ready

No multiple deployments needed - just one server!

## 📝 Notes

- **0.5% PumpPortal fee** on each trade
- **Percentage sells**: Use strings like "10%", "25%", "50%", "100%"
- **Exact sells**: Use numbers like 1000, 5000
- **Max batch**: 100 addresses per request
- **Lamports**: 1 SOL = 1,000,000,000 lamports
