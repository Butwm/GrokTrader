
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3007;

// Middleware
app.use(cors());
app.use(express.json());

// PumpPortal API Configuration
const PUMPPORTAL_API_URL = 'https://pumpportal.fun/api/trade';
const DEFAULT_API_KEY = process.env.PUMPPORTAL_API_KEY;

/**
 * Validate and parse percentage amounts
 * @param {string|number} amount - Amount to validate (e.g., "50%", "100%", 1000)
 * @returns {Object} { isValid: boolean, error?: string }
 */
function validateAmount(amount) {
    // If it's a number, just check if it's positive
    if (typeof amount === 'number') {
        if (amount <= 0) {
            return { isValid: false, error: 'Amount must be greater than 0' };
        }
        return { isValid: true };
    }

    // If it's a string, check if it's a percentage
    if (typeof amount === 'string') {
        const trimmed = amount.trim();

        // Check if it ends with %
        if (trimmed.endsWith('%')) {
            const percentValue = parseFloat(trimmed.slice(0, -1));

            // Validate percentage is a number
            if (isNaN(percentValue)) {
                return { isValid: false, error: 'Invalid percentage format' };
            }

            // Check percentage is between 0 and 100
            if (percentValue <= 0 || percentValue > 100) {
                return { isValid: false, error: 'Percentage must be between 0 and 100' };
            }

            return { isValid: true };
        }

        // String but not a percentage
        return { isValid: false, error: 'Amount must be a number or percentage (e.g., 1000 or "50%")' };
    }

    return { isValid: false, error: 'Invalid amount type' };
}

/**
 * POST /api/buy
 * Buy tokens using PumpPortal Lightning API
 *
 * Request Body:
 * {
 *   "apiKey": "your-pumpportal-api-key",
 *   "mint": "token-contract-address",
 *   "amountSol": 0.1,
 *   "slippage": 5,
 *   "priorityFee": 0.0001,
 *   "pool": "pump",
 *   "skipPreflight": true,
 *   "jitoOnly": false
 * }
 */
app.post('/api/buy', async (req, res) => {
    try {
        const {
            apiKey,
            mint,
            amountSol,
            slippage = 5,
            priorityFee = 0.0001,
            pool = 'pump',
            skipPreflight = true,
            jitoOnly = false
        } = req.body;

        // Use provided API key or fall back to default from .env
        const finalApiKey = apiKey || DEFAULT_API_KEY;

        // Validation
        if (!finalApiKey) {
            return res.status(400).json({
                success: false,
                error: 'API key is required. Provide it in request body or set PUMPPORTAL_API_KEY in .env file'
            });
        }

        if (!mint) {
            return res.status(400).json({
                success: false,
                error: 'Token mint address is required'
            });
        }

        if (!amountSol || amountSol <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid amount in SOL is required'
            });
        }

        // Call PumpPortal API
        const response = await fetch(`${PUMPPORTAL_API_URL}?api-key=${finalApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'buy',
                mint: mint,
                amount: amountSol,
                denominatedInSol: 'true',
                slippage: slippage,
                priorityFee: priorityFee,
                pool: pool,
                skipPreflight: String(skipPreflight),
                jitoOnly: String(jitoOnly)
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: data.error || 'Buy transaction failed',
                details: data
            });
        }

        res.json({
            success: true,
            signature: data.signature,
            message: `Successfully bought ${amountSol} SOL worth of ${mint}`,
            transaction: data
        });

    } catch (error) {
        console.error('Buy error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/sell
 * Sell tokens using PumpPortal Lightning API
 *
 * Request Body:
 * {
 *   "apiKey": "your-pumpportal-api-key",
 *   "mint": "token-contract-address",
 *   "amount": 1000,           // Exact token amount OR percentage: "10%", "50%", "100%", etc.
 *   "slippage": 5,
 *   "priorityFee": 0.0001,
 *   "pool": "pump",
 *   "skipPreflight": true,
 *   "jitoOnly": false
 * }
 */
app.post('/api/sell', async (req, res) => {
    try {
        const {
            apiKey,
            mint,
            amount,
            slippage = 5,
            priorityFee = 0.0001,
            pool = 'pump',
            skipPreflight = true,
            jitoOnly = false
        } = req.body;

        // Use provided API key or fall back to default from .env
        const finalApiKey = apiKey || DEFAULT_API_KEY;

        // Validation
        if (!finalApiKey) {
            return res.status(400).json({
                success: false,
                error: 'API key is required. Provide it in request body or set PUMPPORTAL_API_KEY in .env file'
            });
        }

        if (!mint) {
            return res.status(400).json({
                success: false,
                error: 'Token mint address is required'
            });
        }

        if (!amount) {
            return res.status(400).json({
                success: false,
                error: 'Amount is required (e.g., 1000 or "50%")'
            });
        }

        // Validate amount (number or percentage)
        const validation = validateAmount(amount);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }

        // Call PumpPortal API
        const response = await fetch(`${PUMPPORTAL_API_URL}?api-key=${finalApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'sell',
                mint: mint,
                amount: amount,
                denominatedInSol: 'false',
                slippage: slippage,
                priorityFee: priorityFee,
                pool: pool,
                skipPreflight: String(skipPreflight),
                jitoOnly: String(jitoOnly)
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: data.error || 'Sell transaction failed',
                details: data
            });
        }

        res.json({
            success: true,
            signature: data.signature,
            message: `Successfully sold ${amount} of ${mint}`,
            transaction: data
        });

    } catch (error) {
        console.error('Sell error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Trading API running on http://localhost:${PORT}`);

    if (DEFAULT_API_KEY) {
        console.log(`   API Key loaded from .env`);
    } else {
        console.log(`   No API key in .env`);
    }
});
