import '../domain/mesh_models.dart';

class MeshTransportEvent {
  const MeshTransportEvent({
    required this.messageId,
    required this.senderId,
    required this.destination,
    required this.body,
    required this.broadcastedAt,
    this.alertKind,
  });

  final String messageId;
  final String senderId;
  final String destination;
  final String body;
  final DateTime broadcastedAt;
  final AlertKind? alertKind;
}

class BluetoothUnavailableException implements Exception {
  const BluetoothUnavailableException(this.message);

  final String message;

  @override
  String toString() => message;
}

abstract interface class NodeTransport {
  Stream<List<MeshParticipant>> get participantUpdates;
  Stream<MeshTransportEvent> get events;
  Future<void> ensureReadyForScan();
  Future<List<MeshNode>> scan();
  Future<MeshNode> connect(MeshNode node);
  Future<void> setParticipantIdentity(MeshParticipant participant);
  Future<void> disconnect();
  Future<List<MeshParticipant>> connectedParticipants();
  Future<MeshMessage> send({
    required String destination,
    required String body,
    AlertKind? alertKind,
  });
}

class DemoNodeTransport implements NodeTransport {
  DemoNodeTransport({
    this.availableNodes = const [
      MeshNode(
        id: 'demo-esp32-01',
        name: 'Demo Node',
        signalStrength: -42,
        batteryPercent: 87,
      ),
    ],
  });

  final List<MeshNode> availableNodes;
  MeshNode? _connectedNode;
  int _messageNumber = 0;

  @override
  Stream<List<MeshParticipant>> get participantUpdates => const Stream.empty();
  @override
  Stream<MeshTransportEvent> get events => const Stream.empty();

  @override
  Future<void> ensureReadyForScan() async {}

  @override
  Future<List<MeshNode>> scan() async => availableNodes;

  @override
  Future<MeshNode> connect(MeshNode node) async {
    final match = availableNodes.where((candidate) => candidate.id == node.id);
    if (match.isEmpty) {
      throw StateError('The selected node is no longer available.');
    }
    _connectedNode = match.first;
    return _connectedNode!;
  }

  @override
  Future<void> disconnect() async {
    _connectedNode = null;
  }

  @override
  Future<void> setParticipantIdentity(MeshParticipant participant) async {}

  @override
  Future<List<MeshParticipant>> connectedParticipants() async {
    if (_connectedNode == null) return const [];
    return [
      MeshParticipant(
        id: 'demo-laptop',
        name: 'Demo laptop',
        lastHeard: DateTime.now(),
      ),
    ];
  }

  @override
  Future<MeshMessage> send({
    required String destination,
    required String body,
    AlertKind? alertKind,
  }) async {
    if (_connectedNode == null) {
      throw StateError('Connect a node before sending.');
    }
    if (body.trim().isEmpty || body.length > maxMessageLength) {
      throw ArgumentError('Message must be between 1 and $maxMessageLength characters.');
    }

    _messageNumber++;
    final id = 'demo-message-${_messageNumber.toString().padLeft(3, '0')}';
    return MeshMessage(
      id: id,
      destination: destination,
      body: body.trim(),
      state: DeliveryState.acknowledged,
      createdAt: DateTime.now(),
      alertKind: alertKind,
    );
  }
}
