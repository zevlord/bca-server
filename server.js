process.env.NTBA_FIX_319 = 1;

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

// Initialize Google Authentication (Supports Vercel Env Var first, falls back to file locally)
let auth;
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        auth = google.auth.fromJSON(credentials);
        auth.scopes = ['https://www.googleapis.com/auth/spreadsheets'];
        console.log("Google Auth initialized via Environment Variable.");
    } catch (err) {
        console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON env var:", err.message);
    }
}

if (!auth) {
    auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    console.log("Google Auth fallback initialized via credentials.json file.");
}

// Initialize Express application
const app = express();
app.use(express.json());

// Store latest transaction amount temporarily for Telegram reply matching
let pendingAmount = "Unknown";

// Health Check Endpoints
app.get('/healthz', (req, res) => res.status(200).send("OK"));

app.get('/', async (req, res) => {
    try {
        const sheets = google.sheets({ version: 'v4', auth });
        const sheetRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Raw_Transactions!A:D'
        });

        const rawRows = sheetRes.data.values || [];
        // Slice last 7 rows and reverse to show latest first
        const displayedRows = rawRows.slice(1).slice(-7).reverse();

        let rowsHtml = '';
        if (displayedRows.length === 0) {
            rowsHtml = '<tr><td colspan="4" class="empty-state">No transaction logs found in Google Sheet.</td></tr>';
        } else {
            displayedRows.forEach(row => {
                const date = row[0] || 'N/A';
                const notes = row[1] || 'No category';
                const amount = row[2] !== 'Unknown' ? `Rp ${Number(row[2]).toLocaleString('id-ID')}` : 'Unknown';
                const photo = row[3] && row[3].startsWith('http') 
                    ? `<a href="${row[3]}" target="_blank" class="link-icon">🔗</a>` 
                    : '<span style="color: var(--text-muted);">-</span>';

                rowsHtml += `
                    <tr>
                        <td class="mono">${date}</td>
                        <td>${notes}</td>
                        <td class="mono" style="font-weight: 600; color: var(--emerald);">${amount}</td>
                        <td style="text-align: center;">${photo}</td>
                    </tr>
                `;
            });
        }

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BCA Auto Logger Debug Monitor</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
            <style>
                :root {
                    --bg-dark: #090D16;
                    --card-bg: #131A26;
                    --primary-blue: #0052CC;
                    --emerald: #10B981;
                    --emerald-bg: rgba(16, 185, 129, 0.1);
                    --red: #EF4444;
                    --text-light: #F8FAFC;
                    --text-muted: #94A3B8;
                    --border-color: #1E293B;
                }
                * {
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                }
                body {
                    font-family: 'Outfit', sans-serif;
                    background-color: var(--bg-dark);
                    color: var(--text-light);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }
                .container {
                    width: 100%;
                    max-width: 800px;
                    background-color: var(--card-bg);
                    border-radius: 24px;
                    border: 1px solid var(--border-color);
                    padding: 32px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.5);
                    background-image: radial-gradient(circle at 100% 0%, rgba(0, 82, 204, 0.15) 0%, transparent 50%),
                                      radial-gradient(circle at 0% 100%, rgba(16, 185, 129, 0.08) 0%, transparent 50%);
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid var(--border-color);
                    padding-bottom: 24px;
                    margin-bottom: 24px;
                }
                .logo-section h1 {
                    font-size: 24px;
                    font-weight: 800;
                    letter-spacing: -0.5px;
                    background: linear-gradient(135deg, #FFF 0%, #94A3B8 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .logo-section p {
                    font-size: 13px;
                    color: var(--text-muted);
                    margin-top: 4px;
                }
                .status-badge {
                    background-color: var(--emerald-bg);
                    color: var(--emerald);
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border: 1px solid rgba(16, 185, 129, 0.2);
                }
                .status-dot {
                    width: 8px;
                    height: 8px;
                    background-color: var(--emerald);
                    border-radius: 50%;
                    box-shadow: 0 0 8px var(--emerald);
                }
                .grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                    margin-bottom: 32px;
                }
                .metric-card {
                    background-color: rgba(30, 41, 59, 0.4);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 16px;
                }
                .metric-card h3 {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: var(--text-muted);
                    margin-bottom: 8px;
                }
                .metric-card p {
                    font-size: 15px;
                    font-weight: 600;
                }
                .section-title {
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 16px;
                    color: var(--text-light);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .section-title span {
                    font-size: 12px;
                    color: var(--text-muted);
                    font-weight: 400;
                }
                .table-container {
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    overflow: hidden;
                    background-color: rgba(30, 41, 59, 0.2);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    text-align: left;
                    font-size: 14px;
                }
                th, td {
                    padding: 14px 16px;
                    border-bottom: 1px solid var(--border-color);
                }
                th {
                    background-color: rgba(30, 41, 59, 0.4);
                    font-weight: 600;
                    color: var(--text-muted);
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                tr:last-child td {
                    border-bottom: none;
                }
                .mono {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 12px;
                }
                .link-icon {
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    font-size: 16px;
                }
                .empty-state {
                    padding: 40px;
                    text-align: center;
                    color: var(--text-muted);
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo-section">
                        <h1>BCA Auto Logger</h1>
                        <p>Live Cloud Debugging &amp; Status Monitor</p>
                    </div>
                    <div class="status-badge">
                        <span class="status-dot"></span>
                        <span>SYSTEM ONLINE</span>
                    </div>
                </div>

                <div class="grid">
                    <div class="metric-card">
                        <h3>Server Environment</h3>
                        <p style="color: var(--emerald);">Vercel Serverless (Active)</p>
                    </div>
                    <div class="metric-card">
                        <h3>Connected Spreadsheet</h3>
                        <p class="mono">${SPREADSHEET_ID}</p>
                    </div>
                </div>

                <div class="section-title">
                    <h2>Recent Intercepted Logs</h2>
                    <span>Displaying last 7 rows from Google Sheets</span>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date &amp; Time</th>
                                <th>Category / Notes</th>
                                <th>Amount</th>
                                <th style="text-align: center;">Receipt</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        </body>
        </html>
        `;

        res.status(200).send(html);
    } catch (err) {
        console.error("Dashboard error:", err.message);
        res.status(500).send("Dashboard Error: " + err.message);
    }
});

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
        
        // Retrieve original alert message text
        const originalText = msg.reply_to_message.text || "";
        
        // Parse the amount directly from the original message (e.g., "Amount: Rp 50000")
        let amount = "Unknown";
        const amountMatch = originalText.match(/Amount:\s*Rp\s*([0-9.,]+)/i);
        if (amountMatch) {
            amount = amountMatch[1];
        }

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
                range: 'Raw_Transactions!A:D',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [[dateStr, categoryOrNotes, amount, fileUrl]]
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