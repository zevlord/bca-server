# Security

## Reporting

Open a private security advisory through GitHub, or contact the address on the
maintainer's GitHub profile. Please do not file a public issue for anything that
could expose a credential or a live deployment.

## Credential handling

No credential ships in this repository, and none has ever been present in its
published history — the history was rewritten to remove an early commit that
embedded a bot token in source.

Everything sensitive is read from the environment at boot:

| Variable | Sensitivity |
| :--- | :--- |
| `TELEGRAM_TOKEN` | Bot control. Rotating it invalidates the old value immediately. |
| `CHAT_ID` | Identifies the single recipient. Not a secret on its own. |
| `SPREADSHEET_ID` | Useless without the service account, which is not shared. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Grants Sheets access. Scope it to one spreadsheet. |
| `IMGBB_API_KEY` | Upload only. Can be revoked from the ImgBB dashboard. |
| `DASHBOARD_SECRET` | Gates the debug dashboard. |

`config.js` refuses to fall back to a built-in value for the three required
variables. A missing key is logged and the dependent request fails loudly rather
than silently using a default.

## Design decisions with security consequences

**The dashboard is disabled unless `DASHBOARD_SECRET` is set.** It renders real
merchant names, amounts, timestamps, and receipt links. Fail-closed is the only
acceptable default for a view of this kind.

**Receipt images are public once uploaded.** ImgBB URLs are unlisted and
unguessable, but they are unauthenticated: anyone holding the link can view the
image. Do not use this pipeline for documents containing account numbers, card
numbers, or identity data. Wiring in private object storage with signed URLs is
the correct fix for that requirement.

**The Telegram webhook is unauthenticated by protocol.** Telegram sends no shared
secret header, so a forged POST to `/api/telegram-webhook` is possible. The impact
is bounded: the handler drops any update whose chat id does not match `CHAT_ID`,
and rejects replies whose parent message is not an unsigned transaction alert.

**Polling is opt-in.** `ENABLE_POLLING` defaults to false. Enabling it against a
production bot token deletes the registered webhook.
