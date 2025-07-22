// Helper utilities reused across Edge Functions
// NOTE: These run in the Deno runtime shipped with Supabase Edge Functions
// Do not import Node-only APIs.

/**
 * Strips local dev server host:port from a URL so that the path becomes
 * bucket-relative. Example:
 *   http://192.168.1.10:54321/files/image.png → files/image.png
 * Production public URLs are returned unchanged.
 */
export function normalizeImagePath(imagePath: string): string {
  if (!imagePath) return imagePath;

  // Matches http(s)://<ip>:<port>/…
  const localDevPattern = /^https?:\/\/\d{1,3}(?:\.\d{1,3}){3}:\d+/;
  if (localDevPattern.test(imagePath)) {
    const url = new URL(imagePath);
    return url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
  }
  return imagePath;
}

/**
 * Recursively normalises image-path strings within an arbitrary object/array.
 * Useful when worker JSON embeds absolute URLs that shouldn’t leak local IPs.
 */
export function normalizeImagePathsInObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(obj) || obj.includes("/files/")) {
      return normalizeImagePath(obj);
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(normalizeImagePathsInObject);
  }
  if (obj && typeof obj === "object") {
    const clone: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) clone[k] = normalizeImagePathsInObject(v);
    return clone;
  }
  return obj;
} 