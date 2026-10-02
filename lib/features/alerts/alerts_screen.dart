import 'package:flutter/material.dart';

import '../../app/app_controller.dart';
import '../../domain/mesh_models.dart';
import '../shared/delivery_badge.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({required this.controller, super.key});

  final AppController controller;

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  final _noteController = TextEditingController();
  AlertKind? _selectedKind;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final latestAlert = widget.controller.messages
            .where((message) => message.alertKind != null)
            .firstOrNull;
        return Scaffold(
          appBar: AppBar(title: const Text('Alerts')),
          body: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Text(
                'Choose a clear local action. Hold confirmation is required before sending.',
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: AlertKind.values
                    .map((kind) => _AlertButton(
                          kind: kind,
                          onPressed: widget.controller.connectedNode == null
                              ? null
                              : () => _confirmAlert(context, kind),
                        ))
                    .toList(),
              ),
              if (latestAlert != null) ...[
                const SizedBox(height: 28),
                Text('Latest alert', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Card(
                  child: ListTile(
                    title: Text(_alertLabel(latestAlert.alertKind!)),
                    subtitle: Text(latestAlert.body),
                    trailing: DeliveryBadge(state: latestAlert.state),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Future<void> _confirmAlert(BuildContext context, AlertKind kind) async {
    _selectedKind = kind;
    _noteController.clear();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Send ${_alertLabel(kind)}?'),
        content: TextField(
          controller: _noteController,
          maxLength: maxMessageLength,
          decoration: const InputDecoration(
            labelText: 'Optional landmark or note',
            hintText: 'Keep it short and actionable',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Hold confirmed'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    await widget.controller.send(
      destination: 'community',
      body: _noteController.text.trim().isEmpty
          ? _alertLabel(_selectedKind!)
          : '${_alertLabel(_selectedKind!)}: ${_noteController.text.trim()}',
      alertKind: _selectedKind,
    );
  }
}

class _AlertButton extends StatelessWidget {
  const _AlertButton({required this.kind, required this.onPressed});

  final AlertKind kind;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton.tonalIcon(
      onPressed: onPressed,
      icon: Icon(_alertIcon(kind)),
      label: Text(_alertLabel(kind)),
    );
  }
}

String _alertLabel(AlertKind kind) {
  switch (kind) {
    case AlertKind.sos:
      return 'SOS';
    case AlertKind.medical:
      return 'Medical help';
    case AlertKind.fire:
      return 'Fire';
    case AlertKind.flood:
      return 'Flood';
    case AlertKind.roadBlocked:
      return 'Road blocked';
    case AlertKind.allSafe:
      return 'I am safe';
    case AlertKind.meeting:
      return 'Meeting call';
  }
}

IconData _alertIcon(AlertKind kind) {
  switch (kind) {
    case AlertKind.sos:
      return Icons.sos;
    case AlertKind.medical:
      return Icons.medical_services_outlined;
    case AlertKind.fire:
      return Icons.local_fire_department_outlined;
    case AlertKind.flood:
      return Icons.water;
    case AlertKind.roadBlocked:
      return Icons.block;
    case AlertKind.allSafe:
      return Icons.check_circle_outline;
    case AlertKind.meeting:
      return Icons.groups_outlined;
  }
}
