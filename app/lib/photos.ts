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
