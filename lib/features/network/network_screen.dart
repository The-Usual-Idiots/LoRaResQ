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
              Text(
                'Connected apps',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              if (node == null)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.people_outline),
                    title: Text('Connect a node to see participants'),
                  ),
                )
              else if (controller.participants.isEmpty)
                Card(
                  child: ListTile(
                    leading: controller.refreshingParticipants
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.sync),
                    title: const Text('Participant roster unavailable'),
                    subtitle: const Text(
                      'Tap to request the latest table from the ESP32.',
                    ),
                    onTap: controller.refreshingParticipants
                        ? null
                        : controller.refreshParticipants,
                  ),
                )
              else ...[
                Align(
                  alignment: Alignment.centerRight,
                  child: IconButton(
                    tooltip: 'Refresh participant roster',
                    onPressed: controller.refreshingParticipants
                        ? null
                        : controller.refreshParticipants,
                    icon: controller.refreshingParticipants
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.sync),
                  ),
                ),
                ...controller.participants.map(
                  (participant) => Card(
                    child: ListTile(
                      leading: Icon(
                        participant.connected ? Icons.person : Icons.person_off,
                      ),
                      title: Text(
                        participant.id == controller.localParticipant.id
                            ? '${participant.name} (This device)'
                            : '${participant.name} (Other device)',
                      ),
                      subtitle: Text(
                        participant.lastHeard == null
                            ? participant.id
                            : '${participant.id} • last heard '
                                  '${participant.lastHeard}',
                      ),
                      trailing: Text(
                        participant.connected ? 'Connected' : 'Offline',
                      ),
                    ),
                  ),
                ),
              ],
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
