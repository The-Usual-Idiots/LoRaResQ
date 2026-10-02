import 'package:flutter/material.dart';

import '../../app/app_controller.dart';
import '../../domain/mesh_models.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({required this.controller, super.key});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(title: const Text('LoRaResQ')),
          body: SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 900),
                child: ListView(
                  padding: const EdgeInsets.all(24),
                  children: [
                    _ConnectionCard(controller: controller),
                    if (controller.errorMessage != null) ...[
                      const SizedBox(height: 16),
                      _ErrorBanner(
                        message: controller.errorMessage!,
                        onDismiss: controller.clearError,
                      ),
                    ],
                    const SizedBox(height: 24),
                    const _ActionCard(),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ConnectionCard extends StatelessWidget {
  const _ConnectionCard({required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final connected = controller.connectionState == NodeConnectionState.connected;
    final busy = controller.connectionState == NodeConnectionState.scanning ||
        controller.connectionState == NodeConnectionState.connecting;
    final colors = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor:
                      connected ? colors.primaryContainer : colors.errorContainer,
                  foregroundColor: connected
                      ? colors.onPrimaryContainer
                      : colors.onErrorContainer,
                  child: Icon(connected ? Icons.link : Icons.link_off),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    connected
                        ? 'Connected to ${controller.connectedNode!.name}'
                        : busy
                            ? 'Looking for your node…'
                            : 'Node disconnected',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              connected
                  ? 'Ready to send through the local mesh.'
                  : 'Connect your personal ESP32 node to send messages through the local mesh.',
            ),
            if (connected) ...[
              const SizedBox(height: 12),
              Text(
                'Battery ${controller.connectedNode!.batteryPercent ?? 'unknown'}%  •  '
                'Signal ${controller.connectedNode!.signalStrength} dBm',
              ),
            ],
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.icon(
                  onPressed: busy
                      ? null
                      : connected
                          ? controller.disconnect
                          : () => _showNodePicker(context),
                  icon: Icon(connected ? Icons.link_off : Icons.bluetooth_searching),
                  label: Text(connected ? 'Disconnect' : 'Find node'),
                ),
                if (controller.discoveredNodes.isNotEmpty && !connected)
                  Text('${controller.discoveredNodes.length} node found'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showNodePicker(BuildContext context) async {
    await controller.scan();
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: controller.discoveredNodes.isEmpty
              ? const Text('No open nodes found. Switch on your ESP32 node and try again.')
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Choose a node', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 12),
                    ...controller.discoveredNodes.map(
                      (node) => ListTile(
                        leading: const Icon(Icons.memory),
                        title: Text(node.name),
                        subtitle: Text('${node.signalStrength} dBm'),
                        onTap: () {
                          Navigator.pop(context);
                          controller.connect(node);
                        },
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onDismiss});

  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Theme.of(context).colorScheme.errorContainer,
      child: ListTile(
        leading: const Icon(Icons.error_outline),
        title: const Text('Action could not be completed'),
        subtitle: Text(message),
        trailing: IconButton(
          onPressed: onDismiss,
          tooltip: 'Dismiss error',
          icon: const Icon(Icons.close),
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Local communication', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            const Text(
              'Connect a node before sending an alert or message. LoRaResQ is '
              'best-effort and complements official emergency channels whenever available.',
            ),
          ],
        ),
      ),
    );
  }
}
