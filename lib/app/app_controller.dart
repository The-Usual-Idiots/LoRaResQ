import 'package:flutter/foundation.dart';

import 'dart:async';

import '../data/node_transport.dart';
import '../data/local_store.dart';
import '../data/notification_service.dart';
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
  bool refreshingParticipants = false;
  final List<MeshMessage> messages = [];
  final Map<String, MeshTransportEvent> _earlyEvents = {};
  StreamSubscription<List<MeshParticipant>>? _participantSubscription;
  StreamSubscription<MeshTransportEvent>? _eventSubscription;

  Future<void> restore() async {
    _participantSubscription ??= _transport.participantUpdates.listen((value) {
      participants = value;
      notifyListeners();
    });
    _eventSubscription ??= _transport.events.listen(_handleTransportEvent);
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
    _eventSubscription?.cancel();
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

  Future<void> refreshParticipants() async {
    if (connectedNode == null || refreshingParticipants) return;
    refreshingParticipants = true;
    errorMessage = null;
    notifyListeners();
    try {
      await _transport.refreshParticipants();
    } catch (error) {
      errorMessage = error.toString();
    } finally {
      refreshingParticipants = false;
      notifyListeners();
    }
  }

  Future<void> refreshMessages() async {
    if (connectedNode == null) return;
    try {
      final events = await _transport.refreshMessages();
      for (final event in events) {
        await _handleTransportEvent(event);
      }
      errorMessage = null;
      notifyListeners();
    } catch (error) {
      errorMessage = error.toString();
      notifyListeners();
    }
  }

  bool get communicationEnabled => connectedNode != null;

  List<MeshParticipant> get messageDestinations => [
    const MeshParticipant(id: 'community', name: 'Community'),
    ...participants.where(
      (participant) => participant.id != localParticipant.id,
    ),
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
      final event = _earlyEvents.remove(message.id);
      if (event != null) {
        messages[0] = MeshMessage(
          id: message.id,
          destination: message.destination,
          body: message.body,
          state: DeliveryState.broadcasted,
          createdAt: message.createdAt,
          senderId: message.senderId,
          senderName: message.senderName,
          alertKind: message.alertKind,
          broadcastedAt: event.broadcastedAt,
        );
      }
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

  Future<void> _handleTransportEvent(MeshTransportEvent event) async {
    if (event.destination != 'community' &&
        event.destination != 'direct' &&
        event.destination != localParticipant.id) {
      return;
    }
    // The firmware's Arduino BLE facade broadcasts notification packets to
    // subscribed clients. A direct message must still be visible only to its
    // recipient in the app, not echoed back into the sender's history.
    if (event.destination != 'community' &&
        event.senderId == localParticipant.id) {
      return;
    }
    final existingIndex = messages.indexWhere(
      (message) => message.id == event.messageId,
    );
    final timestamp = event.broadcastedAt;
    if (existingIndex >= 0) {
      final existing = messages[existingIndex];
      messages[existingIndex] = MeshMessage(
        id: existing.id,
        destination: existing.destination,
        body: existing.body,
        state: DeliveryState.broadcasted,
        createdAt: existing.createdAt,
        senderId: event.senderId,
        senderName: event.senderName,
        alertKind: existing.alertKind,
        broadcastedAt: timestamp,
      );
    } else if (event.senderId != localParticipant.id) {
      messages.insert(
        0,
        MeshMessage(
          id: event.messageId,
          destination: event.destination,
          body: event.body,
          state: DeliveryState.broadcasted,
          createdAt: timestamp,
          senderId: event.senderId,
          senderName: event.senderName,
          alertKind: event.alertKind,
          broadcastedAt: timestamp,
        ),
      );
      if (event.alertKind != null) {
        await NotificationService.instance.showAlert(
          title: 'Incoming ${event.alertKind!.name} alert',
          body: event.body,
        );
      }
    } else {
      _earlyEvents[event.messageId] = event;
      return;
    }
    await _messageStore.writeMessages(messages);
    notifyListeners();
  }

  void clearError() {
    errorMessage = null;
    notifyListeners();
  }
}
