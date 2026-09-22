package edu.holysai.tracker.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Holy Sai brand palette (same values as the main app's theme)
val Magenta = Color(0xFF990033)
val MagentaDeep = Color(0xFF5C001D)
val Gold = Color(0xFFFEDB6E)
val Teal = Color(0xFF0D7B66)
val Amber = Color(0xFFC27E0A)
val Danger = Color(0xFFC62828)

private val Light = lightColorScheme(
    primary = Magenta,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFF0F4),
    onPrimaryContainer = MagentaDeep,
    tertiary = Teal,
    background = Color(0xFFF8F5F2),
    onBackground = Color(0xFF171717),
    surface = Color.White,
    onSurface = Color(0xFF171717),
    surfaceVariant = Color(0xFFF1ECE7),
    onSurfaceVariant = Color(0xFF5C5C5C),
    outline = Color(0xFFD9D2CB),
    error = Danger,
)

private val Dark = darkColorScheme(
    primary = Color(0xFFFF8FB0),
    onPrimary = Color(0xFF3E0013),
    primaryContainer = Color(0xFF5C001D),
    onPrimaryContainer = Color(0xFFFFD9E2),
    tertiary = Color(0xFF6FD6BF),
    background = Color(0xFF141112),
    surface = Color(0xFF1D191A),
    surfaceVariant = Color(0xFF2A2425),
    error = Color(0xFFFF8A80),
)

@Composable
fun TrackerTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
