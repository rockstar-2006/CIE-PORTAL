const {
  app,
  BrowserWindow,
  Menu,
  globalShortcut,
  ipcMain,
  session,
  screen,
} = require("electron");
const path = require("path");
const isDev = !app.isPackaged;

let mainWindow;
let focusRecoveryInterval = null;

// ═══════════════════════════════════════════════════════════════
//  SINGLE INSTANCE LOCK — Only ONE instance of the app can run
// ═══════════════════════════════════════════════════════════════
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
app.on("second-instance", () => {
  if (mainWindow) {
    mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds; // Use bounds, NOT workAreaSize (which excludes the taskbar)

  mainWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    // 'screen-saver' is the HIGHEST always-on-top level —
    // sits above ALL other windows including Task Manager, notifications, overlays
    alwaysOnTop: true,
    skipTaskbar: true, // Hide from taskbar to prevent switching
    autoHideMenuBar: true, // Prevents top menu from showing
    frame: false, // No title bar, no close/min/max buttons
    resizable: false, // Can't resize
    movable: false, // Can't move the window
    minimizable: false, // Can't minimize
    maximizable: false, // Can't be toggled out of fullscreen
    closable: false, // Can't close via OS (only via app:quit IPC)
    backgroundColor: "#020617",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // Security restored (Fixes Monaco ENOENT)
      webSecurity: true,
      sandbox: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
    },
  });

  // Set always-on-top to 'screen-saver' level (highest priority on Windows)
  mainWindow.setAlwaysOnTop(true, "screen-saver");

  // ═══════════════════════════════════════════════
  //  HARDWARE-LEVEL SCREENSHOT BLOCKING
  // ═══════════════════════════════════════════════

  // Make the window content appear BLACK in ALL capture tools
  mainWindow.setContentProtection(true);

  // Remove the application menu entirely
  Menu.setApplicationMenu(null);

  // ═══════════════════════════════════════════════
  //  BLOCK CLIPBOARD PERMISSIONS (Session Level)
  // ═══════════════════════════════════════════════
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission === "clipboard-read" || permission === "clipboard-write") {
        // Deny clipboard access completely
        callback(false);
      } else {
        callback(true);
      }
    },
  );

  const url = isDev ? "http://localhost:3000" : "https://cieportal.vercel.app";
  mainWindow.loadURL(url);

  // Force true fullscreen over taskbar instantly right before showing
  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.setFullScreen(true);
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    clearInterval(focusRecoveryInterval);
  });

  // Handle Quit from Frontend (ONLY way to close)
  ipcMain.on("app:quit", () => {
    forceQuit();
  });

  // ═══════════════════════════════════════════════
  //  BLOCK ALL SCREENSHOT KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════════════
  globalShortcut.register("CommandOrControl+Shift+I", () => false);
  globalShortcut.register("CommandOrControl+Shift+J", () => false);

  globalShortcut.register("PrintScreen", () => {
    notifyScreenshotBlocked();
    return false;
  });
  globalShortcut.register("Alt+PrintScreen", () => {
    notifyScreenshotBlocked();
    return false;
  });
  globalShortcut.register("Super+Shift+S", () => {
    notifyScreenshotBlocked();
    return false;
  });
  globalShortcut.register("Super+PrintScreen", () => {
    notifyScreenshotBlocked();
    return false;
  });
  globalShortcut.register("CommandOrControl+PrintScreen", () => {
    notifyScreenshotBlocked();
    return false;
  });

  // ═══════════════════════════════════════════════
  //  BLOCK TASK SWITCHING / OVERLAYS / SPLIT SCREEN
  // ═══════════════════════════════════════════════

  // Block Alt+Tab (Task switcher)
  globalShortcut.register("Alt+Tab", () => {
    forceFocus();
    return false;
  });
  globalShortcut.register("Alt+Shift+Tab", () => {
    forceFocus();
    return false;
  });

  // Block Alt+F4 (Force close)
  globalShortcut.register("Alt+F4", () => {
    return false;
  });

  // Block Alt+Escape (Cycle windows)
  globalShortcut.register("Alt+Escape", () => {
    return false;
  });

  // Block Win key shortcuts (Start menu, Task View, Split Screen, etc.)
  globalShortcut.register("Super+Tab", () => false); // Task View
  globalShortcut.register("Super+D", () => false); // Show Desktop
  globalShortcut.register("Super+E", () => false); // File Explorer
  globalShortcut.register("Super+R", () => false); // Run dialog
  globalShortcut.register("Super+L", () => false); // Lock screen
  globalShortcut.register("Super+M", () => false); // Minimize all
  globalShortcut.register("Super+Shift+M", () => false); // Restore minimized
  globalShortcut.register("Super+Up", () => false); // Maximize
  globalShortcut.register("Super+Down", () => false); // Minimize/Restore
  globalShortcut.register("Super+Left", () => false); // Snap left (split screen)
  globalShortcut.register("Super+Right", () => false); // Snap right (split screen)

  // Block Game Bar / Recording
  globalShortcut.register("Super+G", () => false); // Game Bar
  globalShortcut.register("Super+Alt+R", () => false); // Game Bar recording

  // Block Virtual Desktops
  globalShortcut.register("Super+Control+D", () => false); // New virtual desktop
  globalShortcut.register("Super+Control+F4", () => false); // Close virtual desktop
  globalShortcut.register("Super+Control+Left", () => false); // Switch desktop left
  globalShortcut.register("Super+Control+Right", () => false); // Switch desktop right

  // Block Task Manager shortcut
  globalShortcut.register("Control+Shift+Escape", () => false);

  // Block Clipboard Shortcuts (Global Lockdown)
  globalShortcut.register("CommandOrControl+C", () => false);
  globalShortcut.register("CommandOrControl+V", () => false);
  globalShortcut.register("CommandOrControl+X", () => false);

  // Block Windows+V (Clipboard History) - Windows 10+ feature
  globalShortcut.register("Super+V", () => false);

  // Block Ctrl+Shift+V (Paste Special)
  globalShortcut.register("CommandOrControl+Shift+V", () => false);

  // Block Ctrl+Alt+Tab (Sticky task switcher)
  globalShortcut.register("Control+Alt+Tab", () => false);

  // Block Ctrl+Escape (Start menu)
  globalShortcut.register("Control+Escape", () => false);

  // Block the Windows Key alone
  globalShortcut.register("Super", () => false);

  // ═══════════════════════════════════════════════
  //  FOCUS RECOVERY — If app loses focus, GRAB IT BACK
  // ═══════════════════════════════════════════════
  mainWindow.on("blur", () => {
    // Immediately reclaim focus
    forceFocus();
  });

  // Aggressive focus recovery every 500ms
  focusRecoveryInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
      forceFocus();
    }
  }, 500);

  // ═══════════════════════════════════════════════
  //  BLOCK SCREEN CAPTURE API ACCESS
  // ═══════════════════════════════════════════════
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    callback({ video: null });
  });

  // Prevent the window from being minimized
  mainWindow.on("minimize", (e) => {
    e.preventDefault();
    mainWindow.restore();
    mainWindow.setFullScreen(true);
    mainWindow.setAlwaysOnTop(true, "screen-saver");
  });

  // If they somehow leave fullscreen, force it back
  mainWindow.on("leave-full-screen", () => {
    mainWindow.setFullScreen(true);
    mainWindow.setAlwaysOnTop(true, "screen-saver");
  });

  // If resized somehow, force back fullscreen
  mainWindow.on("resize", () => {
    if (!mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(true);
    }
  });

  // If moved somehow, force back to 0,0
  mainWindow.on("move", () => {
    mainWindow.setPosition(0, 0);
  });

  // ═══════════════════════════════════════════════
  //  BLOCK NAVIGATION AWAY FROM EXAM
  // ═══════════════════════════════════════════════
  mainWindow.webContents.on("will-navigate", (e, navUrl) => {
    const allowed = isDev
      ? "http://localhost:3000"
      : "https://cieportal.vercel.app";
    if (!navUrl.startsWith(allowed)) {
      e.preventDefault();
    }
  });

  // Block opening new windows/popups entirely
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  // Hard-disable DevTools in production
  if (!isDev) {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  // Block any child windows from being created
  mainWindow.webContents.on("new-window", (e) => {
    e.preventDefault();
  });
}

function forceFocus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.setFullScreen(true);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
  }
}

function forceQuit() {
  // Unregister all shortcuts before quitting
  globalShortcut.unregisterAll();
  clearInterval(focusRecoveryInterval);
  if (mainWindow) {
    mainWindow.closable = true;
    mainWindow.close();
  }
  app.quit();
}

function notifyScreenshotBlocked() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("screenshot-blocked");
  }
}

app.on("ready", () => {
  // Block loading of browser extensions
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      // Only allow essential permissions, must include clipboard to avoid Monaco errors
      const allowed = [
        "fullscreen",
        "pointerLock",
        "clipboard-read",
        "clipboard-sanitized-write",
      ];
      callback(allowed.includes(permission));
    },
  );

  // Disable all extensions
  session.defaultSession.setPermissionCheckHandler(() => false);

  createWindow();
});

// PREVENT the app from quitting via normal means
app.on("before-quit", (e) => {
  // Only allow quitting via our forceQuit function
  // The closable flag is set to true only in forceQuit()
  if (mainWindow && !mainWindow.closable) {
    e.preventDefault();
  }
});

app.on("window-all-closed", () => {
  clearInterval(focusRecoveryInterval);
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  clearInterval(focusRecoveryInterval);
});
