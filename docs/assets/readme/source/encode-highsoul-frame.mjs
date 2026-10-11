// ブラウザーの標準APIだけで、生成済みPNGを高品質WebPにする。DOMやネットワークは変更しない。
export async function encodeHighsoulFrame(pngBase64) {
  const bytes = Uint8Array.from(atob(pngBase64), character => character.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/png'}));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({type: 'image/webp', quality: 0.98});
  bitmap.close();
  if (blob.type !== 'image/webp') throw new Error('WebP encoding unavailable');
  return new Uint8Array(await blob.arrayBuffer());
}
