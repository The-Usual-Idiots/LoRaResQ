import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/mesh_models.dart';

abstract interface class LocalStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> remove(String key);
}

class SharedPreferencesStore implements LocalStore {
  SharedPreferencesStore(this._preferences);

  final SharedPreferences _preferences;

  static Future<SharedPreferencesStore> create() async {
    return SharedPreferencesStore(await SharedPreferences.getInstance());
  }

  @override
  Future<String?> read(String key) async => _preferences.getString(key);

  @override
  Future<void> write(String key, String value) async {
    await _preferences.setString(key, value);
  }

  @override
  Future<void> remove(String key) async {
    await _preferences.remove(key);
  }
}

class MemoryStore implements LocalStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    values.remove(key);
  }
}

class MessageStore {
  MessageStore(this._store);

  static const _messagesKey = 'messages.v1';
  static const maxStoredMessages = 100;
  final LocalStore _store;

  Future<List<MeshMessage>> readMessages() async {
    final raw = await _store.read(_messagesKey);
    if (raw == null) return [];
    try {
      final values = jsonDecode(raw);
      if (values is! List) return [];
      return values.whereType<Map>().map(_decode).toList();
    } on FormatException {
      return [];
    }

  }

  Future<void> writeMessages(Iterable<MeshMessage> messages) async {
    final bounded = messages.take(maxStoredMessages).map(_encode).toList();
    await _store.write(_messagesKey, jsonEncode(bounded));
  }

  MeshMessage _decode(Map value) {
    return MeshMessage(
      id: value['id'] as String,
      destination: value['destination'] as String,
      body: value['body'] as String,
      state: DeliveryState.values.byName(value['state'] as String),
      createdAt: DateTime.parse(value['createdAt'] as String),
      alertKind: value['alertKind'] == null
          ? null
          : AlertKind.values.byName(value['alertKind'] as String),
      broadcastedAt: value['broadcastedAt'] == null
        ? null
        : DateTime.tryParse(value['broadcastedAt'] as String),
    );
  }

  Map<String, Object?> _encode(MeshMessage message) => {
        'id': message.id,
        'destination': message.destination,
        'body': message.body,
        'state': message.state.name,
        'createdAt': message.createdAt.toIso8601String(),
        'alertKind': message.alertKind?.name,
        'broadcastedAt': message.broadcastedAt?.toIso8601String(),
      };
}

class NodeStore {
  NodeStore(this._store);

  static const _nodeKey = 'connected-node.v1';
  final LocalStore _store;

  Future<MeshNode?> readNode() async {
    final raw = await _store.read(_nodeKey);
    if (raw == null) return null;
    try {
      final value = jsonDecode(raw);
      if (value is! Map) return null;
      return MeshNode(
        id: value['id'] as String,
        name: value['name'] as String,
        signalStrength: value['signalStrength'] as int,
        batteryPercent: value['batteryPercent'] as int?,
      );
    } on FormatException {
      return null;
    } on TypeError {
      return null;
    }

  }

  Future<void> writeNode(MeshNode node) async {
    await _store.write(
      _nodeKey,
      jsonEncode({
        'id': node.id,
        'name': node.name,
        'signalStrength': node.signalStrength,
        'batteryPercent': node.batteryPercent,
      }),
    );
  }

  Future<void> clear() => _store.remove(_nodeKey);
}

class IdentityStore {
  IdentityStore(this._store);

  static const _identityKey = 'participant-identity.v1';
  static const _identityChannel = MethodChannel('loraresq/device_identity');
  final LocalStore _store;

  Future<MeshParticipant> readOrCreate() async {
    final existing = await _store.read(_identityKey);
    if (existing != null && existing.isNotEmpty) {
      return MeshParticipant(id: existing, name: 'This device');
    }
    final platformId = await _readPlatformIdentity();
    final id = platformId ?? 'device-${DateTime.now().microsecondsSinceEpoch}';
    await _store.write(_identityKey, id);
    return MeshParticipant(id: id, name: 'This device');
  }

  Future<String?> _readPlatformIdentity() async {
    if (_store is MemoryStore) return null;
    if (defaultTargetPlatform != TargetPlatform.android) return null;
    try {
      final value = await _identityChannel
          .invokeMethod<String>('getId')
          .timeout(const Duration(milliseconds: 10));
      if (value == null || value.isEmpty) return null;
      return 'android-$value';
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    } on TimeoutException {
      return null;
    }
  }
}
