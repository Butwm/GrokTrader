/**
 * GrokTrader Unified API Server
 * Production-ready API with all endpoints on one port
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'trading/.env') });
const express = require('express');
const cors = require('cors');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const PUMPPORTAL_API_URL = 'https://pumpportal.fun/api/trade';
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const DEFAULT_API_KEY = process.env.PUMPPORTAL_API_KEY;

// ======================
// TRADING ENDPOINTS
// ======================

/**
 * Validate percentage amounts
 */
function validateAmount(amount) {
    if (typeof amount === 'number') {
        if (amount <= 0) {
            return { isValid: false, error: 'Amount must be greater than 0' };
        }
        return { isValid: true };
    }

    if (typeof amount === 'string') {
        const trimmed = amount.trim();
        if (trimmed.endsWith('%')) {
            const percentValue = parseFloat(trimmed.slice(0, -1));
            if (isNaN(percentValue)) {
                return { isValid: false, error: 'Invalid percentage format' };
            }
            if (percentValue <= 0 || percentValue > 100) {
                return { isValid: false, error: 'Percentage must be between 0 and 100' };
            }
            return { isValid: true };
        }
        return { isValid: false, error: 'Amount must be a number or percentage (e.g., 1000 or "50%")' };
    }

    return { isValid: false, error: 'Invalid amount type' };
}

/**
 * POST /api/buy
 * Buy tokens using PumpPortal
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

        const finalApiKey = apiKey || DEFAULT_API_KEY;

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

        const response = await fetch(`${PUMPPORTAL_API_URL}?api-key=${finalApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
 * Sell tokens using PumpPortal (supports percentages like "50%", "100%")
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

        const finalApiKey = apiKey || DEFAULT_API_KEY;

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

        const validation = validateAmount(amount);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }

        const response = await fetch(`${PUMPPORTAL_API_URL}?api-key=${finalApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

// ======================
// BALANCE ENDPOINTS
// ======================

/**
 * GET /api/balance/:address
 * Get SOL balance for a Solana address
 */
app.get('/api/balance/:address', async (req, res) => {
    try {
        const { address } = req.params;

        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Wallet address is required'
            });
        }

        const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

        let publicKey;
        try {
            publicKey = new PublicKey(address);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Solana address format'
            });
        }

        const balanceLamports = await connection.getBalance(publicKey);
        const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;

        res.json({
            success: true,
            address: address,
            network: 'mainnet',
            balance: {
                lamports: balanceLamports,
                sol: balanceSOL,
                formatted: `${balanceSOL.toFixed(9)} SOL`
            }
        });

    } catch (error) {
        console.error('Balance fetch error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/balance
 * Get SOL balance for multiple addresses (batch)
 */
app.post('/api/balance', async (req, res) => {
    try {
        const { addresses } = req.body;

        if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Array of addresses is required'
            });
        }

        if (addresses.length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 100 addresses per request'
            });
        }

        const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

        const results = await Promise.all(
            addresses.map(async (address) => {
                try {
                    const publicKey = new PublicKey(address);
                    const balanceLamports = await connection.getBalance(publicKey);
                    const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;

                    return {
                        address: address,
                        success: true,
                        balance: {
                            lamports: balanceLamports,
                            sol: balanceSOL,
                            formatted: `${balanceSOL.toFixed(9)} SOL`
                        }
                    };
                } catch (error) {
                    return {
                        address: address,
                        success: false,
                        error: error.message
                    };
                }
            })
        );

        res.json({
            success: true,
            network: 'mainnet',
            count: addresses.length,
            balances: results
        });

    } catch (error) {
        console.error('Batch balance fetch error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ======================
// SERVER START
// ======================

app.listen(PORT, () => {
    console.log(`

Server running on http://localhost:${PORT}

API Key: ${DEFAULT_API_KEY ? 'Loaded' : ' Not found'}
`);
});
