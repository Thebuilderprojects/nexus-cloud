const { app, BrowserWindow, desktopCapturer, session } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1050,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        autoHideMenuBar: true,
        title: "Nexus Remote Workspace",
        resizable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        }
    });

    // Auto-approve screen capture without a picker dialog
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
            if (sources[0]) {
                callback({ video: sources[0], audio: 'loopback' });
            }
        });
    });

    mainWindow.loadFile('index.html');

    // ✅ Remove openDevTools() in production — comment it back in only for debugging
    mainWindow.webContents.openDevTools();

    mainWindow.on('closed', function () {
        mainWindow = null;
        if (process.platform !== 'darwin') app.quit();
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
