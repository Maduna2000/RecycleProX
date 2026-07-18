import { Jimp } from 'jimp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RES = path.join(__dirname, 'android/app/src/main/res');
const ICON_SRC = path.join(__dirname, 'assets/icon.png');
const SPLASH_SRC = path.join(__dirname, 'assets/splash.png');
const PUBLIC_ICONS = path.join(__dirname, '..', 'public', 'icons');

// The source icon has an opaque black background outside the rounded white
// card (not real transparency) — flood-fill it away from each corner so the
// exported PNG has a transparent background instead of showing black
// corners on top of a home-screen wallpaper. Bounded to near-black pixels
// only, so it never touches the white card or the navy shield/text inside it.
function floodFillTransparent(image, startX, startY, threshold = 30) {
  const { width, height, data } = image.bitmap;
  const idx = (x, y) => (y * width + x) * 4;
  const start = idx(startX, startY);
  if (data[start] > threshold || data[start + 1] > threshold || data[start + 2] > threshold) return;

  const visited = new Uint8Array(width * height);
  const stack = [[startX, startY]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const v = y * width + x;
    if (visited[v]) continue;
    visited[v] = 1;
    const i = idx(x, y);
    if (data[i + 3] === 0) continue;
    if (data[i] <= threshold && data[i + 1] <= threshold && data[i + 2] <= threshold) {
      data[i + 3] = 0;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
}

const mipmapSizes = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const icon = await Jimp.read(ICON_SRC);
const iw = icon.bitmap.width, ih = icon.bitmap.height;
for (const [x, y] of [[0, 0], [iw - 1, 0], [0, ih - 1], [iw - 1, ih - 1]]) {
  floodFillTransparent(icon, x, y);
}
console.log('✓ background transparency fixed');

for (const { dir, size } of mipmapSizes) {
  const out = path.join(RES, dir);
  const resized = icon.clone().resize({ w: size, h: size });
  await resized.write(path.join(out, 'ic_launcher.png'));
  await resized.write(path.join(out, 'ic_launcher_round.png'));
  await resized.write(path.join(out, 'ic_launcher_foreground.png'));
  console.log(`✓ ${dir} (${size}x${size})`);
}

// PWA icons — same source, used by public/manifest-gate.json
for (const size of [192, 512]) {
  const resized = icon.clone().resize({ w: size, h: size });
  await resized.write(path.join(PUBLIC_ICONS, `gate-icon-${size}.png`));
  console.log(`✓ public/icons/gate-icon-${size}.png`);
}

// Splash drawable — preserves the source's 3:2 ratio (matches the 300x200dp
// centered layer-list slot in drawable/splash_screen.xml), exported at 3x
// baseline for crispness on high-density screens without needing separate
// density-qualified copies. No transparency fix needed — the banner's navy
// background is intentional and matches splashBackground in colors.xml.
const splash = await Jimp.read(SPLASH_SRC);
const splashResized = splash.clone().resize({ w: 900, h: 600 });
await splashResized.write(path.join(RES, 'drawable', 'splash_logo.png'));
console.log('✓ drawable/splash_logo.png (900x600)');

console.log('Icons generated.');
