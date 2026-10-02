import 'package:flutter/material.dart';

import '../../app/app_controller.dart';
import '../../domain/mesh_models.dart';
import '../shared/delivery_badge.dart';

class MessagesScreen extends StatefulWidget {
  const MessagesScreen({required this.controller, super.key});

  final AppController controller;

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  final _messageController = TextEditingController();

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) => Scaffold(
        appBar: AppBar(title: const Text('Messages')),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            TextField(
              controller: _messageController,
              maxLength: maxMessageLength,
              enabled: widget.controller.connectedNode != null,
              decoration: const InputDecoration(
                labelText: 'Message to community',
                hintText: 'Keep the message under 120 characters',
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: widget.controller.connectedNode == null
                  ? null
                  : () => _sendMessage(context),
              icon: const Icon(Icons.send),
              label: const Text('Send to mesh'),
            ),
            const SizedBox(height: 24),
            if (widget.controller.messages.isEmpty)
              const Center(child: Text('No messages yet.')),
            ...widget.controller.messages.map(
              (message) => Card(
                child: ListTile(
                  title: Text(message.body),
                  subtitle: Text('To ${message.destination}'),
                  trailing: DeliveryBadge(state: message.state),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _sendMessage(BuildContext context) async {
    final body = _messageController.text.trim();
    if (body.isEmpty || body.length > maxMessageLength) return;
    await widget.controller.send(destination: 'community', body: body);
    if (context.mounted) _messageController.clear();
  }
}
