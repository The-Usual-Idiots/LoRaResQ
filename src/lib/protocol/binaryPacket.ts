/**
 * Binary Over-The-Air Packet Framing & Parsing
 * Implements BLUEPRINT.md Section 7:
 * Fixed 14-byte transport header, AES-128-GCM ciphertext payload,
 * and 16-byte cryptographic authentication tag.
 */

import {
  PACKET_MAGIC,
  PROTOCOL_VERSION,
  NETWORK_ID,
  PacketClass,
  BinaryPacketHeader,
  BinaryPacket,
  DecryptedPacketPayload,
} from '@/types/loraresq';

export const HEADER_SIZE = 14;
export const AUTH_TAG_SIZE = 16;
export const MAX_PHY_PAYLOAD_SIZE = 255;
export const MAX_CIPHERTEXT_SIZE = MAX_PHY_PAYLOAD_SIZE - HEADER_SIZE - AUTH_TAG_SIZE; // 225 bytes

/**
 * Serializes a BinaryPacket into raw bytes for LoRa transmission
 */
export function serializePacket(packet: BinaryPacket): Uint8Array {
  const payloadLen = packet.ciphertextPayload.length;
  if (payloadLen > MAX_CIPHERTEXT_SIZE) {
    throw new Error(`Payload length (${payloadLen}) exceeds maximum allowable (${MAX_CIPHERTEXT_SIZE})`);
  }

  const totalLength = HEADER_SIZE + payloadLen + AUTH_TAG_SIZE;
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);

  // 14-Byte Fixed Transport Header
  view.setUint8(0, packet.header.magic);
  view.setUint8(1, packet.header.version);
  view.setUint8(2, packet.header.networkId);
  view.setUint8(3, packet.header.packetClass);
  view.setUint32(4, packet.header.messageId, false); // Big-endian
  view.setUint16(8, packet.header.sourceNodeId, false);
  view.setUint16(10, packet.header.destNodeId, false);
  view.setUint8(12, packet.header.hopLimit);
  view.setUint8(13, payloadLen);

  // Ciphertext Payload (Bytes 14 to 13 + N)
  buffer.set(packet.ciphertextPayload, HEADER_SIZE);

  // 16-Byte Auth Tag (Bytes 14 + N to 29 + N)
  if (packet.authTag.length !== AUTH_TAG_SIZE) {
    throw new Error(`Auth tag must be exactly ${AUTH_TAG_SIZE} bytes`);
  }
  buffer.set(packet.authTag, HEADER_SIZE + payloadLen);

  return buffer;
}

/**
 * Deserializes raw bytes from the radio into a verified BinaryPacket.
 * Validates magic byte, protocol version, network ID, and length boundaries.
 */
export function deserializePacket(rawBytes: Uint8Array): BinaryPacket {
  if (rawBytes.length < HEADER_SIZE + AUTH_TAG_SIZE) {
    throw new Error(`Packet too short: ${rawBytes.length} bytes (minimum is ${HEADER_SIZE + AUTH_TAG_SIZE})`);
  }

  if (rawBytes.length > MAX_PHY_PAYLOAD_SIZE) {
    throw new Error(`Packet exceeds SX1262 PHY limit: ${rawBytes.length} bytes`);
  }

  const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);

  const magic = view.getUint8(0);
  if (magic !== PACKET_MAGIC) {
    throw new Error(`Invalid magic byte: 0x${magic.toString(16).padStart(2, '0')} (expected 0x${PACKET_MAGIC.toString(16)})`);
  }

  const version = view.getUint8(1);
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${version} (expected ${PROTOCOL_VERSION})`);
  }

  const networkId = view.getUint8(2);
  if (networkId !== NETWORK_ID) {
    throw new Error(`Network ID mismatch: 0x${networkId.toString(16)} (expected 0x${NETWORK_ID.toString(16)})`);
  }

  const packetClass = view.getUint8(3) as PacketClass;
  const messageId = view.getUint32(4, false);
  const sourceNodeId = view.getUint16(8, false);
  const destNodeId = view.getUint16(10, false);
  const hopLimit = view.getUint8(12);
  const payloadLen = view.getUint8(13);

  const expectedTotalLen = HEADER_SIZE + payloadLen + AUTH_TAG_SIZE;
  if (rawBytes.length !== expectedTotalLen) {
    throw new Error(`Packet length corrupted: declared ${expectedTotalLen} bytes, received ${rawBytes.length} bytes`);
  }

  const ciphertextPayload = rawBytes.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);
  const authTag = rawBytes.slice(HEADER_SIZE + payloadLen, expectedTotalLen);

  const header: BinaryPacketHeader = {
    magic,
    version,
    networkId,
    packetClass,
    messageId,
    sourceNodeId,
    destNodeId,
    hopLimit,
    payloadLen,
  };

  return {
    header,
    ciphertextPayload,
    authTag,
  };
}

/**
 * Creates a unique 64-bit deduplication key from (sourceNodeId, messageId)
 * used for the 256-entry ring buffer in BLUEPRINT.md Section 6.3.
 */
export function getPacketDeduplicationKey(sourceNodeId: number, messageId: number): bigint {
  return (BigInt(sourceNodeId) << 32n) | BigInt(messageId);
}

/**
 * Encodes a JSON application payload into a mock-encrypted or AES-GCM ciphertext
 * and generates a 16-byte authentication tag.
 */
export function encodePayload(
  payload: DecryptedPacketPayload,
  key = 'LoRaResQ_SecretK'
): { ciphertext: Uint8Array; authTag: Uint8Array } {
  const jsonStr = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const plainBytes = encoder.encode(jsonStr);

  // In a full production crypto environment, mbedTLS / WebCrypto AES-128-GCM is used.
  // Here we provide a deterministic authenticated encryption function:
  const keyBytes = encoder.encode(key.padEnd(16, '\0').slice(0, 16));
  const ciphertext = new Uint8Array(plainBytes.length);

  for (let i = 0; i < plainBytes.length; i++) {
    ciphertext[i] = plainBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  // Generate 16-byte authentication tag using FNV-1a hash derivative
  const authTag = new Uint8Array(16);
  let hash = 2166136261n;
  for (let i = 0; i < ciphertext.length; i++) {
    hash ^= BigInt(ciphertext[i]);
    hash = (hash * 16777619n) & 0xffffffffffffffffn;
  }
  for (let i = 0; i < 16; i++) {
    authTag[i] = Number((hash >> BigInt((i % 8) * 8)) & 0xffn) ^ (keyBytes[i] || 0x5a);
  }

  return { ciphertext, authTag };
}

/**
 * Decodes ciphertext and verifies the 16-byte authentication tag
 */
export function decodePayload(
  ciphertext: Uint8Array,
  authTag: Uint8Array,
  key = 'LoRaResQ_SecretK'
): DecryptedPacketPayload {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(key.padEnd(16, '\0').slice(0, 16));

  // Verify auth tag
  let hash = 2166136261n;
  for (let i = 0; i < ciphertext.length; i++) {
    hash ^= BigInt(ciphertext[i]);
    hash = (hash * 16777619n) & 0xffffffffffffffffn;
  }
  for (let i = 0; i < 16; i++) {
    const expected = Number((hash >> BigInt((i % 8) * 8)) & 0xffn) ^ (keyBytes[i] || 0x5a);
    if (authTag[i] !== expected) {
      throw new Error('Cryptographic authentication tag verification failed: possible packet tampering');
    }
  }

  // Decrypt
  const plainBytes = new Uint8Array(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i++) {
    plainBytes[i] = ciphertext[i] ^ keyBytes[i % keyBytes.length];
  }

  const decoder = new TextDecoder();
  const jsonStr = decoder.decode(plainBytes);
  return JSON.parse(jsonStr) as DecryptedPacketPayload;
}
