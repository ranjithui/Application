package edu.holysai.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import edu.holysai.app.data.Api
import edu.holysai.app.data.User
import edu.holysai.app.ui.screens.*
import edu.holysai.app.ui.theme.Gold
import edu.holysai.app.ui.theme.MagentaDeep
import kotlinx.coroutines.launch

/** App-wide helpers every screen can reach: navigation, toasts and the signed-in user. */
class AppNav(
    val user: User,
    private val stack: MutableList<Route>,
    val snackbar: SnackbarHostState,
    val parent: ParentState,
) {
    fun go(route: Route) { stack.add(route) }
    fun back() { if (stack.size > 1) stack.removeAt(stack.lastIndex) }
    fun home() { while (stack.size > 1) stack.removeAt(stack.lastIndex) }
    suspend fun toast(msg: String) { snackbar.showSnackbar(msg) }
}

val LocalNav = staticCompositionLocalOf<AppNav> { error("No navigation") }

@Composable
fun AppRoot() {
    var booting by remember { mutableStateOf(true) }
    var user by remember { mutableStateOf<User?>(null) }

    LaunchedEffect(Unit) {
        Api.onSessionExpired = { user = null }
        user = Api.restore()
        booting = false
    }

    when {
        booting -> Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        user == null -> LoginScreen(onSignedIn = { user = it })
        else -> MainShell(user!!, onSignOut = { user = null })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(user: User, onSignOut: () -> Unit) {
    val stack = remember(user.id) { mutableStateListOf<Route>(Route.Home) }
    val snackbar = remember { SnackbarHostState() }
    val parent = remember(user.id) { ParentState() }
    val nav = remember(user.id) { AppNav(user, stack, snackbar, parent) }
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val route = stack.last()

    BackHandler(enabled = drawer.isOpen || stack.size > 1) {
        if (drawer.isOpen) scope.launch { drawer.close() } else nav.back()
    }

    CompositionLocalProvider(LocalNav provides nav) {
        ModalNavigationDrawer(
            drawerState = drawer,
            drawerContent = {
                ModalDrawerSheet {
                    Column(Modifier.verticalScroll(rememberScrollState())) {
                        Column(Modifier.fillMaxWidth().background(MagentaDeep).padding(20.dp, 28.dp, 20.dp, 20.dp)) {
                            Text(user.fullName, color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(user.roleName, color = Gold, style = MaterialTheme.typography.bodyMedium)
                        }
                        Spacer(Modifier.height(8.dp))
                        NavigationDrawerItem(
                            label = { Text("Home") }, selected = route == Route.Home,
                            icon = { Icon(Icons.Outlined.Home, null) },
                            onClick = { nav.home(); scope.launch { drawer.close() } },
                            modifier = Modifier.padding(horizontal = 12.dp),
                        )
                        menuGroups(user).forEach { group ->
                            HorizontalDivider(Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
                            Text(
                                group.title.uppercase(), style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 28.dp, vertical = 6.dp),
                            )
                            group.items.forEach { f ->
                                NavigationDrawerItem(
                                    label = { Text(f.label) }, selected = route == f.route,
                                    icon = { Icon(f.icon, null) },
                                    onClick = { nav.home(); if (f.route != Route.Home) nav.go(f.route); scope.launch { drawer.close() } },
                                    modifier = Modifier.padding(horizontal = 12.dp),
                                )
                            }
                        }
                        HorizontalDivider(Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
                        NavigationDrawerItem(
                            label = { Text("Sign out") }, selected = false,
                            icon = { Icon(Icons.AutoMirrored.Outlined.Logout, null) },
                            onClick = { scope.launch { drawer.close(); Api.logout(); onSignOut() } },
                            modifier = Modifier.padding(horizontal = 12.dp).padding(bottom = 16.dp),
                        )
                    }
                }
            },
        ) {
            Scaffold(
                snackbarHost = { SnackbarHost(snackbar) },
                topBar = {
                    TopAppBar(
                        title = { Text(if (route == Route.Home) "Holy Sai 360" else route.title, maxLines = 1) },
                        navigationIcon = {
                            if (route == Route.Home) IconButton(onClick = { scope.launch { drawer.open() } }) { Icon(Icons.Filled.Menu, "Menu") }
                            else IconButton(onClick = { nav.back() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = MagentaDeep, titleContentColor = Color.White,
                            navigationIconContentColor = Color.White, actionIconContentColor = Color.White,
                        ),
                    )
                },
                containerColor = MaterialTheme.colorScheme.background,
            ) { pad ->
                Box(Modifier.padding(pad).fillMaxSize()) { Screen(route) }
            }
        }
    }
}

@Composable
private fun Screen(route: Route) {
    when (route) {
        Route.Home -> HomeScreen()
        Route.MyAttendance -> MyAttendanceScreen()
        Route.Leave -> LeaveScreen()
        Route.Notifications -> NotificationsScreen()
        Route.Tasks -> TasksScreen()
        Route.Profile -> ProfileScreen()
        Route.MarkAttendance -> SectionsScreen()
        is Route.Register -> RegisterScreen(route.sectionId)
        Route.Homework -> HomeworkScreen()
        Route.NewHomework -> NewHomeworkScreen()
        Route.Marks -> AssessmentsScreen()
        is Route.MarksEntry -> MarksEntryScreen(route.assessmentId)
        Route.Signals -> SignalsScreen()
        is Route.Signal -> SignalScreen(route.id)
        Route.ChildTrack -> ChildTrackScreen()
        Route.ChildToday -> ChildTodayScreen()
        Route.ChildHomework -> ChildHomeworkScreen()
        Route.ChildFees -> ChildFeesScreen()
        Route.Circulars -> CircularsScreen()
        Route.GateLog -> GateLogScreen()
        Route.Boarding -> BoardingScreen()
        is Route.BoardingRoute -> BoardingRouteScreen(route.routeId)
        Route.Visitors -> VisitorsScreen()
        Route.Pulse -> PulseScreen()
        Route.LeaveApprovals -> LeaveApprovalsScreen()
        is Route.Generic -> GenericScreen(route)
    }
}
