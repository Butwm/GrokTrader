const express = require('express');
const https = require('https');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            data: jsonData,
            statusCode: response.statusCode,
            headers: response.headers
          });
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

app.get('/api/tokenAth/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const url = `https://frontend-api-v3.pump.fun/coins/${tokenId}`;

    console.log(`Fetching ATH for token: ${tokenId}`);

    const result = await makeRequest(url);

    res.status(result.statusCode).json({
      success: true,
      ath_market_cap: result.data.ath_market_cap,
      ath_timestamp: new Date(result.data.ath_market_cap_timestamp).toISOString()
    });
  } catch (error) {
    console.error('Error fetching token ATH:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token ATH',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down');
  process.exit(0);
});

module.exports = app;
