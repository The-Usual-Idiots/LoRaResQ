import 'package:flutter/material.dart';

import 'app_controller.dart';
import '../data/local_store.dart';
import '../features/alerts/alerts_screen.dart';
import '../features/home/home_screen.dart';
import '../features/messages/messages_screen.dart';
import '../features/network/network_screen.dart';

class LoraResQApp extends StatelessWidget {
  const LoraResQApp({this.controller, this.store, super.key});

  final AppController? controller;
  final LocalStore? store;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LoRaResQ',
      theme: _buildTheme(),
      debugShowCheckedModeBanner: false,
      home: AppShell(
        controller: controller ?? AppController(store: store),
      ),
    );
  }
}

ThemeData _buildTheme() {
  final colorScheme = ColorScheme.fromSeed(
    seedColor: const Color(0xFF0B6E69),
    brightness: Brightness.light,
  );

  return ThemeData(
    colorScheme: colorScheme,
    useMaterial3: true,
    scaffoldBackgroundColor: const Color(0xFFF7FAF9),
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(),
    ),
    navigationBarTheme: NavigationBarThemeData(
      indicatorColor: colorScheme.secondaryContainer,
    ),
  );
}

class AppShell extends StatefulWidget {
  const AppShell({required this.controller, super.key});

  final AppController controller;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    widget.controller.restore();
  }

  static const _destinations = <NavigationDestination>[
    NavigationDestination(
      key: ValueKey('home-navigation'),
      icon: Icon(Icons.home_outlined),
      selectedIcon: Icon(Icons.home),
      label: 'Home',
    ),
    NavigationDestination(
      key: ValueKey('alerts-navigation'),
      icon: Icon(Icons.warning_amber_outlined),
      selectedIcon: Icon(Icons.warning),
      label: 'Alerts',
    ),
    NavigationDestination(
      key: ValueKey('messages-navigation'),
      icon: Icon(Icons.chat_bubble_outline),
      selectedIcon: Icon(Icons.chat_bubble),
      label: 'Messages',
    ),
    NavigationDestination(
      key: ValueKey('network-navigation'),
      icon: Icon(Icons.hub_outlined),
      selectedIcon: Icon(Icons.hub),
      label: 'Network',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      HomeScreen(controller: widget.controller),
      AlertsScreen(controller: widget.controller),
      MessagesScreen(controller: widget.controller),
      NetworkScreen(controller: widget.controller),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final useRail = constraints.maxWidth >= 700;
        final content = IndexedStack(index: _selectedIndex, children: pages);

        if (useRail) {
          return Scaffold(
            body: Row(
              children: [
                NavigationRail(
                  selectedIndex: _selectedIndex,
                  onDestinationSelected: _selectDestination,
                  labelType: NavigationRailLabelType.all,
                  destinations: _destinations
                      .map(
                        (destination) => NavigationRailDestination(
                          icon: destination.icon,
                          selectedIcon: destination.selectedIcon,
                          label: Text(destination.label),
                        ),
                      )
                      .toList(),
                ),
                const VerticalDivider(width: 1),
                Expanded(child: content),
              ],
            ),
          );
        }

        return Scaffold(
          body: content,
          bottomNavigationBar: NavigationBar(
            selectedIndex: _selectedIndex,
            onDestinationSelected: _selectDestination,
            destinations: _destinations,
          ),
        );
      },
    );
  }

  void _selectDestination(int index) {
    setState(() => _selectedIndex = index);
  }
}
