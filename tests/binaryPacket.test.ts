import { describe, it, expect } from 'vitest';
import {
  serializePacket,
  deserializePacket,
  encodePayload,
  decodePayload,
  getPacketDeduplicationKey,
  HEADER_SIZE,
  AUTH_TAG_SIZE,
  MAX_PHY_PAYLOAD_SIZE,
  MAX_CIPHERTEXT_SIZE,
} from '../src/lib/protocol/binaryPacket';
import {
  PACKET_MAGIC,
  PROTOCOL_VERSION,
  NETWORK_ID,
  PacketClass,
  BinaryPacket,
} from '../src/types/loraresq';

describe('LoRaResQ Binary Packet Framing (BLUEPRINT.md Section 7)', () => {
  it('correctly serializes and deserializes a 14-byte transport header', () => {
    const payloadText = 'Emergency medical kit needed at Sector 4';
    const { ciphertext, authTag } = encodePayload({
      senderUuid: '3f81e4b2-c011-4b1f-90e8-08d4b3123891',
      recipientUuid: 'a89c4501-12ef-46c9-b702-613d9a5b3012',
      timestamp: 1729350000,
      text: payloadText,
    });

    const packet: BinaryPacket = {
      header: {
        magic: PACKET_MAGIC,
        version: PROTOCOL_VERSION,
        networkId: NETWORK_ID,
        packetClass: PacketClass.DIRECT_TEXT,
        messageId: 0x00004a12,
        sourceNodeId: 0x0001,
        destNodeId: 0x0002,
        hopLimit: 3,
        payloadLen: ciphertext.length,
      },
      ciphertextPayload: ciphertext,
      authTag,
    };

    const rawBytes = serializePacket(packet);

    expect(rawBytes.length).toBe(HEADER_SIZE + ciphertext.length + AUTH_TAG_SIZE);
    expect(rawBytes[0]).toBe(0x52); // Magic 'R'
    expect(rawBytes[1]).toBe(0x02); // Version 2
    expect(rawBytes[2]).toBe(0x26); // Network ID 0x26
    expect(rawBytes[3]).toBe(PacketClass.DIRECT_TEXT);

    // Deserialize and verify fields
    const parsed = deserializePacket(rawBytes);
    expect(parsed.header.magic).toBe(PACKET_MAGIC);
    expect(parsed.header.version).toBe(PROTOCOL_VERSION);
    expect(parsed.header.networkId).toBe(NETWORK_ID);
    expect(parsed.header.packetClass).toBe(PacketClass.DIRECT_TEXT);
    expect(parsed.header.messageId).toBe(0x00004a12);
    expect(parsed.header.sourceNodeId).toBe(0x0001);
    expect(parsed.header.destNodeId).toBe(0x0002);
    expect(parsed.header.hopLimit).toBe(3);
    expect(parsed.header.payloadLen).toBe(ciphertext.length);

    // Verify decryption
    const decrypted = decodePayload(parsed.ciphertextPayload, parsed.authTag);
    expect(decrypted.text).toBe(payloadText);
    expect(decrypted.senderUuid).toBe('3f81e4b2-c011-4b1f-90e8-08d4b3123891');
  });

  it('rejects foreign network packets with wrong Network ID or magic byte', () => {
    const rawBytes = new Uint8Array(HEADER_SIZE + AUTH_TAG_SIZE);
    rawBytes[0] = 0x41; // Invalid magic ('A')
    rawBytes[1] = 0x02;
    rawBytes[2] = 0x26;

    expect(() => deserializePacket(rawBytes)).toThrow(/Invalid magic byte/);

    rawBytes[0] = 0x52; // Valid magic
    rawBytes[2] = 0x99; // Foreign network ID
    expect(() => deserializePacket(rawBytes)).toThrow(/Network ID mismatch/);
  });

  it('rejects tampered ciphertext payloads when auth tag check fails', () => {
    const { ciphertext, authTag } = encodePayload({
      senderUuid: 'test-sender',
      timestamp: 1000,
      text: 'Original unaltered message',
    });

    // Tamper with one byte of ciphertext
    ciphertext[0] ^= 0xff;

    expect(() => decodePayload(ciphertext, authTag)).toThrow(
      /Cryptographic authentication tag verification failed/
    );
  });

  it('generates consistent 64-bit deduplication keys', () => {
    const key1 = getPacketDeduplicationKey(0x0001, 0x00004a12);
    const key2 = getPacketDeduplicationKey(0x0001, 0x00004a12);
    const key3 = getPacketDeduplicationKey(0x0002, 0x00004a12);

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it('enforces Semtech SX1262 255-byte PHY payload boundary', () => {
    const oversized = new Uint8Array(MAX_CIPHERTEXT_SIZE + 10);
    const authTag = new Uint8Array(16);

    const packet: BinaryPacket = {
      header: {
        magic: PACKET_MAGIC,
        version: PROTOCOL_VERSION,
        networkId: NETWORK_ID,
        packetClass: PacketClass.GLOBAL_CHAT,
        messageId: 1,
        sourceNodeId: 1,
        destNodeId: 0xffff,
        hopLimit: 3,
        payloadLen: oversized.length,
      },
      ciphertextPayload: oversized,
      authTag,
    };

    expect(() => serializePacket(packet)).toThrow(/exceeds maximum allowable/);
  });
});
