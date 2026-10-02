import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:loraresq/data/mesh_protocol.dart';

void main() {
  test('encodes and decodes a framed text command', () {
    final frame = sendTextFrame(
      sequence: 7,
      destination: 'community',
      body: 'Meet at the school',
      senderId: 'device-a',
      messageId: 'message-a',
      broadcastedAt: '2026-01-01T00:00:00Z',
    );

    final decoded = MeshProtocolCodec.decode(MeshProtocolCodec.encode(frame));

    expect(decoded.type, ProtocolFrameType.sendText);
    expect(decoded.sequence, 7);
    expect(decoded.payload['destination'], 'community');
    expect(decoded.payload['body'], 'Meet at the school');
  });

  test('reassembles frames split into BLE-sized chunks', () {
    final encoded = MeshProtocolCodec.encode(
      sendTextFrame(
        sequence: 1,
        destination: 'community',
        body: 'A message that needs more than one BLE packet.',
        senderId: 'device-a',
        messageId: 'message-a',
        broadcastedAt: '2026-01-01T00:00:00Z',
      ),
    );
    final reassembler = ProtocolReassembler();

    Uint8List? result;
    for (final chunk in const ProtocolChunker(chunkSize: 20).split(encoded)) {
      result = reassembler.add(chunk);
    }

    expect(result, isNotNull);
    expect(MeshProtocolCodec.decode(result!).payload['body'],
        'A message that needs more than one BLE packet.');
  });

  test('rejects a malformed frame', () {
    expect(
      () => MeshProtocolCodec.decode(Uint8List.fromList([0, 1, 2])),
      throwsFormatException,
    );
  });

  test('encodes a participant presence acknowledgement', () {
    final frame = participantPresenceAckFrame(
      sequence: 12,
      participantId: 'device-a',
    );

    final decoded = MeshProtocolCodec.decode(MeshProtocolCodec.encode(frame));

    expect(decoded.type, ProtocolFrameType.status);
    expect(decoded.sequence, 12);
    expect(decoded.payload['state'], 'participantPresenceAck');
    expect(decoded.payload['participantId'], 'device-a');
  });
}
