const express = require('express');
const { TelegramBot } = require('node-telegram-bot-api'); 
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'REDACTED_BOT_TOKEN';
const CHAT_ID = process.env.CHAT_ID || 'REDACTED_CHAT_ID';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || 'REDACTED_SPREADSHEET_ID'; 
const PORT = process.env.PORT || 3000;

// On Vercel, serverless functions don't run background polling loops, so disable polling when process.env.VERCEL is set
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || Boolean(process.env.VERCEL);
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: !isVercel });

// Initialize Google Authentication using credentials.json
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

// Initialize Express application
const app = express();
app.use(express.json());

// Store latest transaction amount temporarily for Telegram reply matching
let pendingAmount = "Unknown";

// Health Check Endpoints
app.get('/healthz', (req, res) => res.status(200).send("OK"));
app.get('/', (req, res) => res.status(200).send("BCA Auto Logger Server running on Vercel!"));

// 1. Android Webhook Endpoint (Receives data from your phone)
app.post('/api/webhook', async (req, res) => {
    try {
        const transactionData = req.body || {};
        
        // Save amount so the Telegram reply handler can log it to Google Sheets
        pendingAmount = transactionData.amount || "Unknown";

        console.log("Notification Received from Phone:", transactionData.amount);

        // Send a message to your Telegram!
        const message = `*New Transaction Detected!*\n Amount: Rp ${transactionData.amount}\n Raw: ${transactionData.raw_text || "N/A"}\n\n_Reply to this message with a photo of the receipt and the category (e.g., Food)._`;
        
        await bot.sendMessage(CHAT_ID, message, { parse_mode: "Markdown" });

        res.status(200).send("Webhook received successfully");
    } catch (err) {
        console.error("Webhook processing error:", err.message);
        res.status(500).send("Error processing webhook: " + err.message);
    }
});

// 2. Telegram Webhook Callback (For Vercel Serverless mode)
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const msg = req.body ? (req.body.message || req.body.edited_message) : null;
        if (msg) {
            await handleTelegramMessage(msg);
        }
        res.status(200).send("OK");
    } catch (err) {
        console.error("Telegram webhook error:", err.message);
        res.status(500).send("Error processing Telegram webhook");
    }
});

// Core Telegram Reply Handler Logic
async function handleTelegramMessage(msg) {
    if (!msg || !msg.chat) return;
    if (msg.chat.id.toString() !== CHAT_ID.toString()) return; 

    // Check if your message is a direct "Reply" to the bot's transaction alert
    if (msg.reply_to_message) {
        console.log("You replied to a transaction!");
        
        const categoryOrNotes = msg.text || msg.caption || "No text provided";
        let fileUrl = "No Image";

        try {
            // Check if user attached a photo (Direct Telegram URL)
            if (msg.photo) {
                const photoData = msg.photo[msg.photo.length - 1]; // Gets highest quality photo
                fileUrl = await bot.getFileLink(photoData.file_id); // Direct Telegram photo URL
                console.log("Receipt Photo Attached (Telegram URL):", fileUrl);
            }

            // Append Data to Google Sheets
            const sheets = google.sheets({ version: 'v4', auth });
            const dateStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Sheet1!A:D',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [[dateStr, categoryOrNotes, pendingAmount, fileUrl]]
                }
            });

            console.log("Successfully saved to Sheets!");
            bot.sendMessage(CHAT_ID, "All done! Logged to your spreadsheet.");
        } catch (error) {
            console.error("Error saving data:", error.message);
            bot.sendMessage(CHAT_ID, "Failed to save. Check terminal logs.");
        }
    }
}

// In local development, handle messages via polling event
if (!isVercel) {
    bot.on('message', async (msg) => {
        try {
            await handleTelegramMessage(msg);
        } catch (err) {
            console.error("Polling message error:", err.message);
        }
    });

    app.listen(PORT, () => {
        console.log(`Server running locally on http://localhost:${PORT}`);
        console.log(`Telegram Bot is awake and listening...`);
    });
}

// Export Express app for Vercel Serverless Functions
module.exports = app;