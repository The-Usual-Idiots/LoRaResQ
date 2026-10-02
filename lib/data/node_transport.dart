import '../domain/mesh_models.dart';

class BluetoothUnavailableException implements Exception {
  const BluetoothUnavailableException(this.message);

  final String message;

  @override
  String toString() => message;
}

abstract interface class NodeTransport {
  Future<void> ensureReadyForScan();
  Future<List<MeshNode>> scan();
  Future<MeshNode> connect(MeshNode node);
  Future<void> disconnect();
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
