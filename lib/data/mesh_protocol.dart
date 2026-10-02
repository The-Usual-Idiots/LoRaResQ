import 'dart:convert';
import 'dart:typed_data';

import '../domain/mesh_models.dart';

const protocolServiceUuid = '7f6c0001-6b52-4f5d-9a5e-4f6c6f726151';
const protocolWriteUuid = '7f6c0002-6b52-4f5d-9a5e-4f6c6f726151';
const protocolNotifyUuid = '7f6c0003-6b52-4f5d-9a5e-4f6c6f726151';

enum ProtocolFrameType {
  hello,
  status,
  sendText,
  messageReceived,
  error,
  participantHello,
  participantRoster,
  participantRosterRequest,
  messageBroadcast,
  alertBroadcast,
}

class ProtocolFrame {
  const ProtocolFrame({
    required this.type,
    required this.sequence,
    required this.payload,
  });

  final ProtocolFrameType type;
  final int sequence;
  final Map<String, Object?> payload;
}

class MeshProtocolCodec {
  static const _magic0 = 0x4c;
  static const _magic1 = 0x51;
  static const version = 1;
  static const headerLength = 8;

  static Uint8List encode(ProtocolFrame frame) {
    final payload = Uint8List.fromList(utf8.encode(jsonEncode(frame.payload)));
    final bytes = Uint8List(headerLength + payload.length);
    final data = ByteData.sublistView(bytes);
    data.setUint8(0, _magic0);
    data.setUint8(1, _magic1);
    data.setUint8(2, version);
    data.setUint8(3, frame.type.index);
    data.setUint16(4, frame.sequence, Endian.little);
    data.setUint16(6, payload.length, Endian.little);
    bytes.setRange(headerLength, bytes.length, payload);
    return bytes;
  }

  static ProtocolFrame decode(Uint8List bytes) {
    if (bytes.length < headerLength ||
        bytes[0] != _magic0 ||
        bytes[1] != _magic1) {
      throw const FormatException('Invalid LoRaResQ frame header.');
    }
    final data = ByteData.sublistView(bytes);
    if (data.getUint8(2) != version) {
      throw const FormatException('Unsupported LoRaResQ protocol version.');
    }
    final payloadLength = data.getUint16(6, Endian.little);
    if (payloadLength != bytes.length - headerLength) {
      throw const FormatException('LoRaResQ payload length does not match frame.');
    }
    final payload = jsonDecode(utf8.decode(bytes.sublist(headerLength)));
    if (payload is! Map) {
      throw const FormatException('LoRaResQ payload must be an object.');
    }
    final typeIndex = data.getUint8(3);
    if (typeIndex >= ProtocolFrameType.values.length) {
      throw const FormatException('Unknown LoRaResQ frame type.');
    }
    return ProtocolFrame(
      type: ProtocolFrameType.values[typeIndex],
      sequence: data.getUint16(4, Endian.little),
      payload: payload.cast<String, Object?>(),
    );
  }
}

class ProtocolChunker {
  const ProtocolChunker({this.chunkSize = 20});

  final int chunkSize;

  Iterable<Uint8List> split(Uint8List frame) sync* {
    for (var offset = 0; offset < frame.length; offset += chunkSize) {
      final end = (offset + chunkSize).clamp(0, frame.length);
      yield Uint8List.fromList(frame.sublist(offset, end));
    }
  }
}

class ProtocolReassembler {
  final _bytes = <int>[];

  Uint8List? add(Uint8List chunk) {
    _bytes.addAll(chunk);
    if (_bytes.length < MeshProtocolCodec.headerLength) return null;
    final data = ByteData.sublistView(Uint8List.fromList(_bytes));
    final payloadLength = data.getUint16(6, Endian.little);
    final frameLength = MeshProtocolCodec.headerLength + payloadLength;
    if (_bytes.length < frameLength) return null;
    final frame = Uint8List.fromList(_bytes.take(frameLength).toList());
    _bytes.removeRange(0, frameLength);
    return frame;
  }
}

ProtocolFrame sendTextFrame({
  required int sequence,
  required String destination,
  required String body,
  required String senderId,
  required String messageId,
  required String broadcastedAt,
  AlertKind? alertKind,
}) {
  if (body.isEmpty || body.length > maxMessageLength) {
    throw ArgumentError('Message must be between 1 and $maxMessageLength characters.');
  }

  return ProtocolFrame(
    type: ProtocolFrameType.sendText,
    sequence: sequence,
    payload: {
      'destination': destination,
      'body': body,
      'senderId': senderId,
      'messageId': messageId,
      'broadcastedAt': broadcastedAt,
      if (alertKind != null) 'alertKind': alertKind.name,
    },
  );
}

ProtocolFrame participantHelloFrame({
  required int sequence,
  required String participantId,
  required String displayName,
}) {
  return ProtocolFrame(
    type: ProtocolFrameType.participantHello,
    sequence: sequence,
    payload: {
      'participantId': participantId,
      'displayName': displayName,
    },
  );
}

ProtocolFrame participantRosterRequestFrame({required int sequence}) {
  return ProtocolFrame(
    type: ProtocolFrameType.participantRosterRequest,
    sequence: sequence,
    payload: const {},
  );
}
