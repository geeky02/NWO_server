import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { XummSdk } from "xumm-sdk";
import { verifySignature } from "verify-xrpl-signature";
import jwt from "jsonwebtoken";
import axios from "axios"; // ✅ Ensure axios is imported
import xrpl from 'xrpl';
dotenv.config();
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Connect to XRP Ledger
const client = new xrpl.Client("wss://s2.ripple.com");

const xumm = new XummSdk(
    process.env.XUMM_KEY,
    process.env.XUMM_KEY_SECRET
);

const connectToXRPL = async () => {
    try {
        console.log("Connecting to XRPL...");
        await client.connect();
        console.log("✅ Connected to XRPL WebSocket!");
    } catch (error) {
        console.error("XRPL Connection Failed! Retrying in 5 seconds...");
        setTimeout(connectToXRPL, 5000); // Retry after 5 seconds
    }
};

// Connect when the server starts
connectToXRPL();

// ✅ Swap Endpoint: Create a swap transaction and send to Xumm Wallet for signing
app.post("/swap", async (req, res) => {
    try {
        if (!client.isConnected()) {
            await client.connect();
        }

        const { amount, code1, code2, issuer2, userToken} = req.body;
        const userAddress = "rMbRN65DKDaCNKpnMPVPoUZ9eJJfvLup8r";
        console.log(amount);

        if (!amount || !code1 || !code2 || !issuer2 || !userAddress) {
            return res.status(400).json({ error: "Invalid swap parameters" });
        }

        // ✅ Prepare the transaction
        let amountFormatted;
        if (code1 === "XRP") {
            amountFormatted = xrpl.xrpToDrops(amount.toString()); // Convert XRP to drops
        } else {
            amountFormatted = {
                currency: code1,
                issuer: issuer2,
                value: amount.toString(),
            };
        }

        const txJson = {
            TransactionType: "Payment",
            Account: userAddress,
            Amount: amountFormatted,
            Destination: issuer2, // Assuming issuer2 is the receiving address
            Flags: 0,
        }
        // ✅ Create a Xumm payload to request user confirmation
       
        const payload = await xumm.payload.create(
            {
                txjson: txJson,
                options: {
                    submit: false,
                    expire: 300,
                    push: true,
                    force_push: true,
                }
            },
            userToken // ✅ critical for Xaman push
        );

        
        console.log('force');
        console.log(payload);

        // ✅ Return the payload UUID so the frontend can handle the transaction confirmation
        res.json({
            message: "Sign request sent to Xumm",
            xummPayload: payload,
        });

    } catch (error) {
        console.error("Swap Error:", error);
        res.status(500).json({ error: "Swap failed", details: error.message });
    }
});


// ✅ CREATE XUMM PAYLOAD (Login)
app.post("/api/xumm/createpayload", async (req, res) => {
    try {
        const signInPayload = {
            txjson: { TransactionType: "SignIn" },
            options: { expire: 10 } // Expires in 10 minutes
        };

        // ✅ Create payload for user authentication
        const payload = await xumm.payload.create(signInPayload, true);
        console.log(payload)

        res.status(200).json({ payload });
    } catch (error) {
        console.error("Xumm Authentication Error:", error);
        res.status(500).json({ error: "Failed to create authentication payload" });
    }
});


// ✅ GET XUMM PAYLOAD STATUS
app.get("/api/xumm/getpayload", async (req, res) => {
    try {
        const { payloadId } = req.query;
        if (!payloadId) return res.status(400).json({ error: "payloadId is required" });

        const payload = await xumm.payload.get(payloadId);
        res.status(200).json({ payload });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch payload" });
    }
});

// ✅ VERIFY XUMM SIGNATURE
app.get("/api/xumm/verifysignature", (req, res) => {
    try {
        const { hex } = req.query;
        if (!hex) return res.status(400).json({ error: "Missing hex signature" });

        const resp = verifySignature(hex, "mainnet");  // Use "testnet" if needed

        if (resp.signatureValid) {
            const xrpAddress = resp.signedBy;

            // ✅ Generate JWT Token for session authentication
            const token = jwt.sign({ address: xrpAddress }, process.env.ENC_KEY, { expiresIn: "1h" });

            return res.status(200).json({ xrpAddress, token });
        } else {
            return res.status(400).json({ error: "Invalid signature" });
        }
    } catch (error) {
        console.error("Signature Verification Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});


// ✅ START THE SERVER
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
