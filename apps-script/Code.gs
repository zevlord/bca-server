/**
 * BCA Transaction Watcher - Google Apps Script ingestion layer.
 *
 * WHY THIS EXISTS
 * The original design read Android notifications from the banking app. That
 * failed: the bank emits no status-bar notification for user-initiated QRIS or
 * transfer payments, and notification extras are masked for financial apps.
 * The same payments DO generate an official receipt email, so ingestion moved
 * to the mailbox. This script is that layer.
 *
 * SETUP
 * 1. Create a project at https://script.google.com on the account that receives
 *    the bank emails.
 * 2. Enable email notifications in the banking app:
 *    Pengaturan > Personalisasi > Notifikasi > Pengaturan Email > Transaksi Finansial
 * 3. Paste this file, set WEBHOOK_URL, then add a time-driven trigger:
 *    function pollBcaTransactionEmails, Minutes timer, every 1 minute.
 * 4. Run once manually to grant Gmail + external request permissions.
 *
 * NOTE ON LATENCY
 * The bank queues receipts. Delivery lag of 1-15 minutes is normal, which is
 * why MAX_AGE_MINUTES is 30. A tighter window silently drops real payments.
 */

const WEBHOOK_URL = 'https://your-deployment.vercel.app/api/webhook';
const MAX_AGE_MINUTES = 30;
const SENDER_QUERY = 'from:(bca.co.id) ("QRIS Payment" OR "myBCA" OR "Transaksi" OR "Transfer")';

function pollBcaTransactionEmails() {
  try {
    const threads = GmailApp.search(`${SENDER_QUERY} is:unread newer_than:1d`, 0, 5);
    const now = Date.now();

    threads.forEach(function (thread) {
      const messages = thread.getMessages();
      const latest = messages[messages.length - 1];
      const ageMinutes = (now - latest.getDate().getTime()) / 60000;

      // Stale mail is marked read without firing, so a first run cannot flood
      // the webhook with historical transactions.
      if (ageMinutes > MAX_AGE_MINUTES) {
        thread.markRead();
        return;
      }

      const body = latest.getPlainBody();
      const amount = extractAmount(body);
      if (!amount) {
        thread.markRead();
        return;
      }

      const merchant = firstMatch(body, /(?:Payment to|Penerima|Merchant)\s*:\s*([^\n\r]+)/i);
      const summary = merchant ? `QRIS ke ${merchant} (${amount.raw})` : body.substring(0, 300).trim();

      post({
        amount: amount.clean,
        raw_text: summary,
        package_name: 'email.mybca'
      });

      thread.markRead();
    });
  } catch (err) {
    // Google occasionally returns transient INTERNAL storage errors. Swallowing
    // them lets the next minute's run succeed instead of emailing a failure
    // alert on every tick.
    console.error('Poll skipped: ' + err.message);
  }
}

function extractAmount(body) {
  const match = body.match(/(?:Total\s*Payment|Nominal|Jumlah|Rp|IDR)\s*[:.]?\s*(?:Rp|IDR)?\s*([0-9.,]+)/i);
  if (!match) return null;

  var raw = match[1].trim();
  // Drop trailing cents: "15,000.00" -> "15,000"
  if (/[.,]\d{2}$/.test(raw)) raw = raw.substring(0, raw.length - 3);

  const clean = raw.replace(/[^0-9]/g, '');
  return clean ? { raw: raw, clean: clean } : null;
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function post(payload) {
  try {
    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    console.error('Webhook dispatch failed: ' + err.message);
  }
}
