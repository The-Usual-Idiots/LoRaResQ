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
    return node;
  }

  @override
  Future<void> disconnect() async {
    await _notifications?.cancel();
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
  }

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
    final frame = sendTextFrame(
      sequence: sequence,
      destination: destination,
      body: body,
    );
    final response = Completer<ProtocolFrame>();
    _pending[sequence] = response;
    for (final chunk in const ProtocolChunker().split(MeshProtocolCodec.encode(frame))) {
      await _writeCharacteristic!.write(chunk, withResponse: true);
    }
    final received = await response.future.timeout(const Duration(seconds: 10));
    _pending.remove(sequence);
    if (received.type == ProtocolFrameType.error) {
      throw StateError(received.payload['message'] as String? ?? 'Node rejected message.');
    }
    return MeshMessage(
      id: received.payload['id'] as String? ?? 'ble-$sequence',
      destination: destination,
      body: body,
      state: DeliveryState.acceptedByNode,
      createdAt: DateTime.now(),
      alertKind: alertKind,
    );
  }

  void _handleChunk(Uint8List chunk) {
    final bytes = _reassembler.add(chunk);
    if (bytes == null) return;
    final frame = MeshProtocolCodec.decode(bytes);
    final completer = _pending[frame.sequence];
    if (completer != null && !completer.isCompleted) {
      completer.complete(frame);
    }
  }
}
