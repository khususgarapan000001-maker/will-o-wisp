/**
 * Base64 helpers for WebCrypto buffers.
 *
 * We use the standard Base64 alphabet (btoa/atob) for compatibility with what
 * we store in the DB. Both browser and Node 24 support btoa/atob via globalThis.
 *
 * All functions return/accept Uint8Array<ArrayBuffer> (not the broader
 * ArrayBufferLike) so they satisfy the WebCrypto SubtleCrypto API's
 * BufferSource parameter types under strict TypeScript.
 */

/** Encode an ArrayBuffer (or typed array) as a Base64 string. */
export function bufToBase64(buf: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode a Base64 string to a Uint8Array backed by a plain ArrayBuffer. */
export function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode a string as UTF-8 bytes backed by a plain ArrayBuffer. */
export function strToBytes(s: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(s);
  // TextEncoder.encode() returns Uint8Array<ArrayBuffer> on modern runtimes,
  // but we explicitly copy to guarantee the concrete type for TypeScript.
  const buf = new ArrayBuffer(encoded.byteLength);
  const out = new Uint8Array(buf);
  out.set(encoded);
  return out;
}

/** Decode UTF-8 bytes to a string. */
export function bytesToStr(bytes: Uint8Array<ArrayBuffer>): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Concatenate two Uint8Arrays into a single Uint8Array<ArrayBuffer>.
 * Used to build the AAD = owner_id_bytes || item_id_bytes.
 */
export function concatBytes(
  a: Uint8Array<ArrayBuffer>,
  b: Uint8Array<ArrayBuffer>
): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(a.byteLength + b.byteLength);
  const out = new Uint8Array(buf);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}
