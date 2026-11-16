/**
 * Centralized configuration.
 *
 * Every credential comes from the environment. There are no fallback secrets
 * in source, because a cloned repository must never inherit a live bot token,
 * chat id, or spreadsheet id.
 *
 * Local development: copy .env.example to .env and fill it in.
 * Production:        set the same keys in Vercel > Settings > Environment Variables.
 */

const REQUIRED = ['TELEGRAM_TOKEN', 'CHAT_ID', 'SPREADSHEET_ID'];

const OPTIONAL = {
    IMGBB_API_KEY: '',
    PORT: '3000',
    ENABLE_POLLING: 'false',
    DASHBOARD_SECRET: ''
};

function readEnv() {
    const missing = REQUIRED.filter((key) => !process.env[key]);

    const config = {
        telegramToken: process.env.TELEGRAM_TOKEN || '',
        chatId: process.env.CHAT_ID || '',
        spreadsheetId: process.env.SPREADSHEET_ID || '',
        imgbbApiKey: process.env.IMGBB_API_KEY || OPTIONAL.IMGBB_API_KEY,
        port: process.env.PORT || OPTIONAL.PORT,
        // Polling must stay off in production: node-telegram-bot-api deletes the
        // registered webhook whenever it starts polling, which silently strands
        // every incoming update. Opt in explicitly for offline testing only.
        enablePolling: process.env.ENABLE_POLLING === 'true',
        // Empty means the dashboard is public. Set it to require ?key=... .
        dashboardSecret: process.env.DASHBOARD_SECRET || '',
        isVercel: Boolean(process.env.VERCEL)
    };

    return { config, missing };
}

const { config, missing } = readEnv();

if (missing.length > 0) {
    console.error(
        `[config] Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them in .env locally or in Vercel project settings. Requests that need ' +
        'them will fail until they are present.'
    );
}

/** Boolean-only readiness map. Safe to expose on a health endpoint. */
function readiness() {
    return {
        telegram_token: Boolean(config.telegramToken),
        chat_id: Boolean(config.chatId),
        spreadsheet_id: Boolean(config.spreadsheetId),
        imgbb: Boolean(config.imgbbApiKey),
        google_service_account: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
        // Dashboard is fail-closed: without a secret it returns 503.
        dashboard_secret_set: Boolean(config.dashboardSecret),
        polling: config.enablePolling
    };
}

module.exports = { config, missing, readiness, REQUIRED };
