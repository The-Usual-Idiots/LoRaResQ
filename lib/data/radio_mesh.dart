import 'dart:convert';
import 'dart:typed_data';

enum RadioPacketType { text, alert, acknowledgement, status }

class RadioMeshPolicy {
  const RadioMeshPolicy({
    this.maxPacketBytes = 512,
    this.maxHopLimit = 4,
    this.recentMessageTtl = const Duration(minutes: 15),
  });

  final int maxPacketBytes;
  final int maxHopLimit;
  final Duration recentMessageTtl;
}

class RadioPacket {
  const RadioPacket({
    required this.networkId,
    required this.messageId,
    required this.sourceId,
    required this.destination,
    required this.type,
    required this.hopLimit,
    required this.createdAt,
    required this.expiresAt,
    required this.payload,
  });

  final String networkId;
  final String messageId;
  final String sourceId;
  final String destination;
  final RadioPacketType type;
  final int hopLimit;
  final DateTime createdAt;
  final DateTime expiresAt;
  final Map<String, Object?> payload;

  RadioPacket forward() {
    if (hopLimit == 0) {
      throw StateError('Cannot forward a packet with no hops remaining.');
    }
    return RadioPacket(
      networkId: networkId,
      messageId: messageId,
      sourceId: sourceId,
      destination: destination,
      type: type,
      hopLimit: hopLimit - 1,
      createdAt: createdAt,
      expiresAt: expiresAt,
      payload: payload,
    );
  }

  Map<String, Object?> toJson() => {
        'v': 1,
        'networkId': networkId,
        'messageId': messageId,
        'sourceId': sourceId,
        'destination': destination,
        'type': type.name,
        'hopLimit': hopLimit,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'expiresAt': expiresAt.toUtc().toIso8601String(),
        'payload': payload,
      };

  Uint8List encode({RadioMeshPolicy policy = const RadioMeshPolicy()}) {
    final bytes = Uint8List.fromList(utf8.encode(jsonEncode(toJson())));
    if (bytes.length > policy.maxPacketBytes) {
      throw ArgumentError('Radio packet exceeds ${policy.maxPacketBytes} bytes.');
    }
    return bytes;
  }

  static RadioPacket decode(
    Uint8List bytes, {
    RadioMeshPolicy policy = const RadioMeshPolicy(),
  }) {
    if (bytes.length > policy.maxPacketBytes) {
      throw const FormatException('Radio packet is too large.');
    }
    final decoded = jsonDecode(utf8.decode(bytes));
    if (decoded is! Map) {
      throw const FormatException('Radio packet must be an object.');
    }
    final json = decoded.cast<String, Object?>();
    final typeName = json['type'];
    final type = RadioPacketType.values
        .where((candidate) => candidate.name == typeName)
        .firstOrNull;
    final hopLimit = json['hopLimit'];
    if (json['v'] != 1 ||
        type == null ||
        json['payload'] is! Map ||
        hopLimit is! int ||
        hopLimit < 0 ||
        hopLimit > policy.maxHopLimit) {
      throw const FormatException('Radio packet fields are invalid.');
    }
    final networkId = _requiredString(json, 'networkId');
    final messageId = _requiredString(json, 'messageId');
    final sourceId = _requiredString(json, 'sourceId');
    final destination = _requiredString(json, 'destination');
    final createdAt = _requiredDate(json, 'createdAt');
    final expiresAt = _requiredDate(json, 'expiresAt');
    if (expiresAt.isBefore(createdAt)) {
      throw const FormatException('Radio packet expiry precedes creation.');
    }
    return RadioPacket(
      networkId: networkId,
      messageId: messageId,
      sourceId: sourceId,
      destination: destination,
      type: type,
      hopLimit: hopLimit,
      createdAt: createdAt,
      expiresAt: expiresAt,
      payload: (json['payload']! as Map).cast<String, Object?>(),
    );
  }

  static String _requiredString(Map<String, Object?> json, String key) {
    final value = json[key];
    if (value is! String || value.isEmpty || value.length > 64) {
      throw FormatException('Radio packet field "$key" is invalid.');
    }
    return value;
  }

  static DateTime _requiredDate(Map<String, Object?> json, String key) {
    final value = json[key];
    if (value is! String) {
      throw FormatException('Radio packet field "$key" is invalid.');
    }
    try {
      return DateTime.parse(value).toUtc();
    } on FormatException {
      throw FormatException('Radio packet field "$key" is invalid.');
    }
  }
}

class RadioReceiveResult {
  const RadioReceiveResult({
    required this.accepted,
    required this.delivered,
    required this.forwarded,
    required this.reason,
  });

  final bool accepted;
  final bool delivered;
  final RadioPacket? forwarded;
  final String reason;
}

class RadioMeshEngine {
  RadioMeshEngine({
    required this.nodeId,
    required this.networkId,
    this.policy = const RadioMeshPolicy(),
  });

  final String nodeId;
  final String networkId;
  final RadioMeshPolicy policy;
  final _recent = <String, DateTime>{};

  RadioReceiveResult receive(RadioPacket packet, {DateTime? now}) {
    final receivedAt = (now ?? DateTime.now()).toUtc();
    _prune(receivedAt);
    if (packet.networkId != networkId) {
      return const RadioReceiveResult(
        accepted: false,
        delivered: false,
        forwarded: null,
        reason: 'wrong-network',
      );
    }
    if (!packet.expiresAt.isAfter(receivedAt)) {
      return const RadioReceiveResult(
        accepted: false,
        delivered: false,
        forwarded: null,
        reason: 'expired',
      );
    }
    final cacheKey = '${packet.sourceId}:${packet.messageId}';
    if (_recent.containsKey(cacheKey)) {
      return const RadioReceiveResult(
        accepted: false,
        delivered: false,
        forwarded: null,
        reason: 'duplicate',
      );
    }
    _recent[cacheKey] = receivedAt.add(policy.recentMessageTtl);
    final addressedToThisNode =
        packet.destination == nodeId || packet.destination == 'community';
    final forwarded =
        !addressedToThisNode && packet.hopLimit > 0 ? packet.forward() : null;
    return RadioReceiveResult(
      accepted: true,
      delivered: addressedToThisNode,
      forwarded: forwarded,
      reason: addressedToThisNode ? 'delivered' : 'forwarded',
    );
  }

  void _prune(DateTime now) {
    _recent.removeWhere((_, expiresAt) => !expiresAt.isAfter(now));
  }
}
