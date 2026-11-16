# My bank wouldn't tell my code when I paid, so I read its email instead

I track every expense manually. Coffee, laundry, the 15,000 rupiah lunch near campus. For about two years I did it by opening a spreadsheet after each transaction, and for two years I quit every few weeks.

The failure wasn't discipline. It was placement. The moment I needed to record something was the exact moment I was standing at a food stall with a phone in one hand, and the recording task wanted eight fields.

So I tried to automate it. What follows is the part I didn't expect: the hard problem was not the spreadsheet, the bot, or the serverless deployment. It was getting my bank to admit a transaction happened.

---

## Attempt one: read the notification

Every Android tutorial for this suggests `NotificationListenerService`. It gives your app a callback for every notification posted on the device, with the source package and the text. Filter for the bank app, regex the amount, POST it somewhere. Roughly fifty lines.

I wrote it. It compiled. It worked perfectly on my test notification.

It never once saw a real payment.

### Why it failed

Three separate reasons, and I only found them by instrumenting each layer:

**There is no notification.** The bank app shows a transaction receipt screen inside the app. It does not post a status-bar notification for a payment you initiated yourself. My listener was subscribed to an event stream that never carried the data I wanted.

**Even when there is one, the text is hidden.** Banking apps render notifications with custom `RemoteViews`. The standard extras that listener services read, `EXTRA_TITLE`, `EXTRA_TEXT`, `EXTRA_BIG_TEXT`, come back `null` or as a static label like "Notifikasi Transaksi".

**Even when the text is there, it can be masked.** Financial apps set `VISIBILITY_PRIVATE`, and the platform redacts content for third-party listeners.

There was a fourth, more mundane killer: I could not keep the service alive. OEM battery managers unbind listener services within minutes of the screen turning off, even with the battery optimization exemption granted. Notifications occasionally arrived the next morning, in a batch, to an app that had been asleep.

I shipped that version and used it for two weeks. It caught nothing. The folder got renamed to `[abandoned]`.

---

## Attempt two: read the email

The bank does send an official receipt email for these payments. Same information, structured differently, no notification permission required.

I moved ingestion into Google Apps Script, polling Gmail every minute on a time-driven trigger. The script extracts the amount and merchant, then POSTs to my existing backend. The rest of the pipeline stayed as it was: webhook, Telegram alert, my reply with a category, write to Sheets.

Here is a real one, with the sensitive parts removed:

```text
Status : Successful
Transaction Date : 10 Oct 2026 14:19:02
Transaction Type : QRIS Payment
Payment to : Kedai Hap
Acquirer : BANK MANDIRI
Total Payment : IDR 15,000.00
Reference No. : 9527120261010...
```

Two lines matter:

```javascript
const amount = body.match(/(?:Total\s*Payment|Nominal|Rp|IDR)\s*[:.]?\s*(?:Rp|IDR)?\s*([0-9.,]+)/i);
const merchant = body.match(/(?:Payment to|Penerima|Merchant)\s*:\s*([^\n\r]+)/i);
```

That was the moment the project started working. But it took another round of debugging to make it *stay* working.

---

## The interesting part: six bugs, six lessons

Everything below came from production. I found each one because a transaction silently didn't appear.

### 1. A five-minute window silently ate real payments

My first version ignored any email older than five minutes, to prevent a flood of historical unread mail on first run. Reasonable. Except the bank queues receipts, and the email for a 14:19 transaction landed at 14:24. My own safety check was discarding genuine transactions.

The window is now thirty minutes, and the reason is written in the constant's comment so future-me doesn't tighten it again.

### 2. The bot deleted its own webhook

This one is nasty. `node-telegram-bot-api` calls `deleteWebhook()` on construction whenever it starts in polling mode. My code read:

```javascript
const bot = new TelegramBot(TOKEN, { polling: !isVercel });
```

Sensible-looking: poll locally, use webhooks in production. But a single local `node server.js` run wiped the deployed webhook. The bot still *sent* messages, so nothing looked broken. Every reply I sent was quietly piling up in Telegram's queue.

The diagnostic is one call:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
# "url": "", "pending_update_count": 2   ← webhook gone, two replies stranded
```

Polling is now strictly opt-in:

```javascript
const enablePolling = process.env.ENABLE_POLLING === 'true';
const bot = new TelegramBot(TOKEN, { polling: enablePolling });
```

Re-registering the webhook flushed the backlog immediately, and two stale transactions landed at once.

### 3. One uncaught exception skipped the primary write

I renamed a spreadsheet tab from `Raw_Transactions` to `Raw/lost Transactions`. The code still had the old name hardcoded, the API returned `Unable to parse range`, and because that append sat outside its own `try/catch`, the exception aborted the whole handler before the *other* write ran.

Two writes now, independently guarded. The transaction only reports failure if both fail. Tab names are resolved at runtime rather than hardcoded, and every range is quoted, because `'Raw/lost Transactions'!A:D` parses and `Raw/lost Transactions!A:D` does not.

### 4. Idempotency with no database

Serverless functions share no memory between invocations, so there is no natural place for an "already processed" flag. Duplicate replies to the same Telegram alert created duplicate rows.

The fix uses something that *is* stateful and already there: the message itself. After a successful write, the original alert is edited in place to `Transaction Logged ✓`. Before any write, the handler inspects the parent message text and rejects a second reply.

The state lives in the conversation, so it survives cold starts and redeploys without a database.

### 5. Day-number matching hit the wrong month

I generate the monthly ledger tabs automatically. A generated month includes adjacent-month dates: November 2026 starts with `Senin 26 Oktober`. Matching a day cell by number alone found the wrong cell.

Matching now runs twice: day number plus month name first, bare day number only as a fallback.

### 6. Telegram file URLs are not storage

Receipt images were stored as Telegram file links. Those expire within hours, and worse, the URL contains the bot token, which ended up inside spreadsheet cells.

Receipts now go to a CDN and render in-cell as `=HYPERLINK(url, IMAGE(url))`, which shows a thumbnail and opens the full image on click.

---

## What it does now

One payment produces one Telegram message. One reply produces a categorized row in a raw audit tab, a placement into the correct day block of a generated monthly ledger, and a hyperlinked receipt. The alert is then locked against duplicate replies.

Three runtimes (Vercel serverless, Google Apps Script, Google Sheets), one JSON contract between them.

## What I'd do differently

**Start from the capability, not the API.** I began with "how do I read notifications" instead of "what signals does this bank actually emit". A day of investigation up front would have skipped two weeks of building something structurally impossible.

**Write the abandonment note in the repo, not just the folder name.** The `[abandoned]` suffix told me nothing six months later. The post-mortem table in the README is the most useful documentation in the project.

**Assume the source is lossy.** Every bug in the second list came from believing a happy path: the email arrives promptly, the tab name is stable, the webhook stays registered. Each one is now an explicit comment or a guard.

The code and the full write-up are here: **[github.com/zevlord/bca-server](https://github.com/zevlord/bca-server)** — MIT licensed. The abandoned Android client is in there too, because the failure is the more interesting half.
