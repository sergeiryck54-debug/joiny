import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

// Pick one image from the gallery (compressed) and return its base64, or null if cancelled.
export async function pickImageBase64(aspect: [number, number] = [1, 1]): Promise<string | null> {
  // Android 13+ photo picker needs no permission; launch it directly.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect,
    quality: 0.6,
    base64: true,
  });
  if (result.canceled || !result.assets?.length || !result.assets[0].base64) return null;
  return result.assets[0].base64;
}

// Pick several images at once (no crop in multi-select) — returns their base64 list.
export async function pickImagesBase64(max = 6): Promise<string[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: max,
    quality: 0.6,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map(a => a.base64).filter(Boolean) as string[];
}

// Upload a base64 JPEG to a bucket/path and return a cache-busted public URL.
export async function uploadJpeg(bucket: string, path: string, base64: string): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, decode(base64), {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// ---- Event gallery (event_photos table) ----

export async function getEventPhotos(eventId: string): Promise<any[]> {
  const { data } = await supabase.from('event_photos').select('*').eq('event_id', eventId).order('sort', { ascending: true });
  return data || [];
}

// Keep events.photo_url (the cover used by lists/map/feed) in sync with the first gallery photo.
export async function syncCover(eventId: string): Promise<void> {
  const { data } = await supabase.from('event_photos').select('url').eq('event_id', eventId).order('sort', { ascending: true }).limit(1);
  const cover = data && data.length ? data[0].url : null;
  await supabase.rpc('set_event_photo', { p_event_id: eventId, p_url: cover });
}

// Upload base64 images, append them as gallery rows, then refresh the cover.
export async function addEventPhotos(eventId: string, userId: string, base64list: string[]): Promise<void> {
  const { data: last } = await supabase.from('event_photos').select('sort').eq('event_id', eventId).order('sort', { ascending: false }).limit(1);
  let nextSort = last && last.length ? (last[0].sort + 1) : 0;
  for (const b64 of base64list) {
    const url = await uploadJpeg('event-photos', `${userId}/${eventId}_${nextSort}_${Date.now()}.jpg`, b64);
    await supabase.from('event_photos').insert({ event_id: eventId, url, sort: nextSort });
    nextSort++;
  }
  await syncCover(eventId);
}

export async function removeEventPhoto(eventId: string, photoId: string): Promise<void> {
  await supabase.from('event_photos').delete().eq('id', photoId);
  await syncCover(eventId);
}
