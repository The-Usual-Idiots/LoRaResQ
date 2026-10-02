import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:loraresq/app/app.dart';
import 'package:loraresq/app/app_controller.dart';
import 'package:loraresq/data/node_transport.dart';
import 'package:loraresq/data/local_store.dart';
import 'package:loraresq/domain/mesh_models.dart';

void main() {
  testWidgets('renders the disconnected Home shell', (tester) async {
    await tester.pumpWidget(const LoraResQApp());

    expect(find.text('LoRaResQ'), findsOneWidget);
    expect(find.text('Node disconnected'), findsOneWidget);
    expect(find.text('Find node'), findsOneWidget);
    expect(find.text('Local communication'), findsOneWidget);
  });

  testWidgets('discovers and connects to the demo node', (tester) async {
    await tester.pumpWidget(const LoraResQApp());

    await tester.tap(find.text('Find node'));
    await tester.pumpAndSettle();
    expect(find.text('Demo Node'), findsOneWidget);

    await tester.tap(find.text('Demo Node'));
    await tester.pumpAndSettle();

    expect(find.text('Connected to Demo Node'), findsOneWidget);
    expect(find.text('Disconnect'), findsOneWidget);
  });

  testWidgets('sends a message through the connected demo node', (tester) async {
    final controller = AppController(transport: DemoNodeTransport());
    await tester.pumpWidget(LoraResQApp(controller: controller));

    await tester.tap(find.text('Find node'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Demo Node'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Messages').first);
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Meet at the school');
    await tester.tap(find.text('Send to mesh'));
    await tester.pumpAndSettle();

    expect(find.text('Meet at the school'), findsOneWidget);
    expect(find.text('Acknowledged'), findsOneWidget);
  });

  testWidgets('uses the desktop navigation rail at wide widths', (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const LoraResQApp());

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets('restores messages from local storage', (tester) async {
    final store = MemoryStore();
    final controller = AppController(
      transport: DemoNodeTransport(),
      store: store,
    );
    await controller.connect(
      (await DemoNodeTransport().scan()).first,
    );
    await controller.send(
      destination: 'community',
      body: 'Persist this message',
    );

    final restored = AppController(
      transport: DemoNodeTransport(),
      store: store,
    );
    await tester.pumpWidget(LoraResQApp(controller: restored));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Messages').first);
    await tester.pumpAndSettle();
    expect(find.text('Persist this message'), findsOneWidget);
  });

  test('restores the remembered node association', () async {
    final store = MemoryStore();
    final transport = DemoNodeTransport();
    final node = (await transport.scan()).first;
    final first = AppController(transport: transport, store: store);
    await first.connect(node);

    final restored = AppController(
      transport: DemoNodeTransport(),
      store: store,
    );
    await restored.restore();

    expect(restored.connectionState, NodeConnectionState.connected);
    expect(restored.connectedNode?.id, node.id);
  });
}
