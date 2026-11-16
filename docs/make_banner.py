"""Generate a 1280x640 social preview banner: typographic, hairline ledger, monochrome."""

from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 640
BG = (8, 9, 10)
FRAME = (35, 38, 41)
RULE = (28, 31, 34)
ROW_FILL = (18, 20, 22)
MUTED = (128, 134, 144)
DIM = (110, 116, 124)
BODY = (168, 174, 184)
WHITE = (240, 240, 240)

FONTS = "C:/Windows/Fonts/"
LEFT = 64
RIGHT = W - 64


def font(name, size):
    try:
        return ImageFont.truetype(FONTS + name, size)
    except Exception:
        return ImageFont.load_default()


title_f = font("segoeuib.ttf", 78)
sub_f = font("segoeui.ttf", 26)
label_f = font("seguisb.ttf", 14)
mono_f = font("consola.ttf", 19)
small_f = font("segoeui.ttf", 17)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)


def spaced(draw, xy, text, f, fill, tracking=3.2):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textlength(ch, font=f) + tracking


def right_align(draw, x_right, y, text, f, fill):
    w = draw.textlength(text, font=f)
    draw.text((x_right - w, y), text, font=f, fill=fill)


# Hairline frame
d.rectangle([31, 31, W - 32, H - 32], outline=FRAME, width=1)

# Top strip
spaced(d, (LEFT, 88), "PERSONAL PROJECT", label_f, MUTED)
right_align(d, RIGHT, 88, "MIT \u00b7 2026", label_f, DIM)

# Title
d.text((LEFT - 4, 128), "BCA Auto Logger", font=title_f, fill=WHITE)

# Subtitle
d.text((LEFT, 232), "Payment receipts, booked without opening a spreadsheet.",
       font=sub_f, fill=BODY)

# Divider
d.line([(LEFT, 296), (LEFT + 460, 296)], fill=RULE, width=1)

# Pipeline
d.text((LEFT, 326), "gmail  \u2192  apps script  \u2192  webhook  \u2192  telegram  \u2192  sheets",
       font=mono_f, fill=(206, 210, 215))
d.text((LEFT, 358), "one reply closes the loop", font=mono_f, fill=DIM)

# Footer stats
d.text((LEFT, 512), "3 runtimes   \u00b7   6 external APIs   \u00b7   1 human reply",
       font=small_f, fill=MUTED)

# --- Right motif: a quiet ledger table ---
TX0, TX1 = 768, RIGHT
TY0, TY1 = 176, 496
ROWS = 7
COLS = [TX0, 906, 1048, TX1]

row_h = (TY1 - TY0) / ROWS

# Filled highlight row
hl = 3
d.rectangle([TX0 + 1, TY0 + hl * row_h + 1, TX1 - 1, TY0 + (hl + 1) * row_h - 1],
            fill=ROW_FILL)

# Table rules
for i in range(ROWS + 1):
    y = TY0 + i * row_h
    d.line([(TX0, y), (TX1, y)], fill=RULE, width=1)
for x in COLS:
    d.line([(x, TY0), (x, TY1)], fill=RULE, width=1)

# Row ticks in the first column
for i in range(ROWS):
    y = TY0 + (i + 0.5) * row_h
    length = 60 if i % 3 == 0 else 34
    d.line([(TX0 + 16, y), (TX0 + 16 + length, y)],
           fill=(120, 126, 136) if i == hl else (48, 52, 57), width=1)

# Amount ticks in the last column, right aligned
for i in range(ROWS):
    y = TY0 + (i + 0.5) * row_h
    length = 44 if i % 2 == 0 else 30
    d.line([(TX1 - 16 - length, y), (TX1 - 16, y)],
           fill=(120, 126, 136) if i == hl else (48, 52, 57), width=1)

# Caption under the table
d.text((TX0, 512), "monthly ledger, generated on demand", font=small_f, fill=DIM)

img.save("social-preview.png", "PNG", optimize=True)
print("wrote social-preview.png", img.size)
