#!/usr/bin/env python3
"""
Generates the official 7X Launcher transparent PNG logo, multi-resolution Windows ICO,
Tauri desktop icons, and website favicon.

Design:
- Text only: "7X"
- Clean, modern geometric typography
- Blue gradient colour theme (#38BDF8 -> #2563EB -> #1D4ED8)
- 100% transparent background, no extra symbols or text
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent

# Supersampled canvas for razor-sharp anti-aliased vector edges
SIZE = 1024


def build_7x_mask(size: int) -> Image.Image:
    """Draws sleek, custom modern geometric '7X' letterforms onto an alpha mask."""
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    s = size / 1000.0

    def pt(x: float, y: float) -> tuple[float, float]:
        return (x * s, y * s)

    # --- Modern Geometric "7" (left half) ---
    # Sleek angled top bar with subtle chamfered left edge
    seven_top = [
        pt(95, 225),
        pt(470, 225),
        pt(470, 322),
        pt(125, 322),
    ]
    # Crisp diagonal stem descending cleanly
    seven_stem = [
        pt(368, 225),
        pt(470, 225),
        pt(276, 775),
        pt(166, 775),
    ]
    d.polygon(seven_top, fill=255)
    d.polygon(seven_stem, fill=255)

    # --- Modern Geometric "X" (right half) ---
    # Main top-left to bottom-right stroke
    x_stroke_1 = [
        pt(510, 225),
        pt(624, 225),
        pt(905, 775),
        pt(791, 775),
    ]
    # Cross top-right to bottom-left stroke
    x_stroke_2 = [
        pt(791, 225),
        pt(905, 225),
        pt(624, 775),
        pt(510, 775),
    ]
    d.polygon(x_stroke_1, fill=255)
    d.polygon(x_stroke_2, fill=255)

    return mask


def render_7x_logo(size: int = SIZE) -> Image.Image:
    """Renders the blue gradient 7X logo with subtle specular top edge and soft shadow."""
    mask = build_7x_mask(size)

    # Build diagonal modern blue gradient (cyan-sky -> azure -> cobalt blue)
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = min(1.0, max(0.0, (0.35 * x + 0.65 * y) / size))
            if t < 0.5:
                k = t / 0.5
                r = int(56 + (37 - 56) * k)    # #38BDF8 -> #2563EB
                g = int(189 + (99 - 189) * k)
                b = int(248 + (235 - 248) * k)
            else:
                k = (t - 0.5) / 0.5
                r = int(37 + (29 - 37) * k)    # #2563EB -> #1D4ED8
                g = int(99 + (78 - 99) * k)
                b = int(235 + (216 - 235) * k)
            px[x, y] = (r, g, b, 255)

    # Subtle glossy upper-edge highlight inside the glyph for modern desktop polish
    highlight = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    hpx = highlight.load()
    for y in range(int(size * 0.45)):
        alpha = int(58 * (1.0 - y / (size * 0.45)))
        for x in range(size):
            hpx[x, y] = (224, 244, 255, alpha)

    grad = Image.alpha_composite(grad, highlight)

    # Apply crisp 7X glyph mask
    logo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    logo.paste(grad, (0, 0), mask)

    # Subtle soft drop shadow so 7X remains legible on both light & dark Windows taskbars
    shadow = Image.new("RGBA", (size, size), (6, 20, 48, 0))
    shadow_alpha = mask.point(lambda a: int(a * 0.42))
    shadow.putalpha(shadow_alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.018))

    final_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    final_img.alpha_composite(shadow, (0, int(size * 0.014)))
    final_img.alpha_composite(logo, (0, 0))
    return final_img


def save_resized(img: Image.Image, target: Path, px_size: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    resized = img.resize((px_size, px_size), Image.Resampling.LANCZOS)
    resized.save(target, format="PNG")
    print(f"Wrote {target.relative_to(ROOT)} ({px_size}x{px_size})")


def main() -> None:
    master = render_7x_logo(SIZE)

    # 1. Tauri desktop app & window/taskbar icons
    tauri_icons = ROOT / "apps/launcher/src-tauri/icons"
    save_resized(master, tauri_icons / "icon.png", 512)
    save_resized(master, tauri_icons / "128x128@2x.png", 256)
    save_resized(master, tauri_icons / "128x128.png", 128)
    save_resized(master, tauri_icons / "32x32.png", 32)

    # Multi-resolution Windows ICO (taskbar, Alt-Tab, Explorer, NSIS installer)
    ico_path = tauri_icons / "icon.ico"
    master.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"Wrote {ico_path.relative_to(ROOT)} (multi-res Windows ICO)")

    # 2. Launcher frontend public logo (for TitleBar & browser preview favicon)
    launcher_pub = ROOT / "apps/launcher/public"
    save_resized(master, launcher_pub / "logo-7x.png", 512)
    master.save(
        launcher_pub / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"Wrote {(launcher_pub / 'favicon.ico').relative_to(ROOT)}")

    # 3. Website transparent PNG logo & favicons
    web_pub = ROOT / "apps/website/public"
    save_resized(master, web_pub / "logo-7x.png", 512)
    save_resized(master, web_pub / "favicon.png", 64)
    master.save(
        web_pub / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"Wrote {(web_pub / 'favicon.ico').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
