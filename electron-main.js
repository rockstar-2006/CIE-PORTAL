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
const { exec, execSync } = require("child_process");
const fs = require("fs");
const os = require("os");

// ═══════════════════════════════════════════════════════════════
//  WINDOWS TASKBAR SUPPRESSION (NUCLEAR OPTION)
// ═══════════════════════════════════════════════════════════════
function setTaskbarVisibility(visible) {
  if (process.platform !== "win32") return;
  const showCmd = visible ? 5 : 0; 
  // Simplified PowerShell command with better escaping
  const psCommand = `powershell -command "$t='[DllImport(\\"user32.dll\\")]public static extern int ShowWindow(int h,int n);[DllImport(\\"user32.dll\\")]public static extern int FindWindow(string c,string n);';$type=Add-Type -MemberDefinition $t -Name 'W' -Namespace 'N' -PassThru;$type::ShowWindow($type::FindWindow('Shell_TrayWnd',$null),${showCmd});$type::ShowWindow($type::FindWindow('Button',$null),${showCmd});$type::ShowWindow($type::FindWindow('Shell_SecondaryTrayWnd',$null),${showCmd});$type::ShowWindow($type::FindWindow('TrayNotifyWnd',$null),${showCmd});"`;
  
  exec(psCommand, (err) => {
    if (err) console.error("Taskbar Toggle Error:", err);
  });
}

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
    width,
    height,
    x: 0,
    y: 0,
    show: false, // Start hidden to prevent flicker
    kiosk: true, // Force Kiosk Mode immediately
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    backgroundColor: "#020617",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: true,
      sandbox: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
      devTools: false, // Strictly disable DevTools
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

  const url = isDev ? "http://localhost:3000" : "https://fluttercie.vercel.app";
  
  mainWindow.loadURL(url).catch(err => {
    console.error("Failed to load URL:", err);
    // If it fails to load localhost in dev, it's likely the dev server isn't running
    if (isDev) {
      mainWindow.loadFile(path.join(__dirname, "public", "error.html")).catch(() => {
        // Fallback if error.html doesn't exist
        mainWindow.loadURL(`data:text/html,<html><body style="background:#020617;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><div><h1>Connection Failed</h1><p>Ensure your dev server is running at <b>http://localhost:3000</b></p><p>Error: ${err.message}</p></div></body></html>`);
      });
    }
  });

  // Force true fullscreen over taskbar instantly right before showing
  mainWindow.once("ready-to-show", () => {
    setTaskbarVisibility(false); // 🚨 HIDE SYSTEM TASKBAR (ALL TRAYS)
    mainWindow.setKiosk(true); 
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    clearInterval(focusRecoveryInterval);
  });

  // Handle Quit from Frontend (ONLY way to close)
  ipcMain.on("app:quit", () => {
    setTaskbarVisibility(true); // 🚨 RESTORE TASKBAR BEFORE QUIT
    forceQuit();
  });

  // ═══════════════════════════════════════════════
  //  FREE LOCAL EXECUTION ENGINE (C, C++, JAVA)
  // ═══════════════════════════════════════════════
  ipcMain.handle("code:compile", async (event, { source, language }) => {
    const scratchDir = path.join(os.tmpdir(), "cie-local-run");
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    try {
      let fileName = "";
      let compileCmd = "";
      let runCmd = "";

      if (language === "c") {
        fileName = "solution.c";
        const exeName = "solution.exe";
        fs.writeFileSync(path.join(scratchDir, fileName), source);
        compileCmd = `gcc "${fileName}" -o "${exeName}"`;
        runCmd = `"${path.join(scratchDir, exeName)}"`;
      } else if (language === "cpp") {
        fileName = "solution.cpp";
        const exeName = "solution.exe";
        fs.writeFileSync(path.join(scratchDir, fileName), source);
        compileCmd = `g++ "${fileName}" -o "${exeName}"`;
        runCmd = `"${path.join(scratchDir, exeName)}"`;
      } else if (language === "java") {
        // Find public class name or default to Main
        const classMatch = source.match(/public\s+class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : "Main";
        fileName = `${className}.java`;
        fs.writeFileSync(path.join(scratchDir, fileName), source);
        compileCmd = `javac "${fileName}"`;
        runCmd = `java "${className}"`;
      } else {
        return { output: "Error: Unsupported local language." };
      }

      // 1. Compile
      try {
        const { stderr: compileError } = await new Promise((resolve, reject) => {
          exec(compileCmd, { cwd: scratchDir }, (error, stdout, stderr) => {
            if (error) reject({ stderr });
            else resolve({ stderr });
          });
        });
        if (compileError) {
           // GCC/Javac warnings might be in stderr even if it succeeds
           // But usually if error is null, it's fine.
        }
      } catch (err) {
        return { output: `BUILD ERROR:\n${err.stderr}` };
      }

      // 2. Run
      const { stdout, stderr } = await new Promise((resolve) => {
        exec(runCmd, { cwd: scratchDir, timeout: 5000 }, (error, stdout, stderr) => {
          resolve({ stdout, stderr: stderr || (error ? error.message : "") });
        });
      });

      return { output: stdout + (stderr ? `\n\nERRORS/STDERR:\n${stderr}` : "") };

    } catch (err) {
      return { output: `SYSTEM ERROR: ${err.message}` };
    }
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
  globalShortcut.register("Meta+Shift+S", () => {
    notifyScreenshotBlocked();
    return false;
  });
  globalShortcut.register("Meta+PrintScreen", () => {
    notifyScreenshotBlocked();
    return false;
  });
  globalShortcut.register("CommandOrControl+PrintScreen", () => {
    notifyScreenshotBlocked();
    return false;
  });

  // 🚨 ADDITIONAL SCREEN RECORDING BLOCKS (Game Bar, etc.)
  globalShortcut.register("Meta+G", () => false);
  globalShortcut.register("Meta+Alt+G", () => false);
  globalShortcut.register("Meta+Alt+R", () => false);
  globalShortcut.register("Meta+Alt+B", () => false);
  globalShortcut.register("Meta+Alt+M", () => false);
  
  // Block common 3rd party screenshot keys (Lightshot, etc.)
  globalShortcut.register("Shift+PrintScreen", () => false);
  globalShortcut.register("Control+PrintScreen", () => false);

  // ═══════════════════════════════════════════════
  //  BLOCK RELOAD / DEVTOOLS / SYSTEM SHORTCUTS
  // ═══════════════════════════════════════════════

  // Block Refresh (Crucial: prevents strike count reset)
  globalShortcut.register("CommandOrControl+R", () => false);
  globalShortcut.register("F5", () => false);
  globalShortcut.register("CommandOrControl+Shift+R", () => false);

  // Block DevTools (Alternative to F12)
  globalShortcut.register("F12", () => false);

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
  globalShortcut.register("Meta+Tab", () => false); // Task View
  globalShortcut.register("Meta+D", () => false); // Show Desktop
  globalShortcut.register("Meta+E", () => false); // File Explorer
  globalShortcut.register("Meta+R", () => false); // Run dialog
  globalShortcut.register("Meta+L", () => false); // Lock screen
  globalShortcut.register("Meta+M", () => false); // Minimize all
  globalShortcut.register("Meta+Shift+M", () => false); // Restore minimized
  globalShortcut.register("Meta+Up", () => false); // Maximize
  globalShortcut.register("Meta+Down", () => false); // Minimize/Restore
  globalShortcut.register("Meta+Left", () => false); // Snap left (split screen)
  globalShortcut.register("Meta+Right", () => false); // Snap right (split screen)

  // Block Game Bar / Recording
  globalShortcut.register("Meta+G", () => false); // Game Bar
  globalShortcut.register("Meta+Alt+R", () => false); // Game Bar recording

  // Block Virtual Desktops
  globalShortcut.register("Meta+Control+D", () => false); // New virtual desktop
  globalShortcut.register("Meta+Control+F4", () => false); // Close virtual desktop
  globalShortcut.register("Meta+Control+Left", () => false); // Switch desktop left
  globalShortcut.register("Meta+Control+Right", () => false); // Switch desktop right

  // Block Task Manager shortcut
  globalShortcut.register("Control+Shift+Escape", () => false);

  // 🚨 EMERGENCY EXIT (Development Only)
  // Allows the developer to exit kiosk mode if the app hangs
  if (isDev) {
    globalShortcut.register("CommandOrControl+Alt+Shift+Q", () => {
      forceQuit();
    });
  }

  // Block Clipboard Shortcuts (Global Lockdown)
  globalShortcut.register("CommandOrControl+C", () => false);
  globalShortcut.register("CommandOrControl+V", () => false);
  globalShortcut.register("CommandOrControl+X", () => false);

  // Block Windows+V (Clipboard History) - Windows 10+ feature
  globalShortcut.register("Meta+V", () => false);

  // Block Ctrl+Shift+V (Paste Special)
  globalShortcut.register("CommandOrControl+Shift+V", () => false);

  // Block Ctrl+Alt+Tab (Sticky task switcher)
  globalShortcut.register("Control+Alt+Tab", () => false);

  // Block Ctrl+Escape (Start menu)
  globalShortcut.register("Control+Escape", () => false);

  // Block Alt+Space (System window menu)
  globalShortcut.register("Alt+Space", () => false);

    // Windows key alone (Super) is difficult to block via globalShortcut without crashing on some systems.
    // Instead, we rely on the aggressive Focus Recovery loop and Kiosk mode to keep the app on top.

    // Block Windows + any number (Taskbar pinning)
    for (let i = 0; i <= 9; i++) {
      globalShortcut.register(`Meta+${i}`, () => false);
    }

    // Block common screenshot/recording keys for 3rd party apps (like Nvidia, Steam)
    globalShortcut.register("Alt+F10", () => false);
    globalShortcut.register("Alt+F1", () => false);
    globalShortcut.register("Alt+Z", () => false);
    globalShortcut.register("Control+Alt+S", () => false);


  // ═══════════════════════════════════════════════
  //  FOCUS RECOVERY — If app loses focus, GRAB IT BACK
  // ═══════════════════════════════════════════════
  mainWindow.on("blur", () => {
    // 🚨 SAFETY BLACKOUT: If focus is lost, make window invisible 
    // to prevent any recording software from capturing it while it's in the background
    mainWindow.setOpacity(0);
    forceFocus();
  });

  mainWindow.on("focus", () => {
    mainWindow.setOpacity(1); // Restore visibility when focused
  });

  // Aggressive focus recovery every 500ms
  focusRecoveryInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
      mainWindow.setOpacity(0); // Hide if not focused
      forceFocus();
    }
  }, 500);

  // ═══════════════════════════════════════════════
  //  HARDWARE-LEVEL SECURITY: MULTIPLE DISPLAYS
  // ═══════════════════════════════════════════════
  const checkDisplays = () => {
    const displays = screen.getAllDisplays();
    if (displays.length > 1) {
      mainWindow.webContents.send("security-violation", "Secondary Display Detected (HDMI Capture Blocked)");
      // We can also just hide the content
      mainWindow.setOpacity(0); 
    } else {
      mainWindow.setOpacity(1);
    }
  };

  screen.on('display-added', checkDisplays);
  screen.on('display-removed', checkDisplays);
  setInterval(checkDisplays, 3000); // Periodic check

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
      : "https://fluttercie.vercel.app";
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

app.on("before-quit", () => {
  setTaskbarVisibility(true);
});

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
