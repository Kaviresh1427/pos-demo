// One place that shrinks every picture before it is uploaded,
// so photos load fast and use very little of the free storage.
//   kind 'photo' : food photos      -> JPEG, up to 700 px, aims for under ~120 KB
//   kind 'logo'  : company logo     -> PNG (keeps see-through background), up to 400 px
//   kind 'qr'    : payment QR code  -> PNG (stays sharp), up to 600 px

const KINDS = {
  photo: { max: 700, type: 'image/jpeg', quality: 0.82, target: 120 * 1024 },
  logo: { max: 400, type: 'image/png', quality: 0.9, target: 150 * 1024 },
  qr: { max: 600, type: 'image/png', quality: 0.92, target: 200 * 1024 },
};

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file is not a picture'));
    };
    img.src = url;
  });
}

function draw(img, max, solidWhite) {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (solidWhite) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas, type, q) =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not shrink the picture'))), type, q));

// returns { blob, type, ext }
export async function compressImage(file, kind) {
  const k = KINDS[kind] || KINDS.photo;
  const img = await loadImage(file);

  // PNG kinds (logo, QR): keep PNG; if it is still large, use JPEG on a white background
  if (k.type === 'image/png') {
    let blob = await toBlob(draw(img, k.max, false), 'image/png');
    if (blob.size <= k.target) return { blob, type: 'image/png', ext: 'png' };
    let max = k.max;
    while (blob.size > k.target && max > 200) {
      max = Math.round(max * 0.8);
      blob = await toBlob(draw(img, max, false), 'image/png');
    }
    if (blob.size <= k.target * 1.5) return { blob, type: 'image/png', ext: 'png' };
    const jpg = await toBlob(draw(img, k.max, true), 'image/jpeg', 0.88);
    return jpg.size < blob.size ? { blob: jpg, type: 'image/jpeg', ext: 'jpg' } : { blob, type: 'image/png', ext: 'png' };
  }

  // photos: lower the quality, then the size, until it is small enough
  let max = k.max;
  let q = k.quality;
  let blob = await toBlob(draw(img, max, true), 'image/jpeg', q);
  while (blob.size > k.target && (q > 0.5 || max > 400)) {
    if (q > 0.5) q = Math.round((q - 0.08) * 100) / 100;
    else max = Math.round(max * 0.85);
    blob = await toBlob(draw(img, max, true), 'image/jpeg', q);
  }
  return { blob, type: 'image/jpeg', ext: 'jpg' };
}

// the file name part of a public storage URL (to delete the old picture)
export function storagePath(url, bucket) {
  if (!url) return null;
  const marker = '/' + bucket + '/';
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}
