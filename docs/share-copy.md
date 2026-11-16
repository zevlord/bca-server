# Share copy

Ready-to-post text. Nothing here needs editing except links, which are already correct.

---

## LinkedIn — Project section

**BCA Auto Logger** — Personal project, 2026
[github.com/zevlord/bca-server](https://github.com/zevlord/bca-server)

Built a serverless pipeline that converts bank payment receipts into categorized
ledger entries with zero manual data entry. The interesting constraint: the bank
emits no push notification for user-initiated QRIS or transfer payments, so the
first design (an Android NotificationListenerService) could not work at all.
Diagnosed the capability gap, then re-architected ingestion around receipt emails
with Google Apps Script, a Node.js/Express backend on Vercel, and the Telegram and
Google Sheets APIs.

Engineering highlights: idempotent writes with no database (state encoded in the
Telegram message itself), automatic monthly ledger generation with formatting and
formulas, and graceful degradation between an append-only audit tab and a visual
grid after a production failure caused by a renamed sheet.

Stack: Node.js, Express, Java, Android SDK, REST APIs, Webhooks, Google Sheets API,
Google Apps Script, Telegram Bot API, Vercel, Git

---

## LinkedIn — Post

I spent a weekend trying to read my bank's notifications. It turns out the bank
never sends one.

For a QRIS payment or a transfer you initiate yourself, there is no status-bar
notification at all. The receipt exists only inside the app. Even when a
notification does fire, banking apps render custom RemoteViews, so the standard
text extras come back empty, and financial notifications are masked from
third-party listeners anyway.

So I stopped trying to read the event and started reading the receipt email
instead. Apps Script polls Gmail, extracts the amount and merchant, and posts to a
small Node backend on Vercel. That sends me a Telegram message; I reply with a
category; it writes the row into a Google Sheet and edits my original message to
"Transaction Logged" so I can't log it twice.

Six bugs later it has been logging every payment for a while. The ones worth
knowing about:

- A 5-minute freshness window was silently discarding real payments, because the
  bank queues emails for up to 15 minutes
- Running the backend locally once deleted the production Telegram webhook,
  because the bot library clears it on startup in polling mode. The bot still sent
  messages, so it looked healthy while every reply was stranded
- Renaming a spreadsheet tab broke a hardcoded range, the uncaught error skipped
  the primary write, and the transaction vanished

The abandoned Android client is still in the repo. The post-mortem is the more
useful artifact.

Code and write-up: github.com/zevlord/bca-server

---

## dev.to / Medium — metadata

**Title:** My bank wouldn't tell my code when I paid, so I read its email instead

**Tags:** javascript, node, automation, showdev

**Cover image:** `docs/social-preview.png`

**Canonical URL:** leave blank on dev.to, then use the dev.to URL as canonical on
Medium if syndicating.

**Description / summary:**
Why an Android notification listener could not possibly work for this bank, and the
six production bugs that came after switching to email ingestion.

**Repo line to append at the end:** already included in the article body.

---

## GitHub repo settings

**Description:**
Serverless bookkeeping pipeline: bank receipt emails to Telegram prompt to Google
Sheets, with idempotent writes and auto-generated monthly ledgers

**Topics:**
nodejs, express, serverless, vercel, google-sheets-api, telegram-bot, webhook,
automation, android, java, bookkeeping, google-apps-script

**Social preview:** upload `docs/social-preview.png` (Settings → Social preview)
