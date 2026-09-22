package edu.holysai.tracker.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeEncoder
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import edu.holysai.tracker.TrackerConfig
import edu.holysai.tracker.TrackerService
import edu.holysai.tracker.TrackerStatus
import java.text.DateFormat
import java.util.Date
import java.util.Locale

/**
 * The whole app: set the phone up from the GPS Devices setup QR, then start
 * tracking. Also shows the device-ID QR staff scan to assign the phone to a
 * student, a reliability checklist, and a log of what was sent.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackerScreen(pendingSetup: String?) {
    val context = LocalContext.current
    val status by TrackerService.status.collectAsState()
    var configured by remember { mutableStateOf(TrackerConfig.isConfigured) }
    var setupMessage by remember { mutableStateOf<String?>(null) }
    var showManual by remember { mutableStateOf(false) }
    var showQr by remember { mutableStateOf(false) }
    var confirmReset by remember { mutableStateOf(false) }
    // Bumped on resume so the checklist re-reads permissions changed in Settings.
    var resumes by remember { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) { resumes++; onPauseOrDispose { } }

    fun applySetup(text: String) {
        val err = TrackerConfig.applySetup(text)
        if (err == null) {
            if (status.running) TrackerService.stop(context)
            configured = true
            setupMessage = "Ready. Device ${TrackerConfig.deviceId} is set up."
        } else setupMessage = err
    }

    LaunchedEffect(pendingSetup) { pendingSetup?.let { applySetup(it) } }

    val scan = rememberLauncherForActivityResult(ScanContract()) { r -> r.contents?.let { applySetup(it) } }
    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true) TrackerService.start(context)
        else setupMessage = "Precise location permission is needed to track this device."
    }
    val background = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        resumes++
        if (!ok) openAppSettings(context)
    }

    fun start() {
        val needed = buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            add(Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val missing = needed.filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) TrackerService.start(context) else permissions.launch(missing.toTypedArray())
    }

    // Resume tracking after the app was closed (or killed) while tracking was on.
    LaunchedEffect(Unit) {
        if (TrackerConfig.enabled && TrackerConfig.isConfigured && !status.running && TrackerService.hasLocationPermission(context)) {
            TrackerService.start(context)
        }
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopAppBar(
            title = { Text("Holy Sai GPS Tracker") },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MagentaDeep, titleContentColor = Color.White),
        )
        Column(
            Modifier.fillMaxSize().imePadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (!configured) {
                SetupCard(onScan = {
                    scan.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("Scan the setup QR from GPS Devices").setBeepEnabled(false).setOrientationLocked(false))
                }, onManual = { showManual = true })
            } else {
                StatusCard(status)
                if (status.running) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { TrackerService.stop(context) },
                            colors = ButtonDefaults.buttonColors(containerColor = Danger),
                            modifier = Modifier.weight(1f).height(52.dp),
                        ) { Text("STOP TRACKING", fontWeight = FontWeight.Bold) }
                        OutlinedButton(onClick = { TrackerService.sendNow() }, modifier = Modifier.height(52.dp)) { Text("Send now") }
                    }
                } else {
                    Button(
                        onClick = { start() },
                        colors = ButtonDefaults.buttonColors(containerColor = Teal),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text("START TRACKING", fontWeight = FontWeight.Bold) }
                }
                IntervalRow(enabled = !status.running)
                ReliabilityCard(
                    refreshKey = resumes,
                    onBackground = {
                        if (!TrackerService.hasLocationPermission(context)) start()
                        else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) background.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { showQr = true }, modifier = Modifier.weight(1f)) { Text("Show device QR") }
                    OutlinedButton(onClick = { confirmReset = true }, modifier = Modifier.weight(1f)) { Text("Change device") }
                }
                Text(
                    "Server: ${TrackerConfig.server}",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (status.log.isNotEmpty()) LogCard(status)
            }
            setupMessage?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = if (it.startsWith("Ready")) Teal else MaterialTheme.colorScheme.error)
            }
        }
    }

    if (showManual) ManualSetupDialog(onDismiss = { showManual = false }) { server, device, token ->
        showManual = false
        applySetup("holysai-tracker:setup?server=${Uri.encode(server)}&device=${Uri.encode(device)}&token=${Uri.encode(token)}")
    }
    if (showQr) DeviceQrDialog(TrackerConfig.deviceId) { showQr = false }
    if (confirmReset) AlertDialog(
        onDismissRequest = { confirmReset = false },
        title = { Text("Remove this device setup?") },
        text = { Text("Tracking stops and the device token is deleted from this phone. You will need a new setup QR to track again.") },
        confirmButton = {
            TextButton(onClick = {
                confirmReset = false
                TrackerService.stop(context)
                TrackerConfig.clear()
                configured = false
                setupMessage = null
            }) { Text("Remove", color = Danger) }
        },
        dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Cancel") } },
    )
}

@Composable
private fun SetupCard(onScan: () -> Unit, onManual: () -> Unit) {
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Set up this phone as a GPS device", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                "1. On the web: Safety & Transport → GPS Devices → Register device, type “Android phone”.\n" +
                    "2. Choose “Android phone setup” in the token window.\n" +
                    "3. Scan that QR here.\n" +
                    "4. Tap “Show device QR” and scan it on the student's page to assign this phone.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Button(onClick = onScan, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Icon(Icons.Outlined.QrCodeScanner, null)
                Spacer(Modifier.size(8.dp))
                Text("Scan setup QR")
            }
            TextButton(onClick = onManual, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Enter details manually") }
        }
    }
}

@Composable
private fun StatusCard(s: TrackerStatus) {
    val fmt = remember { DateFormat.getTimeInstance(DateFormat.MEDIUM) }
    val loc = s.location
    val (gpsText, gpsColor) = when {
        !s.running -> "STOPPED" to MaterialTheme.colorScheme.onSurfaceVariant
        !s.locationEnabled -> "LOCATION OFF" to Danger
        loc == null -> "SEARCHING" to Amber
        else -> "ACTIVE" to Teal
    }
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Field("Device", TrackerConfig.deviceId, mono = true)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("GPS", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Spacer(Modifier.size(10.dp).clip(CircleShape).background(gpsColor))
                    Text(gpsText, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = gpsColor)
                }
            }
            if (s.running && s.satellitesVisible != null) Field("Satellites (used / seen)", "${s.satellitesUsed ?: 0} / ${s.satellitesVisible}")
            HorizontalDivider(Modifier.padding(vertical = 6.dp))
            Field("Latitude", loc?.let { String.format(Locale.US, "%.7f", it.latitude) } ?: "—", mono = true)
            Field("Longitude", loc?.let { String.format(Locale.US, "%.7f", it.longitude) } ?: "—", mono = true)
            Field("Accuracy", loc?.takeIf { it.hasAccuracy() }?.let { String.format(Locale.US, "%.1f m", it.accuracy) } ?: "—")
            Field("Speed", loc?.takeIf { it.hasSpeed() }?.let { String.format(Locale.US, "%.1f km/h", it.speed * 3.6) } ?: "—")
            Field("Fix time", loc?.let { fmt.format(Date(it.time)) + " · " + (it.provider ?: "") } ?: "—")
            HorizontalDivider(Modifier.padding(vertical = 6.dp))
            Field("Battery", s.battery?.let { "$it%" } ?: "—")
            Field("Last sent", s.lastSentAt?.let { fmt.format(Date(it)) } ?: "—")
            Field("Points sent", "${s.sentCount}")
            s.lastStudent?.let { Field("Recorded for student", it) }
            if (s.queued > 0) Field("Waiting to send", "${s.queued}", color = Amber)
            Field("Interval", "${TrackerConfig.intervalSeconds} s")
            s.message?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = if (s.messageIsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** The settings that decide whether tracking survives screen-off, battery saving and reboots. */
@Composable
private fun ReliabilityCard(refreshKey: Int, onBackground: () -> Unit) {
    val context = LocalContext.current
    val locationOn = remember(refreshKey) { isLocationOn(context) }
    val backgroundOk = remember(refreshKey) { TrackerService.hasLocationPermission(context) && TrackerService.hasBackgroundPermission(context) }
    val batteryOk = remember(refreshKey) { isIgnoringBatteryOptimizations(context) }
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Keep tracking reliable", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            CheckRow("Location turned on", locationOn, "Turn on") {
                context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            }
            CheckRow("Location allowed “all the time” (resumes after restart)", backgroundOk, "Allow", onBackground)
            CheckRow("Battery unrestricted", batteryOk, "Allow") { requestBatteryExemption(context) }
        }
    }
}

@Composable
private fun CheckRow(label: String, ok: Boolean, action: String, onFix: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(
            if (ok) Icons.Outlined.CheckCircle else Icons.Outlined.ErrorOutline, null,
            tint = if (ok) Teal else Amber, modifier = Modifier.size(20.dp),
        )
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        if (!ok) TextButton(onClick = onFix, contentPadding = PaddingValues(horizontal = 8.dp)) { Text(action) }
    }
}

@Composable
private fun LogCard(s: TrackerStatus) {
    val fmt = remember { DateFormat.getTimeInstance(DateFormat.MEDIUM) }
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Activity", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            s.log.forEach { e ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(fmt.format(Date(e.at)), style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(e.text, style = MaterialTheme.typography.bodySmall, color = if (e.ok) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
private fun Field(label: String, value: String, mono: Boolean = false, color: Color? = null) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold,
            fontFamily = if (mono) FontFamily.Monospace else null, color = color ?: MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun IntervalRow(enabled: Boolean) {
    var interval by remember { mutableIntStateOf(TrackerConfig.intervalSeconds) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Send every", style = MaterialTheme.typography.bodyMedium)
        listOf(10, 30, 60, 120).forEach { s ->
            val selected = interval == s
            OutlinedButton(
                onClick = { interval = s; TrackerConfig.intervalSeconds = s }, enabled = enabled,
                colors = if (selected) ButtonDefaults.outlinedButtonColors(containerColor = MaterialTheme.colorScheme.primaryContainer) else ButtonDefaults.outlinedButtonColors(),
                contentPadding = PaddingValues(horizontal = 10.dp),
            ) { Text(if (s < 60) "${s}s" else "${s / 60}m") }
        }
    }
}

@Composable
private fun ManualSetupDialog(onDismiss: () -> Unit, onSave: (String, String, String) -> Unit) {
    var server by remember { mutableStateOf(TrackerConfig.server) }
    var device by remember { mutableStateOf(TrackerConfig.deviceId) }
    var token by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Device details") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(server, { server = it }, label = { Text("Server address") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                OutlinedTextField(device, { device = it.uppercase() }, label = { Text("Device ID") }, singleLine = true, placeholder = { Text("GPS000123") })
                OutlinedTextField(token, { token = it }, label = { Text("Device token") }, singleLine = true, placeholder = { Text("hsd_…") })
            }
        },
        confirmButton = { TextButton(onClick = { onSave(server, device, token) }, enabled = device.isNotBlank() && token.startsWith("hsd_")) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** The device-ID QR staff scan on the student's page to assign this phone. */
@Composable
private fun DeviceQrDialog(deviceId: String, onDismiss: () -> Unit) {
    val bitmap: Bitmap? = remember(deviceId) {
        runCatching { BarcodeEncoder().encodeBitmap(deviceId, BarcodeFormat.QR_CODE, 600, 600) }.getOrNull()
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Device $deviceId") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                bitmap?.let { Image(it.asImageBitmap(), "QR code for $deviceId", Modifier.size(240.dp).background(Color.White)) }
                Spacer(Modifier.height(8.dp))
                Text(deviceId, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                Text("Scan this on the student's page (Assign device) to link this phone to the student.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}

private fun isLocationOn(context: Context): Boolean {
    val lm = context.getSystemService(LocationManager::class.java)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) lm.isLocationEnabled
    else lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
}

private fun isIgnoringBatteryOptimizations(context: Context) =
    context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)

@SuppressLint("BatteryLife") // a dedicated tracker must keep running; installed outside the Play Store
private fun requestBatteryExemption(context: Context) {
    val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
    runCatching { context.startActivity(direct) }.onFailure {
        runCatching { context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
    }
}

private fun openAppSettings(context: Context) {
    runCatching { context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))) }
}
