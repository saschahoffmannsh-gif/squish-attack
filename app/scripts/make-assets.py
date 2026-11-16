#!/usr/bin/env python3
"""App-Icon und Startbild aus der vorhandenen Spiel-Grafik erzeugen (braucht Pillow).
- Icon: game/icons/squishy-v1-1024.png → 1024×1024 ohne Transparenz (Xcode erzeugt daraus alle Größen)
- Startbild: Logo game/assets/squish-attack-logo-v1.png mittig auf #08080a, 2732×2732 (1x/2x/3x),
  so klein, dass es auch im schmalen iPhone-Hochformat (Seiten werden abgeschnitten) ganz zu sehen ist.
Aufruf: python3 scripts/make-assets.py"""
from pathlib import Path
from PIL import Image

APP = Path(__file__).resolve().parent.parent
GAME = APP.parent / 'game'
XC = APP / 'ios/App/App/Assets.xcassets'
BG = (8, 8, 10)

icon = Image.open(GAME / 'icons/squishy-v1-1024.png').convert('RGBA')
if icon.size != (1024, 1024):
    icon = icon.resize((1024, 1024), Image.LANCZOS)
flat = Image.new('RGB', icon.size, BG)
flat.paste(icon, (0, 0), icon)
flat.save(XC / 'AppIcon.appiconset/AppIcon-512@2x.png', optimize=True)

logo = Image.open(GAME / 'assets/squish-attack-logo-v1.png').convert('RGBA')
W = 2732
target_w = 1000  # sichtbare Breite im iPhone-Hochformat ≈ 2732·390/844 ≈ 1260 px
logo = logo.resize((target_w, round(logo.height * target_w / logo.width)), Image.LANCZOS)
splash = Image.new('RGB', (W, W), BG)
splash.paste(logo, ((W - logo.width) // 2, (W - logo.height) // 2 - 60), logo)
for name in ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']:
    splash.save(XC / 'Splash.imageset' / name, optimize=True)
print('Icon und Startbild geschrieben')
