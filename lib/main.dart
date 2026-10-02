import 'package:flutter/material.dart';

import 'app/app.dart';
import 'data/local_store.dart';
import 'data/ble_node_transport.dart';
import 'app/app_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await SharedPreferencesStore.create();
  runApp(
    LoraResQApp(
      controller: AppController(
        transport: UniversalBleNodeTransport(),
        store: store,
      ),
    ),
  );
}
