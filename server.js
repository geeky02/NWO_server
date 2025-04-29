import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { XummSdk } from "xumm-sdk";
import { verifySignature } from "verify-xrpl-signature";
import jwt from "jsonwebtoken";

import Pusher from 'pusher';

dotenv.config();
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const xumm = new XummSdk(
    process.env.XUMM_KEY,
    process.env.XUMM_KEY_SECRET
);

const METEORA_POOL_ADDRESSES = new Set([
    '32D4zRxNc1EssbJieVHfPhZM3rH6CzfUPrWUuWxD9prG',
    'FGFaiYjXTVuLsKvzn6ueckraNTeqUGHeYqrQPQCpd7kH',
    'FGFaiYjXTVuLsKvzn6ueckraNTeqUGHeYqrQPQCpd7kH',
    '32D4zRxNc1EssbJieVHfPhZM3rH6CzfUPrWUuWxD9prG',
    '32D4zRxNc1EssbJieVHfPhZM3rH6CzfUPrWUuWxD9prG',
])

app.post("/api/xumm/createpayload", async (req, res) => {
    try {
        const signInPayload = {
            txjson: {
                TransactionType: "SignIn",
            },
        };

        const payload = await xumm.payload.create(signInPayload, true);
        res.status(200).json({ payload });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/xumm/getpayload", async (req, res) => {
    try {
        const { payloadId } = req.query;

        if (!payloadId) {
            return res.status(400).json({ error: "payloadId is required" });
        }

        const payload = await xumm.payload.get(payloadId);
        res.status(200).json({ payload });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch payload" });
    }
});

app.get("/api/xumm/verifysignature", (req, res) => {
    try {
        const { hex } = req.query;

        if (!hex) {
            return res.status(400).json({ error: "Missing hex signature" });
        }

        // Verify the XRPL signature
        const resp = verifySignature(hex);

        if (resp.signatureValid) {
            const xrpAddress = resp.signedBy;

            // Sign a JWT token
            const token = jwt.sign({ address: xrpAddress }, process.env.ENC_KEY, { expiresIn: "1h" });

            return res.status(200).json({ xrpAddress, token });
        } else {
            return res.status(400).json({ error: "Invalid signature" });
        }
    } catch (error) {
        console.error("Error verifying signature:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/api/helius-webhook", async (req, res) => {
    const pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID,
        key: process.env.NEXT_PUBLIC_PUSHER_KEY,
        secret: process.env.PUSHER_SECRET,
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
        useTLS: true,
    });

    if (req.method === 'POST') {
        const events = req.body;

        for (const event of events) {
            if (isMeteoraPoolEvent(event)) {
                const txnInfo = extractTransactionInfo(event);
                if (txnInfo) {
                    await pusher.trigger('transactions', 'new-transaction', txnInfo);
                }
            }
        }

        res.status(200).json({ message: 'ok' });
    } else {
        res.status(405).end();
    }
    // }


})
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

function isMeteoraPoolEvent(event) {
    const accountKeys = event?.accountData || [];

    return accountKeys.some((acc) => METEORA_POOL_ADDRESSES.has(acc.account));
}

function extractTransactionInfo(event) {
    try {
        const { timestamp, description, nativeTransfers, tokenTransfers, accountData } = event;
        const tokenBalanceChange = accountData.find((t) => METEORA_POOL_ADDRESSES.has(t.account)).tokenBalanceChanges;

        console.log("==================>", tokenBalanceChange)
        
        const wallet = nativeTransfers[0]?.fromUserAccount || 'unknown';
        const solAmount = tokenTransfers.find((t) => t.mint === 'So11111111111111111111111111111111111111112')?.tokenAmount || 0;
        const usdcAmount = description.split(" ")[3] === 'USDC' ? description.split(" ")[2] : 0;
        const buySell = Number(solAmount) > 0 ? 'Sell' : 'Buy';
        return { timestamp, wallet, buySell, solAmount, usdcAmount };
    } catch (e) {
        console.error('Failed to parse txn info', e);
        return null;
    }
}
