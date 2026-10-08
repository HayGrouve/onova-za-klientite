/**
 * A link that opens an address in the maps app. Google's search URL is
 * handled by the Maps app on Android and iOS, and by the web map elsewhere.
 */
export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`
}
