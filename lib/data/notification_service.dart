import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class NotificationService {
  NotificationService._();

  static final instance = NotificationService._();
  static const _channel = MethodChannel('lorare_sq/notifications');
  bool _ready = false;

  Future<void> initialize() async {
    if (_ready || kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return;
    }
    await _channel.invokeMethod<void>('initialize');
    _ready = true;
  }

  Future<void> showAlert({
    required String title,
    required String body,
  }) async {
    if (!_ready) return;
    await _channel.invokeMethod<void>(
      'showAlert',
      {'title': title, 'body': body},
    );
  }
}
