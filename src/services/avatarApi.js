// Profile pictures.
//
// Deliberately small in scope: one square image per user, overwritten in place,
// resized on the device before it is ever uploaded. There is no crop editor, no
// gallery, no variants and no image CDN pipeline — a 512px square is enough for
// every place Kun shows a face, and the largest of those is 56 CSS pixels.
import { getSupabase, isOnline, friendlyError } from './supabase.js';
import { updateProfile } from './profileApi.js';

const BUCKET = 'avatars';

// 512 is comfortably above the largest render (56px at 3x = 168px) with room
// for a future larger profile header, and lands well under the bucket's 2MB
// limit at this quality.
const MAX_EDGE = 512;
const QUALITY = 0.82;

// Guard before decoding. A phone camera JPEG is routinely 8MB, which is fine —
// it gets resized — but a 200MB file would be decoded into memory first and
// take the tab with it.
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export class AvatarError extends Error {}

// Downscale to a centre-cropped square and re-encode as JPEG.
//
// The crop is centred rather than offered as a UI: for a picture that will be
// displayed as a 32px circle, a crop editor is more friction than the result
// can possibly justify.
export async function compressAvatar(file) {
  if (!file) throw new AvatarError('No image selected.');
  if (!/^image\//.test(file.type)) throw new AvatarError('That file is not an image.');
  if (file.size > MAX_INPUT_BYTES) throw new AvatarError('That image is too large. Try one under 25MB.');

  const bitmap = await loadBitmap(file);
  try {
    const edge = Math.min(bitmap.width, bitmap.height);
    if (!edge) throw new AvatarError('That image could not be read.');
    const size = Math.min(MAX_EDGE, edge);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap,
      (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge,
      0, 0, size, size
    );

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new AvatarError('That image could not be processed on this device.');
    return blob;
  } finally {
    // createImageBitmap allocates outside the JS heap; releasing it explicitly
    // matters on a phone uploading several pictures in a row.
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Older Safari cannot decode some formats this way; fall through.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new AvatarError('That image could not be read.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Compress, upload, then point the profile at it.
//
// The path is fixed per user (`<uid>/avatar.jpg`) and upserted, so replacing a
// picture cannot leave the old file orphaned in the bucket. Because the URL
// never changes, a cache-busting query is appended to avatar_url — without it
// every device that already loaded the old picture would keep showing it.
export async function uploadAvatar(userId, file) {
  if (!userId) throw new AvatarError('Sign in first.');
  if (!isOnline()) throw new AvatarError('You need a connection to change your picture.');

  const sb = await getSupabase();
  if (!sb) throw new AvatarError('Cloud features are not configured.');

  const blob = await compressAvatar(file);
  const path = `${userId}/avatar.jpg`;

  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: true
  });
  if (error) throw new AvatarError(friendlyError(error));

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  // The profile row is the source of truth for the UI, so if this fails the
  // upload is rolled back rather than leaving a file nothing points at.
  try {
    return await updateProfile(userId, { avatar_url: url });
  } catch (err) {
    await sb.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new AvatarError(err.message);
  }
}

// Clear the profile reference FIRST, then delete the file.
//
// This order matters: if the delete fails, the user still sees their picture
// removed everywhere, and the orphan is one small file. The reverse order could
// leave every friend's screen pointing at a URL that 404s.
export async function removeAvatar(userId) {
  if (!userId) throw new AvatarError('Sign in first.');
  if (!isOnline()) throw new AvatarError('You need a connection to change your picture.');

  const sb = await getSupabase();
  if (!sb) throw new AvatarError('Cloud features are not configured.');

  const updated = await updateProfile(userId, { avatar_url: null });
  await sb.storage.from(BUCKET).remove([`${userId}/avatar.jpg`]).catch(() => {});
  return updated;
}
