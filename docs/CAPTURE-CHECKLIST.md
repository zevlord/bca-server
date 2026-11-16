# Capture checklist

Two screenshots are missing from the README. Both need to come from your live setup;
nothing here can be generated.

Once you have them, drop them in `docs/screenshots/` using the exact filenames below,
then paste the block at the bottom of this file into `README.md` right after the
"Architecture" section.

---

## Shot 1 — `docs/screenshots/telegram-flow.png`

**What to capture:** a Telegram screenshot showing, top to bottom:

1. The bot alert — `New Transaction Detected!` with the amount and merchant
2. Your reply with a category
3. The same alert edited to `Transaction Logged ✓` with `Status: Saved to Google Sheets`

**How:** scroll to a completed transaction in the chat with `@BcaMyLoggerBot`, then
screenshot the message group. On desktop use a window capture; on mobile crop to the
relevant messages.

**Scrub before saving:** nothing usually needs removing here, but check that no
receipt image in the background shows a card number or full name.

---

## Shot 2 — `docs/screenshots/monthly-ledger.png`

**What to capture:** the `November 2026` tab, cropped to show Weeks 1 and 2 — green
header row, solid borders, two or three filled rows under a day, and the `Total` row
with its summed value.

**How:** select `A1:H14`, then screenshot that region.

**Scrub before saving:** this is the risky one.

- Replace real merchant names with neutral ones (`Kopi`, `Makan`, `Laundry`) before
  capturing, or capture a throwaway copy of the sheet
- Make sure no sheet tab at the bottom reveals a personal account name
- Prices alone are not sensitive; merchant-plus-timestamp is the combination to avoid

**Easiest safe path:** duplicate the spreadsheet, rename it `BCA Auto Logger — demo`,
clear the real rows, type three fake ones, and screenshot that. You keep your real
ledger private and the screenshot still shows exactly what the system produces.

---

## Markdown to paste

Paste this immediately after the `## Architecture` section (after the closing
```-fence of the mermaid block, before `---`):

```markdown
## Screenshots

**The whole loop in one chat.** The alert is edited in place after the write, which
is what locks out duplicate replies.

![Telegram flow](docs/screenshots/telegram-flow.png)

**What the write produces.** Month tab generated on demand, day block located by
date, receipt hyperlinked onto the description.

![Monthly ledger](docs/screenshots/monthly-ledger.png)
```

---

## Also do these once

- **Repo social preview:** Settings → Social preview → upload `docs/social-preview.png`
- **Revoke the old bot token** with `@BotFather` → `/revoke` before making the repo
  public. The token from the initial commit is still readable in git history.
- **Set `DASHBOARD_SECRET`** in Vercel, otherwise the dashboard is public.
