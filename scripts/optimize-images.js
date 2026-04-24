#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RESIMLER = path.join(ROOT, 'resimler');
const QUALITY = '78';
const MAX_WIDTH = 1600;

function hasCmd(cmd) {
  const r = spawnSync('bash', ['-lc', `command -v ${cmd}`], { encoding: 'utf8' });
  return r.status === 0;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function toWebp(src, dst, tool) {
  if (tool === 'cwebp') {
    return spawnSync('cwebp', ['-q', QUALITY, '-resize', String(MAX_WIDTH), '0', src, '-o', dst], { stdio: 'inherit' });
  }
  const magickCmd = hasCmd('magick') ? ['magick', src, '-resize', `${MAX_WIDTH}x>`, '-quality', QUALITY, dst] : ['convert', src, '-resize', `${MAX_WIDTH}x>`, '-quality', QUALITY, dst];
  return spawnSync(magickCmd[0], magickCmd.slice(1), { stdio: 'inherit' });
}

if (!fs.existsSync(RESIMLER)) {
  console.log('skip: resimler klasörü bulunamadı');
  process.exit(0);
}

const canCwebp = hasCmd('cwebp');
const canMagick = hasCmd('magick') || hasCmd('convert');
if (!canCwebp && !canMagick) {
  console.log('skip: cwebp/magick/convert yok');
  process.exit(0);
}

const files = walk(RESIMLER).filter((f) => /\.(jpe?g|png)$/i.test(f));
for (const file of files) {
  const target = file.replace(/\.(jpe?g|png)$/i, '.webp');
  if (fs.existsSync(target)) {
    console.log(`skip: ${path.relative(ROOT, target)} mevcut`);
    continue;
  }
  const tool = canCwebp ? 'cwebp' : 'magick';
  console.log(`build: ${path.relative(ROOT, target)} (${tool})`);
  const result = toWebp(file, target, tool);
  if (result.status !== 0) {
    console.log(`skip: ${path.relative(ROOT, file)} dönüştürülemedi`);
  }
}
