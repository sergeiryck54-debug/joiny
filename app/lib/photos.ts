import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { supabase } from './supabase';

export type MediaKind = 'image' | 'video';

export type PickedMedia = {
  uri: string;
  // For images: the image itself. For videos: a thumbnail frame (used for the
  // preview, the moderation check, and the gallery poster).
  base64: string;
  type: MediaKind;
  width?: number;
  height?: number;
};

// A public URL points to a video if its path carries a video extension.
export function isVideoUrl(url: string | null | undefined): boolean {
  return !!url && /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url);
}

// Read a local file (file:// uri) as a base64 string.
async function fileToBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

// Normalise a picker asset into PickedMedia, grabbing a frame for videos.
async function toPickedMedia(asset: ImagePicker.ImagePickerAsset): Promise<PickedMedia> {
  if (asset.type === 'video') {
    let frame = '';
    try {
      const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000, quality: 0.6 });
      frame = await fileToBase64(thumbUri);
    } catch {}
    return { uri: asset.uri, base64: frame, type: 'video', width: asset.width, height: asset.height };
  }
  const b64 = asset.base64 || (await fileToBase64(asset.uri));
  return { uri: asset.uri, base64: b64, type: 'image', width: asset.width, height: asset.height };
}

// ---- Capture / pick ----

// Open the camera to take a photo or record a video.
export async function captureMedia(kind: MediaKind): Promise<PickedMedia | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: kind === 'video' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    base64: kind === 'image',
    videoMaxDuration: 60,
  });
  if (result.canceled || !result.assets?.length) return null;
  return toPickedMedia(result.assets[0]);
}

// Pick several photos and/or videos from the gallery.
export async function pickMedia(max = 6, allowVideo = true): Promise<PickedMedia[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: allowVideo ? ImagePicker.MediaTypeOptions.All : ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: max,
    quality: 0.6,
    base64: true,
    videoMaxDuration: 60,
  });
  if (result.canceled || !result.assets?.length) return [];
  return Promise.all(result.assets.map(toPickedMedia));
}

// Pick a single image (used for avatars — no video, with cropping).
export async function pickAvatarImage(): Promise<PickedMedia | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  return toPickedMedia(result.assets[0]);
}

export async function captureAvatarImage(): Promise<PickedMedia | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  return toPickedMedia(result.assets[0]);
}

// ---- Moderation ----

export type ModerationResult = { approved: boolean; reason?: string };

// Ask the moderate-media Edge Function to vet an image (or a video's frame).
// Fail-open: if the function is unreachable / not deployed yet, allow the upload
// so the app keeps working — but a definite "unsafe" verdict blocks publishing.
export async function moderateImageBase64(base64: string): Promise<ModerationResult> {
  if (!base64) return { approved: true };
  try {
    const { data, error } = await supabase.functions.invoke('moderate-media', { body: { image_base64: base64 } });
    if (error) { console.warn('moderation unavailable:', error.message); return { approved: true }; }
    return { approved: data?.approved !== false, reason: data?.reason };
  } catch (e: any) {
    console.warn('moderation error:', e?.message);
    return { approved: true };
  }
}

// ---- Upload ----

// Upload one media item and return a cache-busted public URL.
export async function uploadMedia(bucket: string, pathNoExt: string, m: PickedMedia): Promise<string> {
  const ext = m.type === 'video' ? 'mp4' : 'jpg';
  const contentType = m.type === 'video' ? 'video/mp4' : 'image/jpeg';
  const bytesB64 = m.type === 'video' ? await fileToBase64(m.uri) : (m.base64 || (await fileToBase64(m.uri)));
  const path = `${pathNoExt}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, decode(bytesB64), { contentType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// Upload a base64 JPEG (avatars). Kept for the simple image-only path.
export async function uploadJpeg(bucket: string, path: string, base64: string): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// ---- Event gallery (event_photos table) ----

export async function getEventPhotos(eventId: string): Promise<any[]> {
  const { data } = await supabase.from('event_photos').select('*').eq('event_id', eventId).order('sort', { ascending: true });
  return data || [];
}

// Keep events.photo_url (the cover used by lists/map/feed) in sync with the first
// *image* in the gallery — videos can't be shown as a static cover.
export async function syncCover(eventId: string): Promise<void> {
  const { data } = await supabase.from('event_photos').select('url').eq('event_id', eventId).order('sort', { ascending: true });
  const cover = (data || []).map((d: any) => d.url).find((u: string) => !isVideoUrl(u)) || null;
  await supabase.rpc('set_event_photo', { p_event_id: eventId, p_url: cover });
}

// Moderate, then upload each media item; append gallery rows and refresh the cover.
// Returns how many were added vs. rejected by moderation.
export async function addEventMedia(eventId: string, userId: string, items: PickedMedia[]): Promise<{ added: number; rejected: number }> {
  const { data: last } = await supabase.from('event_photos').select('sort').eq('event_id', eventId).order('sort', { ascending: false }).limit(1);
  let nextSort = last && last.length ? (last[0].sort + 1) : 0;
  let added = 0, rejected = 0;
  for (const m of items) {
    const mod = await moderateImageBase64(m.base64);
    if (!mod.approved) { rejected++; continue; }
    const url = await uploadMedia('event-photos', `${userId}/${eventId}_${nextSort}_${Date.now()}`, m);
    await supabase.from('event_photos').insert({ event_id: eventId, url, sort: nextSort });
    nextSort++; added++;
  }
  await syncCover(eventId);
  return { added, rejected };
}

export async function removeEventPhoto(eventId: string, photoId: string): Promise<void> {
  await supabase.from('event_photos').delete().eq('id', photoId);
  await syncCover(eventId);
}
