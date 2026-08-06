"""Generates the monochrome notification badge.

Android's status bar renders a notification's `badge` as an alpha mask: colour is
discarded and every non-transparent pixel is painted white. Passing pwa-192.png
there produced a solid white square, because that icon is fully opaque.

So this draws the dumbbell glyph in white on a fully transparent canvas — only
the silhouette survives the mask. Geometry matches favicon.svg / make_icons.py,
scaled up slightly since there is no background plate to sit inside.
"""

from PIL import Image, ImageDraw


def create_notification_badge(size, filename):
    # Supersample for clean edges on the diagonal.
    scale = 4
    hi = size * scale

    img = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    center = hi / 2.0
    white = (255, 255, 255, 255)

    # Deliberately simpler than the app icon: this renders at 24dp in the status
    # bar, where the app icon's four thin plates smear into an illegible blob.
    # One thick bar and two chunky plates survive the downscale.
    bar_len = hi * 0.56
    bar_thick = int(hi * 0.16)

    draw.line(
        [(center - bar_len / 2.0, center), (center + bar_len / 2.0, center)],
        fill=white,
        width=bar_thick,
    )

    plate_w = int(hi * 0.17)
    plate_h = int(hi * 0.52)
    plate_r = int(hi * 0.075)

    left = center - bar_len / 2.0
    right = center + bar_len / 2.0

    for x in (left, right):
        draw.rounded_rectangle(
            [(x - plate_w / 2.0, center - plate_h / 2.0),
             (x + plate_w / 2.0, center + plate_h / 2.0)],
            radius=plate_r,
            fill=white,
        )

    rotated = img.rotate(-45, resample=Image.BICUBIC, center=(center, center))

    final_img = rotated.resize((size, size), Image.Resampling.LANCZOS)
    final_img.save(filename, "PNG")
    print(f"Generated {filename} ({size}x{size})")


# 96px covers Android's 24dp status bar icon at xxxhdpi.
create_notification_badge(96, "public/badge-96.png")
