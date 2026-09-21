package edu.holysai.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import edu.holysai.app.data.Session
import edu.holysai.app.ui.AppRoot
import edu.holysai.app.ui.theme.HolySaiTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Session.init(applicationContext)
        enableEdgeToEdge()
        setContent { HolySaiTheme { AppRoot() } }
    }
}
