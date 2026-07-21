const express = require('express');
const { TelegramBot } = require('node-telegram-bot-api'); 
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');

// --- CONFIGURATION (Environment variables with fallback defaults) ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'REDACTED_BOT_TOKEN';
const CHAT_ID = process.env.CHAT_ID || 'REDACTED_CHAT_ID';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || 'REDACTED_SPREADSHEET_ID'; 
const PORT = process.env.PORT || 3000;

// Initialize the Telegram Bot in "polling" mode to listen for your replies
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

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

// Health Check Endpoint (For 24/7 free uptime monitoring / keep-alive pings)
app.get('/healthz', (req, res) => {
    res.status(200).send("OK");
});

app.get('/', (req, res) => {
    res.status(200).send("BCA Auto Logger Server is Active & Running 24/7!");
});

// 1. The Webhook (Receives data from your Android Phone)
app.post('/api/webhook', (req, res) => {
    const transactionData = req.body;
    
    // Save amount so the Telegram reply handler can log it to Google Sheets
    pendingAmount = transactionData.amount || "Unknown";

    console.log("Notification Received from Phone:", transactionData.amount);

    // Send a message to your Telegram!
    const message = `*New Transaction Detected!*\n Amount: Rp ${transactionData.amount}\n Raw: ${transactionData.raw_text || "N/A"}\n\n_Reply to this message with a photo of the receipt and the category (e.g., Food)._`;
    
    bot.sendMessage(CHAT_ID, message, { parse_mode: "Markdown" });

    res.status(200).send("Webhook received successfully");
});

// 2. The Listener (Waits for you to reply in Telegram)
bot.on('message', async (msg) => {
    // Security check: Ignore messages from anyone who isn't you
    if (msg.chat.id.toString() !== CHAT_ID.toString()) return; 

    // Check if your message is a direct "Reply" to the bot's transaction alert
    if (msg.reply_to_message) {
        console.log("You replied to a transaction!");
        
        // Grab whatever text you typed (either a text message or a photo caption)
        const categoryOrNotes = msg.text || msg.caption || "No text provided";
        let fileUrl = "No Image";
        console.log("Your Notes:", categoryOrNotes);

        try {
            // Check if you attached a photo - Option 1: Direct Telegram Photo Link
            if (msg.photo) {
                const photoData = msg.photo[msg.photo.length - 1]; // Gets highest quality photo
                fileUrl = await bot.getFileLink(photoData.file_id); // Direct Telegram photo URL
                console.log("Receipt Photo Attached (Telegram URL):", fileUrl);
            }

            // Append Data to Google Sheets
            const sheets = google.sheets({ version: 'v4', auth });
            
            // Gets current date and time in WIB (Jakarta time)
            const dateStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Sheet1!A:D', // Assuming columns are Date | Description | Amount | Photo
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
});

// Turn the server on
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Telegram Bot is awake and listening...`);
    console.log(`Listening for BCA transactions on /api/webhook...`);
});