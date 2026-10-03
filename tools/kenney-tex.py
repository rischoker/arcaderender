# Ajusta las texturas de los packs Kenney para que combinen con KayKit:
# un poco menos saturadas y más oscuras; y una variante "enemiga" (azul -> rojo oscuro).
from PIL import Image
import colorsys
K = '/home/claude/assets/kenney'
def grade(im, sat=0.78, val=0.9, enemy=False):
    im = im.convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if enemy and 0.52 < h < 0.8 and s > 0.25:   # azules y morados -> rojo sangre
                h = 0.995; s = min(1, s * 1.15); v *= 0.72
            if 0.025 <= h < 0.11 and s > 0.2 and not (enemy and h > 0.98):  # maderas naranjas/rosadas -> café
                h = 0.065; s = s * 0.85; v *= 0.8
            s *= sat; v *= val
            r, g, b = colorsys.hsv_to_rgb(h, s, v)
            px[x, y] = (round(r * 255), round(g * 255), round(b * 255), a)
    return im
for d in ['siege', 'struct', 'forest']:
    src = Image.open(f'{K}/{d}/Textures/colormap.png')
    grade(src).save(f'{K}/{d}/Textures/toned.png')
    if d in ('siege', 'forest'): grade(src, enemy=True).save(f'{K}/{d}/Textures/enemy.png')
print('ok')
