import 'package:flutter/material.dart';

import '../../domain/mesh_models.dart';

String deliveryLabel(DeliveryState state) {
  switch (state) {
    case DeliveryState.draft:
      return 'Draft';
    case DeliveryState.acceptedByNode:
      return 'Accepted by node';
    case DeliveryState.queuedForRadio:
      return 'Queued for radio';
    case DeliveryState.sentToMesh:
      return 'Sent to mesh';
    case DeliveryState.acknowledged:
      return 'Acknowledged';
    case DeliveryState.expired:
      return 'Expired / not acknowledged';
  }
}

class DeliveryBadge extends StatelessWidget {
  const DeliveryBadge({required this.state, super.key});

  final DeliveryState state;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final acknowledged = state == DeliveryState.acknowledged;
    return Chip(
      avatar: Icon(
        acknowledged ? Icons.check_circle_outline : Icons.schedule,
        size: 18,
        color: acknowledged ? colors.primary : colors.onSurfaceVariant,
      ),
      label: Text(deliveryLabel(state)),
    );
  }
}
