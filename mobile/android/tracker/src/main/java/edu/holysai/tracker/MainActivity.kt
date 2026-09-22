package edu.holysai.tracker

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import edu.holysai.tracker.ui.TrackerScreen
import edu.holysai.tracker.ui.TrackerTheme

class MainActivity : ComponentActivity() {
    /** A setup link (holysai-tracker:setup?…) scanned with the phone's camera app. */
    private val pendingSetup = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TrackerConfig.init(applicationContext)
        pendingSetup.value = setupFrom(intent)
        enableEdgeToEdge()
        setContent { TrackerTheme { TrackerScreen(pendingSetup.value) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setupFrom(intent)?.let { pendingSetup.value = it }
    }

    private fun setupFrom(intent: Intent?): String? =
        intent?.takeIf { it.data?.scheme == "holysai-tracker" }?.dataString
}
