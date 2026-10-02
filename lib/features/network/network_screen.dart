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
              Text('Connected apps', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              if (node == null)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.people_outline),
                    title: Text('Connect a node to see participants'),
                  ),
                )
              else if (controller.participants.isEmpty)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.sync),
                    title: Text('Participant roster unavailable'),
                    subtitle: Text(
                      'This node has not reported other connected apps yet.',
                    ),
                  ),
                )
              else
                ...controller.participants.map(
                  (participant) => Card(
                    child: ListTile(
                      leading: Icon(
                        participant.connected ? Icons.person : Icons.person_off,
                      ),
                      title: Text(participant.name),
                      subtitle: Text(
                        participant.lastHeard == null
                            ? participant.id
                            : '${participant.id} • last heard '
                                '${participant.lastHeard}',
                      ),
                      trailing: Text(participant.connected ? 'Connected' : 'Offline'),
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
