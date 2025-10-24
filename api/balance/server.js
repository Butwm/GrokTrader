
const express = require('express');
const cors = require('cors');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
const PORT = process.env.PORT || 3008;

app.use(cors());
app.use(express.json());

const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

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

app.listen(PORT, () => {
    console.log(`✅ Balance API running on http://localhost:${PORT}`);
});
