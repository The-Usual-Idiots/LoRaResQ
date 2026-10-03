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
  String _destination = 'community';

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
            if (!widget.controller.communicationEnabled)
              const Card(
                child: ListTile(
                  leading: Icon(Icons.link_off),
                  title: Text('Connect a node to enable messages'),
                  subtitle: Text('Messages cannot be sent while disconnected.'),
                ),
              ),
            if (widget.controller.errorMessage != null)
              Card(
                color: Theme.of(context).colorScheme.errorContainer,
                child: ListTile(
                  leading: const Icon(Icons.error_outline),
                  title: const Text('Message could not be sent'),
                  subtitle: Text(widget.controller.errorMessage!),
                ),
              ),
            DropdownButtonFormField<String>(
              initialValue: _destination,
              decoration: const InputDecoration(labelText: 'Send to'),
              items: widget.controller.messageDestinations
                  .map(
                    (participant) => DropdownMenuItem(
                      value: participant.id,
                      child: Text(participant.name),
                    ),
                  )
                  .toList(),
              onChanged: widget.controller.communicationEnabled
                  ? (value) =>
                        setState(() => _destination = value ?? 'community')
                  : null,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _messageController,
              maxLength: maxMessageLength,
              enabled: widget.controller.connectedNode != null,
              decoration: const InputDecoration(
                labelText: 'Message',
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
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Message history'),
                IconButton(
                  tooltip: 'Reload messages from ESP32',
                  onPressed: widget.controller.connectedNode == null
                      ? null
                      : widget.controller.refreshMessages,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            ...widget.controller.messages.map(
              (message) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Theme.of(context)
                                  .colorScheme
                                  .secondaryContainer,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              message.destination == 'community'
                                  ? 'COMMUNITY'
                                  : 'DIRECT',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ),
                          const Spacer(),
                          DeliveryBadge(state: message.state),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(message.body),
                      const SizedBox(height: 4),
                      Text(
                        'From ${message.senderName} • Sent '
                        '${message.createdAt.toLocal()}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
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
    final message = await widget.controller.send(
      destination: _destination,
      body: body,
    );
    if (message != null && context.mounted) _messageController.clear();
  }
}
