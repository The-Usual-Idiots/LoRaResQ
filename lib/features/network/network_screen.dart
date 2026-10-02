import 'package:flutter/material.dart';

import '../../app/app_controller.dart';

class NetworkScreen extends StatelessWidget {
  const NetworkScreen({required this.controller, super.key});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final node = controller.connectedNode;
        return Scaffold(
          appBar: AppBar(title: const Text('Network')),
          body: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Card(
                child: ListTile(
                  leading: const Icon(Icons.memory),
                  title: Text(node?.name ?? 'No node connected'),
                  subtitle: Text(
                    node == null
                        ? 'Connect a personal node to see health.'
                        : 'Battery ${node.batteryPercent ?? 'unknown'}%  •  '
                            'Signal ${node.signalStrength} dBm',
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Card(
                child: ListTile(
                  leading: Icon(Icons.info_outline),
                  title: Text('Best-effort local mesh'),
                  subtitle: Text(
                    'A sent message is not proof that help arrived. '
                    'Use official emergency channels whenever available.',
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
