import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { XummSdk } from "xumm-sdk";
import { verifySignature } from "verify-xrpl-signature";
import jwt from "jsonwebtoken";

dotenv.config();
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const xumm = new XummSdk(
    process.env.XUMM_KEY,
    process.env.XUMM_KEY_SECRET
);

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

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});