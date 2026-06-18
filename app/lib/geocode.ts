import * as Location from 'expo-location';

// We use OpenStreetMap's Nominatim so geocoding matches the OSM map we render,
// and works without Google Play Services (the device geocoder is a fallback).
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const HEADERS = { 'User-Agent': 'JoinyApp/1.0 (in-app event geocoding)', Accept: 'application/json' };

export type Coords = { lat: number; lng: number };

// Address text -> coordinates
export async function geocodeAddress(query: string): Promise<Coords | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const res = await fetch(`${NOMINATIM}/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: HEADERS });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {}
  // Fallback: device geocoder
  try {
    const r = await Location.geocodeAsync(q);
    if (r && r.length > 0) return { lat: r[0].latitude, lng: r[0].longitude };
  } catch (e) {}
  return null;
}

// Coordinates -> short readable address
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: HEADERS });
    const data = await res.json();
    if (data && typeof data.display_name === 'string') {
      return data.display_name.split(',').slice(0, 3).map((s: string) => s.trim()).join(', ');
    }
  } catch (e) {}
  // Fallback: device reverse geocoder
  try {
    const r = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (r && r.length > 0) {
      const a = r[0];
      return [a.name, a.street, a.city].filter(Boolean).join(', ') || null;
    }
  } catch (e) {}
  return null;
}
