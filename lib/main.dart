import 'package:flutter/material.dart';

import 'app/app.dart';
import 'data/local_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await SharedPreferencesStore.create();
  runApp(LoraResQApp(store: store));
}
