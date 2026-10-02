import 'dart:async';
import 'dart:typed_data';

import 'package:universal_ble/universal_ble.dart';

import '../domain/mesh_models.dart';
import 'mesh_protocol.dart';
import 'node_transport.dart';

class UniversalBleNodeTransport implements NodeTransport {
  UniversalBleNodeTransport();

  BleDevice? _device;
  BleCharacteristic? _writeCharacteristic;
  BleCharacteristic? _notifyCharacteristic;
  StreamSubscription<Uint8List>? _notifications;
  final _reassembler = ProtocolReassembler();
  final _pending = <int, Completer<ProtocolFrame>>{};
  int _sequence = 0;
  final _participantUpdates = StreamController<List<MeshParticipant>>.broadcast();
  final _events = StreamController<MeshTransportEvent>.broadcast();
  List<MeshParticipant> _participants = const [];
  Timer? _participantHeartbeat;
  Timer? _rosterRequest;
  Future<void> _writeTail = Future<void>.value();
  MeshParticipant _participant = const MeshParticipant(
    id: 'this-device',
    name: 'This device',
  );

  @override
  Stream<List<MeshParticipant>> get participantUpdates =>
      _participantUpdates.stream;
  @override
  Stream<MeshTransportEvent> get events => _events.stream;

  @override
  Future<void> setParticipantIdentity(MeshParticipant participant) async {
    _participant = participant;
  }

  @override
  Future<void> ensureReadyForScan() async {
    var state = await UniversalBle.getBluetoothAvailabilityState();
    if (state == AvailabilityState.poweredOn) return;

    if (state == AvailabilityState.poweredOff &&
        BleCapabilities.supportsBluetoothEnableApi) {
      final enabled = await UniversalBle.enableBluetooth();
      if (enabled) {
        state = await UniversalBle.getBluetoothAvailabilityState();
      }
    }

    if (state != AvailabilityState.poweredOn) {
      throw BluetoothUnavailableException(
        state == AvailabilityState.unsupported
            ? 'Bluetooth is not available on this device.'
            : 'Bluetooth is off. Start Bluetooth in system settings, then try again.',
      );
    }
  }

  @override
  Future<List<MeshNode>> scan() async {
    await ensureReadyForScan();
    if (BleCapabilities.requiresRuntimePermission) {
      await UniversalBle.requestPermissions(withAndroidFineLocation: false);
    }
    final devices = <String, BleDevice>{};
    final subscription = UniversalBle.scanStream.listen((device) {
      if (device.name?.startsWith('LoRaResQ') ?? false) {
        devices[device.deviceId] = device;
      }
    });
    try {
      await UniversalBle.startScan(
        scanFilter: ScanFilter(withServices: [protocolServiceUuid]),
      );
      await Future<void>.delayed(const Duration(seconds: 4));
    } finally {
      await UniversalBle.stopScan();
      await subscription.cancel();
    }
    return devices.values
        .map(
          (device) => MeshNode(
            id: device.deviceId,
            name: device.name ?? 'LoRaResQ node',
            signalStrength: device.rssi ?? 0,
          ),
        )
        .toList();
  }

  @override
  Future<MeshNode> connect(MeshNode node) async {
    final device = BleDevice(deviceId: node.id, name: node.name);
    await device.connect();
    final writeCharacteristic = await device.getCharacteristic(
      protocolWriteUuid,
      service: protocolServiceUuid,
    );
    final notifyCharacteristic = await device.getCharacteristic(
      protocolNotifyUuid,
      service: protocolServiceUuid,
    );
    await notifyCharacteristic.notifications.subscribe();
    _device = device;
    _writeCharacteristic = writeCharacteristic;
    _notifyCharacteristic = notifyCharacteristic;
    _notifications = notifyCharacteristic.onValueReceived.listen(_handleChunk);
    final hello = participantHelloFrame(
      sequence: ++_sequence,
      participantId: _participant.id,
      displayName: _participant.name,
    );
    await _writeFrame(
      MeshProtocolCodec.encode(hello),
      writeCharacteristic,
      withResponse: false,
    );
    // The node sends the initial roster to every subscribed client while
    // handling HELLO. Give the ESP32 notification queue time to drain before
    // submitting the next acknowledged ATT write, especially for client two.
    await Future<void>.delayed(const Duration(milliseconds: 500));
    _rosterRequest = Timer(const Duration(seconds: 2), () {
      final characteristic = _writeCharacteristic;
      if (characteristic == null) return;
      final frame = participantRosterRequestFrame(sequence: ++_sequence);
      unawaited(
        _writeFrame(
          MeshProtocolCodec.encode(frame),
          characteristic,
          withResponse: false,
        ),
      );
    });
    _participantHeartbeat = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _sendParticipantHello(),
    );
    return node;
  }

  @override
  Future<void> disconnect() async {
    await _notifications?.cancel();
    _participantHeartbeat?.cancel();
    _participantHeartbeat = null;
    _rosterRequest?.cancel();
    _rosterRequest = null;
    await _notifyCharacteristic?.unsubscribe();
    await _device?.disconnect();
    _device = null;
    _writeCharacteristic = null;
    _notifyCharacteristic = null;
    for (final completer in _pending.values) {
      if (!completer.isCompleted) {
        completer.completeError(StateError('BLE node disconnected.'));
      }
    }
    _pending.clear();
    _participants = const [];
    _participantUpdates.add(_participants);
  }

  Future<void> _sendParticipantHello() async {
    final characteristic = _writeCharacteristic;
    if (characteristic == null) return;
    final frame = participantHelloFrame(
      sequence: ++_sequence,
      participantId: _participant.id,
      displayName: _participant.name,
    );
    await _writeFrame(
      MeshProtocolCodec.encode(frame),
      characteristic,
      withResponse: false,
    );
  }

  Future<void> _writeFrame(
    Uint8List frame,
    BleCharacteristic characteristic,
    {bool withResponse = true}
  ) {
    final previous = _writeTail;
    final gate = Completer<void>();
    _writeTail = gate.future;
    return () async {
      await previous;
      try {
        for (final chunk in const ProtocolChunker().split(frame)) {
          await _writeChunk(
            characteristic,
            chunk,
            withResponse: withResponse,
          );
          // Android may report WRITE_REQUEST_BUSY if the next ATT write is
          // submitted before the previous request has cleared.
          await Future<void>.delayed(const Duration(milliseconds: 25));
        }
      } finally {
        gate.complete();
      }
    }();
  }

  Future<void> _writeChunk(
    BleCharacteristic characteristic,
    Uint8List chunk,
    {required bool withResponse}
  ) async {
    const maxAttempts = 4;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await characteristic.write(chunk, withResponse: withResponse);
        return;
      } catch (error) {
        final text = error.toString().toUpperCase();
        final busy = text.contains('WRITE_REQUEST_BUSY') ||
            text.contains('REQUEST_BUSY');
        if (!busy || attempt == maxAttempts) rethrow;
        await Future<void>.delayed(Duration(milliseconds: 50 * attempt));
      }
    }
  }

  @override
  Future<List<MeshParticipant>> connectedParticipants() async => _participants;

  @override
  Future<MeshMessage> send({
    required String destination,
    required String body,
    AlertKind? alertKind,
  }) async {
    if (_writeCharacteristic == null) {
      throw StateError('Connect a BLE node before sending.');
    }
    final sequence = ++_sequence;
    final messageId = '${_participant.id}-$sequence-${DateTime.now().microsecondsSinceEpoch}';
    final frame = sendTextFrame(
      sequence: sequence,
      destination: destination,
      body: body,
      senderId: _participant.id,
      messageId: messageId,
      broadcastedAt: DateTime.now().toUtc().toIso8601String(),
      alertKind: alertKind,
    );
    final response = Completer<ProtocolFrame>();
    _pending[sequence] = response;
    try {
      await _writeFrame(MeshProtocolCodec.encode(frame), _writeCharacteristic!);
      final received = await response.future.timeout(const Duration(seconds: 10));
      if (received.type == ProtocolFrameType.error) {
        throw StateError(
          received.payload['message'] as String? ?? 'Node rejected message.',
        );
      }
      return MeshMessage(
        id: received.payload['id'] as String? ?? messageId,
        destination: destination,
        body: body,
        state: DeliveryState.acceptedByNode,
        createdAt: DateTime.now(),
        alertKind: alertKind,
      );
    } finally {
      _pending.remove(sequence);
    }
  }

  void _handleChunk(Uint8List chunk) {
    final bytes = _reassembler.add(chunk);
    if (bytes == null) return;
    final frame = MeshProtocolCodec.decode(bytes);
    if (frame.type == ProtocolFrameType.participantRoster) {
      _participants = _decodeParticipants(frame.payload);
      _participantUpdates.add(_participants);
    }
    if (frame.type == ProtocolFrameType.messageBroadcast ||
        frame.type == ProtocolFrameType.alertBroadcast) {
      final event = _decodeEvent(frame.payload);
      if (event != null) _events.add(event);
    }
    final completer = _pending[frame.sequence];
    if (completer != null && !completer.isCompleted) {
      completer.complete(frame);
    }
  }

  MeshTransportEvent? _decodeEvent(Map<String, Object?> payload) {
    final messageId = payload['messageId'];
      final senderId = payload['senderId'];
      final destination = payload['destination'];
      final body = payload['body'];
      final timestamp = payload['broadcastedAt'];
      if (messageId is! String ||
          senderId is! String ||
          destination is! String ||
          body is! String ||
          timestamp is! String) {
      return null;
    }
    final broadcastedAt = DateTime.tryParse(timestamp);
    if (broadcastedAt == null) return null;
    final kind = payload['alertKind'];
    return MeshTransportEvent(
        messageId: messageId,
        senderId: senderId,
        destination: destination,
        body: body,
        broadcastedAt: broadcastedAt,
        alertKind: kind is String
            ? AlertKind.values.where((value) => value.name == kind).firstOrNull
            : null,
    );
  }

  List<MeshParticipant> _decodeParticipants(Map<String, Object?> payload) {
    final value = payload['participants'];
    if (value is! List) return const [];
    return value.whereType<Map>().map((entry) {
      final id = entry['id'];
      final name = entry['name'];
      final lastHeard = entry['lastHeard'];
      return MeshParticipant(
        id: id is String ? id : 'unknown',
        name: name is String ? name : 'Unknown participant',
        connected: entry['connected'] != false,
        lastHeard: lastHeard is String ? DateTime.tryParse(lastHeard) : null,
      );
    }).where((participant) => participant.id != 'unknown').toList();
  }
}
