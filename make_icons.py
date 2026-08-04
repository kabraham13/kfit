import math
from PIL import Image, ImageDraw

def create_header_dumbbell_icon(size, filename):
    # Render at 4x resolution for supersampled anti-aliasing
    scale = 4
    high_res_size = size * scale
    
    img = Image.new("RGBA", (high_res_size, high_res_size), (9, 10, 15, 255))
    draw = ImageDraw.Draw(img)

    # 1. Gradient Background (brand-600 #2563eb to indigo-500 #6366f1)
    margin = int(high_res_size * 0.06)
    box = [(margin, margin), (high_res_size - margin, high_res_size - margin)]
    radius = int(high_res_size * 0.28)

    # Draw gradient fill inside rounded rectangle
    bg_mask = Image.new("L", (high_res_size, high_res_size), 0)
    bg_mask_draw = ImageDraw.Draw(bg_mask)
    bg_mask_draw.rounded_rectangle(box, radius=radius, fill=255)

    gradient_img = Image.new("RGBA", (high_res_size, high_res_size))
    g_draw = ImageDraw.Draw(gradient_img)

    # Diagonal gradient
    for y in range(high_res_size):
        for x in range(high_res_size):
            t = (x + (high_res_size - y)) / (2.0 * high_res_size)
            t = max(0.0, min(1.0, t))
            r = int(37 + (99 - 37) * t)
            g = int(99 + (102 - 99) * t)
            b = int(235 + (241 - 235) * t)
            g_draw.point((x, y), fill=(r, g, b, 255))

    img.paste(gradient_img, (0, 0), bg_mask)

    # 2. Draw Rotated White Dumbbell (-45 deg)
    db_img = Image.new("RGBA", (high_res_size, high_res_size), (0, 0, 0, 0))
    db_draw = ImageDraw.Draw(db_img)

    center = high_res_size / 2.0
    bar_len = high_res_size * 0.44
    bar_thick = int(high_res_size * 0.07)

    # Horizontal dumbbell bar
    db_draw.line(
        [(center - bar_len / 2.0, center), (center + bar_len / 2.0, center)],
        fill=(255, 255, 255, 255),
        width=bar_thick
    )

    # Outer weight plates
    plate_w = int(high_res_size * 0.06)
    plate_h = int(high_res_size * 0.26)
    plate_r = int(high_res_size * 0.03)

    # Left outer plate
    p1 = (center - bar_len / 2.0, center)
    db_draw.rounded_rectangle(
        [(p1[0] - plate_w / 2.0, p1[1] - plate_h / 2.0), (p1[0] + plate_w / 2.0, p1[1] + plate_h / 2.0)],
        radius=plate_r,
        fill=(255, 255, 255, 255)
    )

    # Right outer plate
    p2 = (center + bar_len / 2.0, center)
    db_draw.rounded_rectangle(
        [(p2[0] - plate_w / 2.0, p2[1] - plate_h / 2.0), (p2[0] + plate_w / 2.0, p2[1] + plate_h / 2.0)],
        radius=plate_r,
        fill=(255, 255, 255, 255)
    )

    # Inner weight plates
    inner_h = int(high_res_size * 0.20)
    offset = high_res_size * 0.08
    db_draw.rounded_rectangle(
        [(p1[0] + offset - plate_w / 2.0, p1[1] - inner_h / 2.0), (p1[0] + offset + plate_w / 2.0, p1[1] + inner_h / 2.0)],
        radius=plate_r,
        fill=(255, 255, 255, 255)
    )
    db_draw.rounded_rectangle(
        [(p2[0] - offset - plate_w / 2.0, p2[1] - inner_h / 2.0), (p2[0] - offset + plate_w / 2.0, p2[1] + inner_h / 2.0)],
        radius=plate_r,
        fill=(255, 255, 255, 255)
    )

    # Rotate dumbbell -45 degrees
    rotated_db = db_img.rotate(-45, resample=Image.BICUBIC, center=(center, center))
    img.paste(rotated_db, (0, 0), rotated_db)

    # Downsample to target size with high-quality Lanczos anti-aliasing
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    final_img.save(filename, "PNG")
    print(f"Generated {filename} ({size}x{size})")

create_header_dumbbell_icon(192, "public/pwa-192.png")
create_header_dumbbell_icon(512, "public/pwa-512.png")
