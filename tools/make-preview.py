#!/usr/bin/env python3
"""Génère assets/preview.gif depuis les sprites du projet.

Scénario : arrivée (waving) -> working -> waiting -> sleeping -> jardin (idle_happy
sur grass.png). Les 4 premières scènes sont composées sur un fond sombre
imitant le top bar GNOME ; la 5e imite le popup avec son île d'herbe.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "assets" / "sprites"
GRASS = ROOT / "assets" / "grass.png"
OUT = ROOT / "assets" / "preview.gif"

W, H = 320, 160
PANEL_BG = (40, 40, 45, 255)
POPUP_BG = (50, 50, 58, 255)
TEXT_FG = (220, 220, 220, 255)


def load_font(size):
    for p in (
        "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


FONT = load_font(13)


def load_frames(name):
    img = Image.open(SPRITES / name).convert("RGBA")
    n = img.size[0] // 64
    return [img.crop((i * 64, 0, (i + 1) * 64, 64)) for i in range(n)]


def draw_label(canvas, label, y_offset=10):
    draw = ImageDraw.Draw(canvas)
    tw = draw.textlength(label, font=FONT)
    draw.text(((W - tw) / 2, H - y_offset - 14), label, fill=TEXT_FG, font=FONT)


def panel_frame(sprite, label):
    bg = Image.new("RGBA", (W, H), PANEL_BG)
    scaled = sprite.resize((112, 112), Image.NEAREST)
    bg.paste(scaled, ((W - 112) // 2, (H - 112) // 2 - 8), scaled)
    draw_label(bg, label)
    return bg


def make_grass_strip(width, height):
    tile = Image.open(GRASS).convert("RGBA").resize((64, 64))
    strip = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for x in range(0, width, 64):
        for y in range(0, height, 64):
            strip.paste(tile, (x, y))
    return strip


def garden_frame(sprite, label):
    bg = Image.new("RGBA", (W, H), (30, 30, 35, 255))
    pad_x, pad_y = 20, 14
    popup = Image.new("RGBA", (W - 2 * pad_x, H - 2 * pad_y - 18), POPUP_BG)
    island_h = 90
    island = make_grass_strip(popup.size[0], island_h)
    island_mask = Image.new("L", island.size, 0)
    ImageDraw.Draw(island_mask).rounded_rectangle(
        (0, 0, island.size[0] - 1, island.size[1] - 1), radius=8, fill=255
    )
    popup.paste(island, (0, 6), island_mask)
    scaled = sprite.resize((80, 80), Image.NEAREST)
    popup.paste(scaled, ((popup.size[0] - 80) // 2, 8), scaled)
    # Round popup corners
    pmask = Image.new("L", popup.size, 0)
    ImageDraw.Draw(pmask).rounded_rectangle(
        (0, 0, popup.size[0] - 1, popup.size[1] - 1), radius=10, fill=255
    )
    popup.putalpha(pmask)
    bg.paste(popup, (pad_x, pad_y), popup)
    draw_label(bg, label, y_offset=6)
    return bg


SCENES = [
    ("waving", "claude_waving_neutral.png", 25, "Session started"),
    ("working", "claude_working_neutral.png", 12, "Working"),
    ("waiting", "claude_waiting_neutral.png", 12, "Waiting for input"),
    ("sleeping", "claude_sleeping_neutral.png", 14, "Sleeping"),
    ("garden", "claude_idle_happy.png", 22, "In the garden"),
]


def main():
    frames = []
    for kind, sprite_file, count, label in SCENES:
        sheet = load_frames(sprite_file)
        n = len(sheet)
        composer = garden_frame if kind == "garden" else panel_frame
        for i in range(count):
            frames.append(composer(sheet[i % n], label))

    # GIF: convert each frame to a shared adaptive palette for smaller size
    out_frames = [
        f.convert("RGB").quantize(colors=128, method=Image.Quantize.MEDIANCUT)
        for f in frames
    ]

    out_frames[0].save(
        OUT,
        save_all=True,
        append_images=out_frames[1:],
        duration=100,  # ms per frame -> 10 fps
        loop=0,
        optimize=True,
        disposal=2,
    )
    size_kb = OUT.stat().st_size // 1024
    print(f"Wrote {OUT.relative_to(ROOT)}  ({size_kb} KB, {len(out_frames)} frames)")


if __name__ == "__main__":
    main()
