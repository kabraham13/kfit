from PIL import Image, ImageDraw

def create_pwa_icon(size, filename):
    # Create dark background matching app theme (#090A0F)
    img = Image.new("RGBA", (size, size), (9, 10, 15, 255))
    draw = ImageDraw.Draw(img)

    # Draw rounded rectangle container
    margin = int(size * 0.1)
    corner_radius = int(size * 0.25)
    
    # Outer glow / gradient boundary
    draw.rounded_rectangle(
        [(margin, margin), (size - margin, size - margin)],
        radius=corner_radius,
        fill=(18, 20, 29, 255),
        outline=(59, 130, 246, 255),
        width=int(size * 0.03)
    )

    # Draw diagonal dumbbell bar
    line_width = int(size * 0.08)
    p1 = (int(size * 0.32), int(size * 0.68))
    p2 = (int(size * 0.68), int(size * 0.32))
    draw.line([p1, p2], fill=(59, 130, 246, 255), width=line_width)

    # Left weight plate
    r1 = int(size * 0.12)
    draw.ellipse([(p1[0]-r1, p1[1]-r1), (p1[0]+r1, p1[1]+r1)], fill=(37, 99, 235, 255), outline=(255, 255, 255, 255), width=int(size*0.02))

    # Right weight plate
    draw.ellipse([(p2[0]-r1, p2[1]-r1), (p2[0]+r1, p2[1]+r1)], fill=(139, 92, 246, 255), outline=(255, 255, 255, 255), width=int(size*0.02))

    img.save(filename, "PNG")
    print(f"Saved {filename} ({size}x{size})")

create_pwa_icon(192, "public/pwa-192.png")
create_pwa_icon(512, "public/pwa-512.png")
