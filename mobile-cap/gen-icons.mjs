import { Jimp } from 'jimp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RES = path.join(__dirname, 'android/app/src/main/res');
const SRC = path.join(__dirname, 'assets/icon.png');

const sizes = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const img = await Jimp.read(SRC);

for (const { dir, size } of sizes) {
  const out = path.join(RES, dir);
  const resized = img.clone().resize({ w: size, h: size });
  await resized.write(path.join(out, 'ic_launcher.png'));
  await resized.write(path.join(out, 'ic_launcher_round.png'));
  await resized.write(path.join(out, 'ic_launcher_foreground.png'));
  console.log(`✓ ${dir} (${size}x${size})`);
}

console.log('Icons generated.');
