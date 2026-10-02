enum NodeConnectionState { disconnected, scanning, connecting, connected, error }

enum DeliveryState {
  draft,
  acceptedByNode,
  queuedForRadio,
  sentToMesh,
  acknowledged,
  expired,
}

enum AlertKind { sos, medical, fire, flood, roadBlocked, allSafe, meeting }

class MeshNode {
  const MeshNode({
    required this.id,
    required this.name,
    required this.signalStrength,
    this.batteryPercent,
  });

  final String id;
  final String name;
  final int signalStrength;
  final int? batteryPercent;
}

class MeshMessage {
  const MeshMessage({
    required this.id,
    required this.destination,
    required this.body,
    required this.state,
    required this.createdAt,
    this.alertKind,
  });

  final String id;
  final String destination;
  final String body;
  final DeliveryState state;
  final DateTime createdAt;
  final AlertKind? alertKind;

  MeshMessage withState(DeliveryState nextState) => MeshMessage(
        id: id,
        destination: destination,
        body: body,
        state: nextState,
        createdAt: createdAt,
        alertKind: alertKind,
      );
}

const maxMessageLength = 120;

bool canAdvanceDelivery(DeliveryState current, DeliveryState next) {
  if (current == next) return true;
  return switch ((current, next)) {
    (DeliveryState.draft, DeliveryState.acceptedByNode) => true,
    (DeliveryState.acceptedByNode, DeliveryState.queuedForRadio) => true,
    (DeliveryState.queuedForRadio, DeliveryState.sentToMesh) => true,
    (DeliveryState.sentToMesh, DeliveryState.acknowledged) => true,
    (DeliveryState.sentToMesh, DeliveryState.expired) => true,
    _ => false,
  };
}

MeshMessage advanceDelivery(MeshMessage message, DeliveryState next) {
  if (!canAdvanceDelivery(message.state, next)) {
    throw StateError(
      'Cannot move ${message.state.name} to ${next.name}.',
    );
  }
  return message.withState(next);
}
