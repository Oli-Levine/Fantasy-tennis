/**
 * Square crop of a w×h image. Portrait photos are cropped nearer the top so
 * faces stay in frame.
 */
export function squareCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  const sx = Math.round((width - side) / 2);
  const sy = Math.round((height - side) * 0.2);
  return { sx, sy, side };
}

/** Browser only: crop a photo to a square and compress it to a small JPEG. */
export async function squarePhoto(file: File, size = 512, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
    const out = Math.min(size, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't compress photo"))), "image/jpeg", quality),
    );
  } finally {
    bitmap.close();
  }
}
