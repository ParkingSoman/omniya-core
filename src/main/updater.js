export function shouldRunWindowsAutoUpdate({ platform, isPackaged, isAutomatedTest }) {
  return platform === 'win32' && isPackaged && !isAutomatedTest;
}

export async function startWindowsAutoUpdate({ checkIntervalMs = 4 * 60 * 60 * 1000 } = {}) {
  const mod = await import('electron-updater');
  const autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.on('error', (err) => console.error('[omniya:update]', err));

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => console.error('[omniya:update] check failed', err));
  };
  check();
  const timer = setInterval(check, checkIntervalMs);
  timer.unref?.();

  return autoUpdater;
}
