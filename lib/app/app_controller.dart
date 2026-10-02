import 'package:flutter/foundation.dart';
import 'dart:async';

import '../data/node_transport.dart';
import '../data/local_store.dart';
import '../domain/mesh_models.dart';

class AppController extends ChangeNotifier {
  AppController({NodeTransport? transport, LocalStore? store})
      : _transport = transport ?? DemoNodeTransport(),
        _messageStore = MessageStore(store ?? MemoryStore()),
        _nodeStore = NodeStore(store ?? MemoryStore()),
        _identityStore = IdentityStore(store ?? MemoryStore());

  final NodeTransport _transport;
  final MessageStore _messageStore;
  final NodeStore _nodeStore;
  final IdentityStore _identityStore;
  NodeConnectionState connectionState = NodeConnectionState.disconnected;
  List<MeshNode> discoveredNodes = const [];
  MeshNode? connectedNode;
  MeshParticipant localParticipant = const MeshParticipant(
    id: 'this-device',
    name: 'This device',
  );
  List<MeshParticipant> participants = const [];
  String? errorMessage;
  bool bluetoothOff = false;
  final List<MeshMessage> messages = [];
  StreamSubscription<List<MeshParticipant>>? _participantSubscription;

  Future<void> restore() async {
    _participantSubscription ??= _transport.participantUpdates.listen((value) {
      participants = value;
      notifyListeners();
    });
    localParticipant = await _identityStore.readOrCreate();
    messages
      ..clear()
      ..addAll(await _messageStore.readMessages());
    final rememberedNode = await _nodeStore.readNode();
    if (rememberedNode != null) {
      try {
        await _transport.setParticipantIdentity(localParticipant);
        connectedNode = await _transport.connect(rememberedNode);
          participants = await _transport.connectedParticipants();
          connectionState = NodeConnectionState.connected;
      } catch (_) {
        connectedNode = null;
        connectionState = NodeConnectionState.disconnected;
      }
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _participantSubscription?.cancel();
    super.dispose();
  }

  Future<void> scan() async {
    connectionState = NodeConnectionState.scanning;
    errorMessage = null;
    bluetoothOff = false;
    notifyListeners();
    try {
      discoveredNodes = await _transport.scan();
      connectionState = NodeConnectionState.disconnected;
    } on BluetoothUnavailableException catch (error) {
      connectionState = NodeConnectionState.error;
      bluetoothOff = true;
      errorMessage = error.message;
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
      await _transport.setParticipantIdentity(localParticipant);
      connectedNode = await _transport.connect(node);
      participants = await _transport.connectedParticipants();
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
    participants = const [];
    connectionState = NodeConnectionState.disconnected;
    notifyListeners();
  }

  bool get communicationEnabled => connectedNode != null;

  List<MeshParticipant> get messageDestinations => [
        const MeshParticipant(id: 'community', name: 'Community'),
        ...participants.where((participant) => participant.id != localParticipant.id),
      ];

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
