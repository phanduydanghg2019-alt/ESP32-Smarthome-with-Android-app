#!/usr/bin/env python3
"""
Generate iOS AppIcon and Android mipmap launcher icons from a single square source PNG.
Usage:
  python tools/generate_icons.py --source assets/icon.png

Installs: pip install Pillow

This script writes files into:
  - ios/SmartHomeApp/Images.xcassets/AppIcon.appiconset/
  - android/app/src/main/res/mipmap-*/

It will NOT overwrite existing files unless --force is specified.
"""
import os
import sys
import argparse
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IOS_APPICON_DIR = os.path.join(ROOT, 'ios', 'SmartHomeApp', 'Images.xcassets', 'AppIcon.appiconset')
ANDROID_RES_DIR = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

IOS_SIZES = [
    (20, 2, 'icon-20@2x.png'),
    (20, 3, 'icon-20@3x.png'),
    (29, 2, 'icon-29@2x.png'),
    (29, 3, 'icon-29@3x.png'),
    (40, 2, 'icon-40@2x.png'),
    (40, 3, 'icon-40@3x.png'),
    (60, 2, 'icon-60@2x.png'),
    (60, 3, 'icon-60@3x.png'),
    (1024, 1, 'icon-1024.png')
]

ANDROID_MIPMAPS = [
    ('mipmap-mdpi', 48),
    ('mipmap-hdpi', 72),
    ('mipmap-xhdpi', 96),
    ('mipmap-xxhdpi', 144),
    ('mipmap-xxxhdpi', 192),
]


def ensure_dir(path):
    if not os.path.isdir(path):
        os.makedirs(path, exist_ok=True)


def resize_and_save(img, size, out_path):
    # Preserve aspect ratio, fit into square and pad with transparency if needed
    src_w, src_h = img.size
    if src_w != src_h:
        # center-crop to square
        min_side = min(src_w, src_h)
        left = (src_w - min_side) // 2
        top = (src_h - min_side) // 2
        img = img.crop((left, top, left + min_side, top + min_side))
    out = img.resize((size, size), Image.LANCZOS)
    out.save(out_path, format='PNG')
    print('Wrote', out_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, help='Path to source PNG (preferably 1024x1024)')
    parser.add_argument('--force', action='store_true', help='Overwrite existing files')
    args = parser.parse_args()

    src = args.source
    if not os.path.isfile(src):
        print('Source image not found:', src)
        sys.exit(1)

    try:
        img = Image.open(src).convert('RGBA')
    except Exception as e:
        print('Failed to open source image:', e)
        sys.exit(1)

    # iOS
    ensure_dir(IOS_APPICON_DIR)
    for base_size, scale, filename in IOS_SIZES:
        size_px = base_size * scale
        out_path = os.path.join(IOS_APPICON_DIR, filename)
        if os.path.exists(out_path) and not args.force:
            print('Skip existing', out_path)
            continue
        resize_and_save(img, size_px, out_path)

    # Android
    for folder, size in ANDROID_MIPMAPS:
        dest_dir = os.path.join(ANDROID_RES_DIR, folder)
        ensure_dir(dest_dir)
        out_path = os.path.join(dest_dir, 'ic_launcher.png')
        if os.path.exists(out_path) and not args.force:
            print('Skip existing', out_path)
            continue
        resize_and_save(img, size, out_path)
        # also write round icon
        out_round = os.path.join(dest_dir, 'ic_launcher_round.png')
        if os.path.exists(out_round) and not args.force:
            print('Skip existing', out_round)
            continue
        resize_and_save(img, size, out_round)

    print('Done.')

if __name__ == '__main__':
    main()
