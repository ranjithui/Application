package edu.holysai.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import edu.holysai.app.data.Api
import edu.holysai.app.data.Session
import edu.holysai.app.data.User
import edu.holysai.app.data.friendly
import edu.holysai.app.data.prettyDate
import edu.holysai.app.data.str
import edu.holysai.app.ui.InfoCard
import edu.holysai.app.ui.Loaded
import edu.holysai.app.ui.LocalNav
import edu.holysai.app.ui.PrimaryButton
import edu.holysai.app.ui.ScreenList
import edu.holysai.app.ui.SectionTitle
import edu.holysai.app.ui.hasParentPortal
import edu.holysai.app.ui.homeTiles
import edu.holysai.app.ui.rememberLoad
import edu.holysai.app.ui.theme.Gold
import edu.holysai.app.ui.theme.Magenta
import edu.holysai.app.ui.theme.MagentaDeep
import kotlinx.coroutines.launch
import java.time.LocalTime

@Composable
fun LoginScreen(onSignedIn: (User) -> Unit) {
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var server by remember { mutableStateOf(Session.baseUrl) }
    var showServer by remember { mutableStateOf(false) }
    var showPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun submit() {
        if (identifier.isBlank() || password.isEmpty()) { error = "Enter your email or phone and password."; return }
        busy = true; error = null
        scope.launch {
            try {
                Session.baseUrl = server
                onSignedIn(Api.login(identifier, password))
            } catch (e: Exception) {
                error = e.friendly()
            }
            busy = false
        }
    }

    Column(
        Modifier.fillMaxSize()
            .background(Brush.verticalGradient(listOf(MagentaDeep, Color(0xFF3E0013))))
            .statusBarsPadding().imePadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(48.dp))
        Surface(shape = CircleShape, color = Gold, modifier = Modifier.size(72.dp)) {
            Box(contentAlignment = Alignment.Center) { Text("HS", color = MagentaDeep, fontWeight = FontWeight.Black, style = MaterialTheme.typography.headlineSmall) }
        }
        Spacer(Modifier.height(16.dp))
        Text("Holy Sai 360", color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Holy Sai International School", color = Gold, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(32.dp))
        Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Sign in", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    identifier, { identifier = it }, label = { Text("Email or phone") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    password, { password = it }, label = { Text("Password") }, singleLine = true,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    trailingIcon = {
                        IconButton(onClick = { showPassword = !showPassword }) {
                            Icon(if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, "Show password")
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (showServer) {
                    OutlinedTextField(
                        server, { server = it }, label = { Text("Server address") }, singleLine = true,
                        supportingText = { Text("Emulator + local API: http://10.0.2.2:4000") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                PrimaryButton("Sign in", busy = busy) { submit() }
                TextButton(onClick = { showServer = !showServer }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                    Text(if (showServer) "Hide server settings" else "Server settings")
                }
            }
        }
    }
}

@Composable
fun HomeScreen() {
    val nav = LocalNav.current
    val user = nav.user
    val tiles = homeTiles(user)
    val greeting = when (LocalTime.now().hour) { in 0..11 -> "Good morning"; in 12..16 -> "Good afternoon"; else -> "Good evening" }

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(span = { GridItemSpan(2) }) {
            Surface(shape = RoundedCornerShape(20.dp), color = Magenta) {
                Column(Modifier.fillMaxWidth().padding(20.dp)) {
                    Text("$greeting,", color = Color.White.copy(alpha = .8f))
                    Text(user.fullName, color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(10.dp))
                    Surface(shape = RoundedCornerShape(50), color = Gold) {
                        Text(
                            user.roleName, color = MagentaDeep, fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 5.dp),
                        )
                    }
                }
            }
        }
        if (hasParentPortal(user)) {
            item(span = { GridItemSpan(2) }) { ChildPicker() }
        }
        items(tiles) { f ->
            Card(
                modifier = Modifier.aspectRatio(1.1f).clickable { nav.go(f.route) },
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.SpaceBetween) {
                    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(52.dp)) {
                        Box(contentAlignment = Alignment.Center) { Icon(f.icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp)) }
                    }
                    Text(f.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        item(span = { GridItemSpan(2) }) {
            Text(
                "More options are in the ☰ menu", textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
        }
    }
}

/** Parent-only: choose which child the parent tiles show. */
@Composable
fun ChildPicker() {
    val parent = LocalNav.current.parent
    val state = rememberLoad(parent) { parent.load() }
    Loaded(state) { kids ->
        if (kids.size > 1) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                kids.forEachIndexed { i, c ->
                    FilterChip(
                        selected = parent.selected == i, onClick = { parent.selected = i },
                        label = { Text("${c.str("firstName") ?: c.str("fullName")} · ${c.str("grade").orEmpty()}") },
                    )
                }
            }
        } else if (kids.size == 1) {
            val c = kids[0]
            Text("${c.str("fullName")} · ${c.str("grade").orEmpty()}${c.str("section").orEmpty()}", fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun ProfileScreen() {
    val nav = LocalNav.current
    val me = rememberLoad { Api.get("/api/auth/me").obj() }
    Loaded(me) { u ->
        ScreenList {
            item {
                InfoCard(u.str("fullName") ?: nav.user.fullName, subtitle = nav.user.roleName) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOfNotNull(
                            "Email" to u.str("email"),
                            "Title" to u.str("title"),
                            "Campus" to u.str("campus_name"),
                            "Academic year" to u.str("academic_year"),
                            "Server" to Session.baseUrl,
                        ).filter { it.second != null }.forEach { (k, v) -> KeyValue(k, v!!) }
                    }
                }
            }
            if (nav.user.studentId != null) {
                item { SectionTitle("My school record") }
                item { StudentRecord(nav.user.studentId) }
            }
        }
    }
}

@Composable
private fun StudentRecord(studentId: String) {
    val s = rememberLoad(studentId) { Api.get("/api/students/$studentId").obj() }
    Loaded(s) { st ->
        InfoCard(st.str("fullName") ?: "", subtitle = listOfNotNull(st.str("grade"), st.str("section"), st.str("admissionNo")).joinToString(" · ")) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                KeyValue("House", st.str("house") ?: "—")
                KeyValue("Attendance", st.str("attendance")?.let { "$it%" } ?: "—")
                KeyValue("Average", st.str("average")?.let { "$it%" } ?: "—")
                KeyValue("Bus route", st.str("busRoute") ?: "—")
                KeyValue("Date of birth", prettyDate(st.str("dateOfBirth")))
            }
        }
    }
}

@Composable
fun KeyValue(key: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(key, Modifier.weight(0.42f), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        Text(value, Modifier.weight(0.58f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}
