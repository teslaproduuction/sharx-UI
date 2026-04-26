/**
 * Client WireGuard keypair (X25519) for inbound peers — public goes to Xray, private to user.
 */
import { x25519 } from "@noble/curves/ed25519";

function clampScalar(bytes: Uint8Array): Uint8Array {
  const b = new Uint8Array(bytes);
  b[0] &= 248;
  b[31] &= 127;
  b[31] |= 64;
  return b;
}

function uint8ToBase64(b: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < b.length; i += 1) bin += String.fromCharCode(b[i]!);
  return btoa(bin);
}

/**
 * New random keypair. Private key is clamped (WireGuard / RFC 7748); both are standard base64, 32-byte payload.
 */
export function newWireGuardPeerKeypairBase64(): {
  publicKeyB64: string;
  privateKeyB64: string;
} {
  const raw = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(raw);
  } else {
    for (let i = 0; i < 32; i += 1) raw[i] = Math.floor(Math.random() * 256);
  }
  const priv = clampScalar(raw);
  const pub = x25519.getPublicKey(priv);
  return {
    publicKeyB64: uint8ToBase64(pub),
    privateKeyB64: uint8ToBase64(priv),
  };
}
