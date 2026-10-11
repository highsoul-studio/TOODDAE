import fs from 'node:fs/promises';
import path from 'node:path';

// 98% 品質の静止 WebP フレームを、色数制限のない30fpsループにまとめる。
const [directory, output] = process.argv.slice(2);
if (!directory || !output) throw new Error('Usage: node assemble-highsoul-webp.mjs <webp-frames> <output.webp>');
function chunk(type, data) {
  const head = Buffer.alloc(8); head.write(type, 0, 'ascii'); head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, ...(data.length & 1 ? [Buffer.from([0])] : [])]);
}
function readChunks(file) {
  if (file.toString('ascii', 0, 4) !== 'RIFF' || file.toString('ascii', 8, 12) !== 'WEBP') throw new Error('WebP signature');
  const chunks = [];
  for (let pos = 12; pos < file.length;) {
    const type = file.toString('ascii', pos, pos + 4), length = file.readUInt32LE(pos + 4);
    chunks.push({type, data: file.subarray(pos + 8, pos + 8 + length)}); pos += 8 + length + (length & 1);
  }
  return chunks;
}
const files = (await fs.readdir(directory)).filter(f => /^frame-\d{3}\.webp$/.test(f)).sort();
if (files.length !== 234) throw new Error('Expected 234 frames');
const width = 320, height = 280, extended = Buffer.alloc(10), animation = Buffer.alloc(6);
extended[0] = 0x12; // アルファ + アニメーション。
extended.writeUIntLE(width - 1, 4, 3); extended.writeUIntLE(height - 1, 7, 3);
const pieces = [Buffer.from('WEBP'), chunk('VP8X', extended), chunk('ANIM', animation)];
let milliseconds = 0;
for (let index = 0; index < files.length; index++) {
  const parts = readChunks(await fs.readFile(path.join(directory, files[index])));
  const payload = parts.filter(c => ['ALPH', 'VP8 ', 'VP8L'].includes(c.type));
  if (!payload.some(c => c.type === 'VP8 ' || c.type === 'VP8L')) throw new Error('Missing WebP frame');
  const head = Buffer.alloc(16), delay = Math.round((index + 1) * 1000 / 30) - Math.round(index * 1000 / 30);
  head.writeUIntLE(width - 1, 6, 3); head.writeUIntLE(height - 1, 9, 3); head.writeUIntLE(delay, 12, 3);
  head[15] = 2; // 完全フレーム置換。透過部を重ねず、残像を防ぐ。
  milliseconds += delay;
  pieces.push(chunk('ANMF', Buffer.concat([head, ...payload.map(c => chunk(c.type, c.data))])));
}
if (milliseconds !== 7800) throw new Error('Duration differs');
const data = Buffer.concat(pieces), header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(data.length, 4);
const webp = Buffer.concat([header, data]); await fs.writeFile(output, webp);
console.log({format: 'animated WebP', width, height, frames: files.length, fps: 30, milliseconds, loopCount: 0, bytes: webp.length});
