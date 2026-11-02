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
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';
const PORT = process.env.PORT || 3000;

// IMPORTANT: Disable polling by default to prevent node-telegram-bot-api from clearing the production webhook
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || Boolean(process.env.VERCEL);
const enablePolling = process.env.ENABLE_POLLING === 'true';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: enablePolling });

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

// Helper to dynamically resolve the raw transaction sheet title
async function getRawSheetTitle(sheets, spreadsheetId) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = meta.data.sheets || [];
    const matched = existing.find(s => s.properties.title.trim().toLowerCase() === 'raw_transactions')
        || existing.find(s => s.properties.title.toLowerCase().includes('raw'));
    
    if (matched) {
        return matched.properties.title;
    }

    console.log("Creating missing Raw_Transactions sheet...");
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{ addSheet: { properties: { title: 'Raw_Transactions' } } }]
        }
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "'Raw_Transactions'!A1:D1",
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [['Date & Time', 'Category / Notes', 'Amount', 'Photo Link']]
        }
    });

    return 'Raw_Transactions';
}

// Health Check Endpoints
app.get('/healthz', (req, res) => res.status(200).send("OK"));

app.get('/', async (req, res) => {
    try {
        const sheets = google.sheets({ version: 'v4', auth });
        const rawSheetTitle = await getRawSheetTitle(sheets, SPREADSHEET_ID);
        const sheetRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `'${rawSheetTitle}'!A:D`
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
                let photoUrl = null;
                if (row[3]) {
                    const match = row[3].match(/https?:\/\/[^\s",\)]+/);
                    if (match) photoUrl = match[0];
                }
                const photo = photoUrl 
                    ? `<a href="${photoUrl}" target="_blank" class="link-icon">🔗</a>` 
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

// Helper to convert column index to Excel column letter
function colToLetter(colIndex) {
    let temp, letter = '';
    let col = colIndex + 1;
    while (col > 0) {
        temp = (col - 1) % 26;
        letter = String.fromCharCode(65 + temp) + letter;
        col = (col - temp - 1) / 26;
    }
    return letter;
}

const MONTH_NAMES_ID = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAY_ROWS = { 1: 3, 2: 8, 3: 13, 4: 19, 5: 25, 6: 30, 0: 35 };

function generateMonthGrid(year, monthIdx) {
    const grid = Array.from({ length: 41 }, () => Array(20).fill(''));
    for (let w = 0; w < 5; w++) {
        grid[0][w * 4 + 1] = `Minggu ${w + 1}`;
        grid[1][w * 4] = 'Hari/tanggal';
        grid[1][w * 4 + 1] = 'Deskripsi';
        grid[1][w * 4 + 2] = 'Harga';
        grid[1][w * 4 + 3] = '';
    }

    const firstOfMonth = new Date(year, monthIdx, 1);
    const firstDayOfWeek = firstOfMonth.getDay();
    const startDate = new Date(year, monthIdx, 1);
    if (firstDayOfWeek === 0) {
        startDate.setDate(startDate.getDate() - 6);
    } else if (firstDayOfWeek > 1) {
        startDate.setDate(startDate.getDate() - (firstDayOfWeek - 1));
    }

    const curDate = new Date(startDate);
    for (let w = 0; w < 5; w++) {
        for (let d = 0; d < 7; d++) {
            const dayOfWeek = curDate.getDay();
            const dayName = DAY_NAMES_ID[dayOfWeek];
            const dayNum = curDate.getDate();
            const monthName = MONTH_NAMES_ID[curDate.getMonth()];

            const label = `${dayName} ${dayNum} ${monthName}`;
            const targetRow = DAY_ROWS[dayOfWeek] - 1;
            const targetCol = w * 4;

            grid[targetRow][targetCol] = label;
            curDate.setDate(curDate.getDate() + 1);
        }

        const hargaColLetter = String.fromCharCode(65 + (w * 4 + 2));
        grid[39][w * 4] = 'Total';
        grid[39][w * 4 + 2] = `=SUM(${hargaColLetter}3:${hargaColLetter}39)`;
    }
    return grid;
}

async function ensureMonthlySheetInitialized(sheets, spreadsheetId, targetMonthName, year, monthIdx) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = meta.data.sheets || [];
    let matched = existing.find(s => s.properties.title.trim().toLowerCase() === targetMonthName.toLowerCase());
    let sheetId = matched ? matched.properties.sheetId : null;

    if (!matched) {
        console.log(`Creating missing monthly tab: "${targetMonthName}"`);
        const addRes = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [{ addSheet: { properties: { title: targetMonthName } } }]
            }
        });
        sheetId = addRes.data.replies[0].addSheet.properties.sheetId;
        matched = { properties: { title: targetMonthName, sheetId } };
    }

    const checkRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${matched.properties.title}'!A1:B3`
    });
    if (checkRes.data.values && checkRes.data.values.length >= 3) {
        return matched.properties.title;
    }

    console.log(`Initializing calendar layout for "${targetMonthName}"...`);
    const grid = generateMonthGrid(year, monthIdx);
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${matched.properties.title}'!A1:T41`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: grid }
    });

    try {
        const solidBlack = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } };
        const borderRequests = [];
        for (let w = 0; w < 5; w++) {
            borderRequests.push({
                updateBorders: {
                    range: {
                        sheetId,
                        startRowIndex: 1, // Row 2 (headers)
                        endRowIndex: 40,  // Row 40 (Total)
                        startColumnIndex: w * 4,
                        endColumnIndex: w * 4 + 3
                    },
                    top: solidBlack,
                    bottom: solidBlack,
                    left: solidBlack,
                    right: solidBlack,
                    innerHorizontal: solidBlack,
                    innerVertical: solidBlack
                }
            });
        }

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [
                    ...borderRequests,
                    {
                        repeatCell: {
                            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 20 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.415, green: 0.658, blue: 0.31 },
                                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                                    horizontalAlignment: 'CENTER'
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 20 },
                            cell: { userEnteredFormat: { textFormat: { bold: true } } },
                            fields: 'userEnteredFormat.textFormat.bold'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId, startRowIndex: 2, endRowIndex: 40, startColumnIndex: 0, endColumnIndex: 20 },
                            cell: { userEnteredFormat: { textFormat: { bold: true } } },
                            fields: 'userEnteredFormat.textFormat.bold'
                        }
                    }
                ]
            }
        });
    } catch (styleErr) {
        console.error("Warning applying styling:", styleErr.message);
    }

    return matched.properties.title;
}

async function insertIntoMonthlySheet(sheets, spreadsheetId, category, amount, photoUrl) {
    try {
        const now = new Date();
        const jakartaDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
        const [yearStr, monthStr, dayStr] = jakartaDateStr.split("-");
        const year = parseInt(yearStr, 10);
        const monthIdx = parseInt(monthStr, 10) - 1;
        const dayNum = parseInt(dayStr, 10);

        const targetMonthName = `${MONTH_NAMES_ID[monthIdx]} ${year}`;

        // Ensure tab exists and is initialized with calendar template
        const matchedSheet = await ensureMonthlySheetInitialized(sheets, spreadsheetId, targetMonthName, year, monthIdx);

        if (!matchedSheet) {
            console.log(`Monthly sheet "${targetMonthName}" could not be initialized.`);
            return null;
        }

        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${matchedSheet}'!A1:Z60`
        });
        const grid = res.data.values || [];
        if (grid.length < 3) return null;

        const headerRow = grid[1] || [];
        const dateCols = [];
        headerRow.forEach((cell, idx) => {
            if (typeof cell === 'string' && /hari\s*\/\s*tanggal/i.test(cell.trim())) {
                dateCols.push(idx);
            }
        });

        if (dateCols.length === 0) return null;

        let foundCol = -1;
        let startRow = -1;
        const currentMonthName = MONTH_NAMES_ID[monthIdx];
        const dayRegex = new RegExp(`(^|\\s)${dayNum}\\s+(${currentMonthName}|${currentMonthName.substring(0, 3)})`, 'i');
        const fallbackDayRegex = new RegExp(`(^|\\s)${dayNum}(\\s|$)`, 'i');

        // Pass 1: Match day number + month name
        for (const c of dateCols) {
            for (let r = 2; r < grid.length; r++) {
                const cellVal = grid[r] && grid[r][c] ? String(grid[r][c]).trim() : '';
                if (cellVal && dayRegex.test(cellVal) && /^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)/i.test(cellVal)) {
                    foundCol = c;
                    startRow = r;
                    break;
                }
            }
            if (foundCol !== -1) break;
        }

        // Pass 2: Fallback to day number alone
        if (foundCol === -1) {
            for (const c of dateCols) {
                for (let r = 2; r < grid.length; r++) {
                    const cellVal = grid[r] && grid[r][c] ? String(grid[r][c]).trim() : '';
                    if (cellVal && fallbackDayRegex.test(cellVal) && /^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)/i.test(cellVal)) {
                        foundCol = c;
                        startRow = r;
                        break;
                    }
                }
                if (foundCol !== -1) break;
            }
        }

        if (foundCol === -1) {
            console.log(`Day ${dayNum} label not found in "${matchedSheet}".`);
            return null;
        }

        let endRow = grid.length;
        for (let r = startRow + 1; r < grid.length; r++) {
            const dateVal = grid[r] && grid[r][foundCol] ? String(grid[r][foundCol]).trim() : '';
            if (dateVal && (/^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu|TOTAL)/i.test(dateVal))) {
                endRow = r;
                break;
            }
            const descVal = grid[r] && grid[r][foundCol + 1] ? String(grid[r][foundCol + 1]).trim() : '';
            if (descVal && /^TOTAL/i.test(descVal)) {
                endRow = r;
                break;
            }
        }

        let targetRow = -1;
        for (let r = startRow; r < endRow; r++) {
            const descVal = grid[r] && grid[r][foundCol + 1] ? String(grid[r][foundCol + 1]).trim() : '';
            if (!descVal) {
                targetRow = r;
                break;
            }
        }

        if (targetRow === -1) {
            console.log(`All slots for day ${dayNum} are full in "${matchedSheet}".`);
            return null;
        }

        const descColLetter = colToLetter(foundCol + 1);
        const hargaColLetter = colToLetter(foundCol + 2);
        const targetRange = `'${matchedSheet}'!${descColLetter}${targetRow + 1}:${hargaColLetter}${targetRow + 1}`;

        const descCell = photoUrl && photoUrl.startsWith('http')
            ? `=HYPERLINK("${photoUrl}", "${category}")`
            : category;

        const numAmount = parseInt(String(amount).replace(/[^0-9]/g, ""), 10) || 0;

        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: targetRange,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[descCell, numAmount]]
            }
        });

        console.log(`Successfully placed in ${targetRange}`);
        return `${matchedSheet} (${descColLetter}${targetRow + 1})`;
    } catch (err) {
        console.error("Error in insertIntoMonthlySheet:", err.message);
        return null;
    }
}

// Core Telegram Reply Handler Logic
async function handleTelegramMessage(msg) {
    if (!msg || !msg.chat) return;
    if (msg.chat.id.toString() !== CHAT_ID.toString()) return; 

    // Check if your message is a direct "Reply" to the bot's transaction alert
    if (msg.reply_to_message) {
        console.log("You replied to a transaction!");
        
        // Retrieve original alert message text
        const originalText = msg.reply_to_message.text || "";

        // Prevent duplicate processing if already logged
        if (originalText.includes("Transaction Logged ✓") || originalText.includes("Saved to Google Sheets")) {
            await bot.sendMessage(CHAT_ID, "⚠️ This transaction has already been logged.");
            return;
        }

        // Only process replies to genuine transaction alerts
        if (!originalText.includes("New Transaction Detected")) {
            return;
        }
        
        // Parse the amount directly from the original message (e.g., "Amount: Rp 50000")
        let amount = "Unknown";
        const amountMatch = originalText.match(/Amount:\s*Rp\s*([0-9.,]+)/i);
        if (amountMatch) {
            amount = amountMatch[1];
        }

        const categoryOrNotes = msg.text || msg.caption || "No text provided";
        let fileCell = "No Image";
        let finalImageUrl = null;

        try {
            // Check if user attached a photo
            if (msg.photo) {
                const photoData = msg.photo[msg.photo.length - 1]; // Gets highest quality photo
                const telegramUrl = await bot.getFileLink(photoData.file_id);
                finalImageUrl = telegramUrl;

                if (IMGBB_API_KEY) {
                    try {
                        const imgRes = await axios.get(telegramUrl, { responseType: 'arraybuffer' });
                        const base64Img = Buffer.from(imgRes.data).toString('base64');
                        const params = new URLSearchParams();
                        params.append('image', base64Img);

                        const uploadRes = await axios.post(
                            `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
                            params
                        );

                        if (uploadRes.data?.data?.url) {
                            finalImageUrl = uploadRes.data.data.url;
                            console.log("Uploaded receipt to ImgBB:", finalImageUrl);
                        }
                    } catch (uploadErr) {
                        console.error("ImgBB upload error, falling back to Telegram URL:", uploadErr.message);
                    }
                } else {
                    console.log("IMGBB_API_KEY not configured, using Telegram URL.");
                }

                // Render thumbnail in Google Sheets cell and make it clickable to open full image
                fileCell = `=HYPERLINK("${finalImageUrl}", IMAGE("${finalImageUrl}"))`;
            }

            // Append Data to Google Sheets Raw Tab
            const sheets = google.sheets({ version: 'v4', auth });
            const dateStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

            let rawSaved = false;
            let rawSheetTitle = 'Raw_Transactions';
            try {
                rawSheetTitle = await getRawSheetTitle(sheets, SPREADSHEET_ID);
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `'${rawSheetTitle}'!A:D`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: [[dateStr, categoryOrNotes, amount, fileCell]]
                    }
                });
                rawSaved = true;
                console.log(`Successfully saved to ${rawSheetTitle}!`);
            } catch (rawErr) {
                console.error("Raw sheet append error:", rawErr.message);
            }

            // Attempt to insert directly into visual monthly grid (e.g. "November 2026")
            let monthlyPlacement = null;
            try {
                monthlyPlacement = await insertIntoMonthlySheet(
                    sheets,
                    SPREADSHEET_ID,
                    categoryOrNotes,
                    amount,
                    finalImageUrl
                );
            } catch (mErr) {
                console.error("Monthly sheet placement warning:", mErr.message);
            }

            if (!rawSaved && !monthlyPlacement) {
                throw new Error("Failed to save to both raw sheet and monthly sheet.");
            }

            console.log("Successfully processed transaction!");

            // Mark original message as logged to prevent double-replies
            try {
                await bot.editMessageText(
                    `*Transaction Logged ✓*\nAmount: Rp ${amount}\nCategory: ${categoryOrNotes}\n_Status: Saved to Google Sheets_`,
                    {
                        chat_id: msg.chat.id,
                        message_id: msg.reply_to_message.message_id,
                        parse_mode: "Markdown"
                    }
                );
            } catch (editErr) {
                console.error("Notice: Could not edit original message text:", editErr.message);
            }

            const successMsg = monthlyPlacement
                ? `All done! Logged to spreadsheet (Raw + ${monthlyPlacement}).`
                : "All done! Logged to your spreadsheet.";
            bot.sendMessage(CHAT_ID, successMsg);
        } catch (error) {
            console.error("Error saving data:", error.message);
            bot.sendMessage(CHAT_ID, "Failed to save. Check terminal logs.");
        }
    }
}

// In local development, handle messages via polling event only if explicitly enabled
if (!isVercel && enablePolling) {
    bot.on('message', async (msg) => {
        try {
            await handleTelegramMessage(msg);
        } catch (err) {
            console.error("Polling message error:", err.message);
        }
    });

    app.listen(PORT, () => {
        console.log(`Server running locally on http://localhost:${PORT}`);
        console.log(`Telegram Bot is awake and listening via polling...`);
    });
} else if (!isVercel) {
    app.listen(PORT, () => {
        console.log(`Server running locally on http://localhost:${PORT} (Webhook mode)`);
    });
}

// Export Express app for Vercel Serverless Functions
module.exports = app;