import 'package:flutter_test/flutter_test.dart';

import 'package:loraresq/domain/mesh_models.dart';

void main() {
  final createdAt = DateTime.utc(2026, 10, 2);

  MeshMessage message(DeliveryState state) => MeshMessage(
        id: 'message-001',
        destination: 'community',
        body: 'Meet at the school',
        state: state,
        createdAt: createdAt,
      );

  test('allows only evidence-based delivery transitions', () {
    expect(
      advanceDelivery(message(DeliveryState.draft), DeliveryState.acceptedByNode)
          .state,
      DeliveryState.acceptedByNode,
    );
    expect(
      advanceDelivery(
        message(DeliveryState.sentToMesh),
        DeliveryState.acknowledged,
      ).state,
      DeliveryState.acknowledged,
    );
    expect(
      () => advanceDelivery(
        message(DeliveryState.draft),
        DeliveryState.acknowledged,
      ),
      throwsStateError,
    );
  });

  test('enforces the bounded message payload', () {
    expect(maxMessageLength, 120);
    expect('a' * maxMessageLength, hasLength(maxMessageLength));
    expect('a' * (maxMessageLength + 1), hasLength(greaterThan(maxMessageLength)));
  });
}
