import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:loraresq/app/app.dart';

void main() {
  testWidgets('renders the disconnected Home shell', (tester) async {
    await tester.pumpWidget(const LoraResQApp());

    expect(find.text('LoRaResQ'), findsOneWidget);
    expect(find.text('Node disconnected'), findsOneWidget);
    expect(find.text('Connect'), findsOneWidget);
    expect(find.text('Local communication'), findsOneWidget);
  });

  testWidgets('uses the desktop navigation rail at wide widths', (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const LoraResQApp());

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets('navigates to the Messages placeholder', (tester) async {
    await tester.pumpWidget(const LoraResQApp());

    await tester.tap(find.text('Messages').first);
    await tester.pumpAndSettle();

    expect(find.text('Messages will be available in the next phase.'), findsOneWidget);
  });
}
