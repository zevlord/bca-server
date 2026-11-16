# Google Apps Script layer

The ingestion half of the pipeline. It lives outside the Node.js deployment because
it must run inside Google's infrastructure with authorized access to the mailbox.

## Why a script and not a webhook

Gmail has no inbound webhook for "new message matching this query". Google Apps
Script is the supported way to poll a mailbox on a schedule without hosting a
mail server or storing an OAuth refresh token yourself.

## Deploy

1. Open [script.google.com](https://script.google.com) on the Gmail account that
   receives the bank receipts and create a project.
2. Replace the editor contents with [`Code.gs`](Code.gs).
3. Set `WEBHOOK_URL` to your deployment, e.g.
   `https://your-deployment.vercel.app/api/webhook`.
4. Triggers (clock icon) → Add Trigger:

   | Field | Value |
   | :--- | :--- |
   | Function | `pollBcaTransactionEmails` |
   | Event source | Time-driven |
   | Type | Minutes timer |
   | Interval | Every minute |

5. Run once manually and approve the OAuth consent screen (Gmail read/write plus
   external requests).

## Payload contract

```json
{
  "amount": "15000",
  "raw_text": "QRIS ke Kedai Hap (15,000)",
  "package_name": "email.mybca"
}
```

`package_name` keeps the original Android client's field name so the backend
needs no branching between the two ingestion paths.

## Known characteristics

| Behaviour | Detail |
| :--- | :--- |
| Delivery latency | 1-15 minutes; the bank queues receipts. `MAX_AGE_MINUTES = 30` tolerates it. |
| Idempotency | Every processed thread is marked read, so a message fires once. |
| Failure mode | Transient Google `INTERNAL` errors are caught and skipped; the next minute retries naturally. |
| Coverage | QRIS payments, transfers, and virtual account payments. Not all transaction types generate an email — anything that only exists as an in-app receipt is not captured by this layer. |
