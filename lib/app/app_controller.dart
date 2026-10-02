import 'package:flutter/foundation.dart';

import '../data/node_transport.dart';
import '../data/local_store.dart';
import '../domain/mesh_models.dart';

class AppController extends ChangeNotifier {
  AppController({NodeTransport? transport, LocalStore? store})
      : _transport = transport ?? DemoNodeTransport(),
        _messageStore = MessageStore(store ?? MemoryStore()),
        _nodeStore = NodeStore(store ?? MemoryStore());

  final NodeTransport _transport;
  final MessageStore _messageStore;
  final NodeStore _nodeStore;
  NodeConnectionState connectionState = NodeConnectionState.disconnected;
  List<MeshNode> discoveredNodes = const [];
  MeshNode? connectedNode;
  String? errorMessage;
  final List<MeshMessage> messages = [];

  Future<void> restore() async {
    messages
      ..clear()
      ..addAll(await _messageStore.readMessages());
    final rememberedNode = await _nodeStore.readNode();
    if (rememberedNode != null) {
      try {
        connectedNode = await _transport.connect(rememberedNode);
        connectionState = NodeConnectionState.connected;
      } catch (_) {
        connectedNode = null;
        connectionState = NodeConnectionState.disconnected;
      }
    }
    notifyListeners();
  }

  Future<void> scan() async {
    connectionState = NodeConnectionState.scanning;
    errorMessage = null;
    notifyListeners();
    try {
      discoveredNodes = await _transport.scan();
      connectionState = NodeConnectionState.disconnected;
    } catch (error) {
      connectionState = NodeConnectionState.error;
      errorMessage = error.toString();
    }
    notifyListeners();
  }

  Future<void> connect(MeshNode node) async {
    connectionState = NodeConnectionState.connecting;
    errorMessage = null;
    notifyListeners();
    try {
      connectedNode = await _transport.connect(node);
      connectionState = NodeConnectionState.connected;
      await _nodeStore.writeNode(connectedNode!);
    } catch (error) {
      connectionState = NodeConnectionState.error;
      errorMessage = error.toString();
    }
    if (connectedNode != null) {
      await _messageStore.writeMessages(messages);
    }
    notifyListeners();
  }

  Future<void> disconnect() async {
    await _transport.disconnect();
    await _nodeStore.clear();
    connectedNode = null;
    connectionState = NodeConnectionState.disconnected;
    notifyListeners();
  }

  Future<MeshMessage?> send({
    required String destination,
    required String body,
    AlertKind? alertKind,
  }) async {
    try {
      final message = await _transport.send(
        destination: destination,
        body: body,
        alertKind: alertKind,
      );
      messages.insert(0, message);
      await _messageStore.writeMessages(messages);
      errorMessage = null;
      notifyListeners();
      return message;
    } catch (error) {
      errorMessage = error.toString();
      notifyListeners();
      return null;
    }
  }

  void clearError() {
    errorMessage = null;
    notifyListeners();
  }
}
