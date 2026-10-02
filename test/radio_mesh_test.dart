import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:loraresq/data/radio_mesh.dart';

void main() {
  final created = DateTime.utc(2026, 1, 1, 12);
  final expires = created.add(const Duration(minutes: 5));

  RadioPacket packet({int hopLimit = 3}) => RadioPacket(
        networkId: 'community-a',
        messageId: 'message-1',
        sourceId: 'node-a',
        destination: 'node-c',
        type: RadioPacketType.text,
        hopLimit: hopLimit,
        createdAt: created,
        expiresAt: expires,
        payload: const {'body': 'Need help'},
      );

  test('encodes and decodes a bounded radio packet', () {
    final original = packet();
    final decoded = RadioPacket.decode(original.encode());

    expect(decoded.messageId, original.messageId);
    expect(decoded.payload['body'], 'Need help');
    expect(decoded.hopLimit, 3);
  });

  test('forwards once and delivers at the destination', () {
    final nodeB = RadioMeshEngine(nodeId: 'node-b', networkId: 'community-a');
    final nodeC = RadioMeshEngine(nodeId: 'node-c', networkId: 'community-a');

    final atB = nodeB.receive(packet(), now: created.add(const Duration(seconds: 1)));
    expect(atB.accepted, isTrue);
    expect(atB.delivered, isFalse);
    expect(atB.forwarded!.hopLimit, 2);

    final atC = nodeC.receive(
      atB.forwarded!,
      now: created.add(const Duration(seconds: 2)),
    );
    expect(atC.delivered, isTrue);
    expect(atC.forwarded, isNull);
  });

  test('suppresses duplicates by source and message ID', () {
    final node = RadioMeshEngine(nodeId: 'node-b', networkId: 'community-a');
    final first = node.receive(packet(), now: created);
    final duplicate = node.receive(packet(), now: created.add(const Duration(seconds: 1)));

    expect(first.accepted, isTrue);
    expect(duplicate.accepted, isFalse);
    expect(duplicate.reason, 'duplicate');
  });

  test('rejects wrong network, expired, and exhausted packets', () {
    final node = RadioMeshEngine(nodeId: 'node-b', networkId: 'community-a');
    final wrongNetwork = RadioPacket(
      networkId: 'community-b',
      messageId: 'message-2',
      sourceId: 'node-a',
      destination: 'node-c',
      type: RadioPacketType.text,
      hopLimit: 2,
      createdAt: created,
      expiresAt: expires,
      payload: const {},
    );

    expect(node.receive(wrongNetwork).reason, 'wrong-network');
    expect(
      node.receive(packet(), now: expires).reason,
      'expired',
    );
    final exhausted = node.receive(packet(hopLimit: 0), now: created);
    expect(exhausted.accepted, isTrue);
    expect(exhausted.forwarded, isNull);
  });

  test('rejects malformed or oversized packets', () {
    expect(
      () => RadioPacket.decode(Uint8List.fromList(<int>[1, 2, 3])),
      throwsA(isA<FormatException>()),
    );
    final oversizedPolicy = const RadioMeshPolicy(maxPacketBytes: 20);
    expect(
      () => packet().encode(policy: oversizedPolicy),
      throwsA(isA<ArgumentError>()),
    );
  });
}
