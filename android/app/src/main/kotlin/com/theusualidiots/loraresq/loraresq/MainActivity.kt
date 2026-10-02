package com.theusualidiots.loraresq.loraresq

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "lorare_sq/notifications"
    private val notificationChannelId = "lorare_sq_alerts"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getId" -> {
                        result.success(
                            Settings.Secure.getString(
                                contentResolver,
                                Settings.Secure.ANDROID_ID
                            )
                        )
                    }
                    "initialize" -> {
                        createNotificationChannel()
                        if (Build.VERSION.SDK_INT >= 33 &&
                            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                            PackageManager.PERMISSION_GRANTED
                        ) {
                            ActivityCompat.requestPermissions(
                                this,
                                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                                1001
                            )
                        }
                        result.success(null)
                    }
                    "showAlert" -> {
                        val title = call.argument<String>("title") ?: "LoRaResQ alert"
                        val body = call.argument<String>("body") ?: ""
                        if (Build.VERSION.SDK_INT < 33 ||
                            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                            PackageManager.PERMISSION_GRANTED
                        ) {
                            val notification = NotificationCompat.Builder(
                                this,
                                notificationChannelId
                            )
                                .setSmallIcon(com.theusualidiots.loraresq.loraresq.R.mipmap.ic_launcher)
                                .setContentTitle(title)
                                .setContentText(body)
                                .setPriority(NotificationCompat.PRIORITY_HIGH)
                                .setAutoCancel(true)
                                .build()
                            NotificationManagerCompat.from(this).notify(
                                System.currentTimeMillis().toInt(),
                                notification
                            )
                        }
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                notificationChannelId,
                "LoRaResQ alerts",
                NotificationManager.IMPORTANCE_HIGH
            )
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }
}
