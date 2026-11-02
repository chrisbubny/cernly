import sharp from 'sharp';

export const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_OUTPUT_BYTES = 3 * 1024 * 1024;
export const MAX_VISION_EDGE = 1536;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_VISION_PIXELS = 1_150_000;

export function decodeScreenshotBase64(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_IMAGE_INPUT_BYTES / 3) * 4 ||
      value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('Invalid or oversized screenshot encoding');
  }
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_INPUT_BYTES) throw new Error('Screenshot exceeds input limit');
  return bytes;
}

export async function readScreenshotResponse(response) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_IMAGE_INPUT_BYTES) {
    await response.body?.cancel();
    throw new Error('Screenshot exceeds input limit');
  }
  if (!response.body) throw new Error('Screenshot body is empty');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_INPUT_BYTES) {
        await reader.cancel();
        throw new Error('Screenshot exceeds input limit');
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

export async function normalizeVisionImage(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_IMAGE_INPUT_BYTES) {
    throw new Error('Invalid screenshot size');
  }
  // Reject non-raster inputs before handing them to an image decoder. Declared
  // content-type is not evidence that downloaded bytes are a valid image.
  const supported = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) ||
    ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')) ||
    (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!supported) throw new Error('Unsupported screenshot format');
  const options = { limitInputPixels: MAX_INPUT_PIXELS, animated: false };
  const metadata = await sharp(bytes, options).metadata();
  const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
  const originalWidth = rotated ? metadata.height : metadata.width;
  const originalHeight = rotated ? metadata.width : metadata.height;
  if (!originalWidth || !originalHeight) throw new Error('Screenshot dimensions are unavailable');

  // Very tall full-page images become unreadable if scaled as a whole. Review a
  // disclosed top-of-page region instead, and display exactly that same image.
  const regionHeight = Math.min(originalHeight, originalWidth * 4);
  const scale = Math.min(1, MAX_VISION_EDGE / Math.max(originalWidth, regionHeight),
    Math.sqrt(MAX_VISION_PIXELS / (originalWidth * regionHeight)));
  const width = Math.max(1, Math.floor(originalWidth * scale));
  const height = Math.max(1, Math.floor(regionHeight * scale));
  const { data, info } = await sharp(bytes, options).rotate()
    .extract({ left: 0, top: 0, width: originalWidth, height: regionHeight })
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer({ resolveWithObject: true });
  if (data.length > MAX_IMAGE_OUTPUT_BYTES) throw new Error('Normalized screenshot exceeds output limit');
  return { data, mediaType: 'image/jpeg', image: {
    originalWidth, originalHeight, width: info.width, height: info.height,
    coverage: regionHeight < originalHeight ? 'top-of-page' : 'full-image',
  } };
}
