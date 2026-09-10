import { join } from "node:path";
import { app, nativeImage } from "electron";

/**
 * Force the Dock to read the channel-specific icon from the newly installed
 * bundle. macOS can retain the previous icon when an updater replaces an app
 * in place under the same bundle identifier.
 *
 * Dev builds launch the stock Electron binary (its default Dock icon), so the
 * same padded PNG is loaded straight from the repo instead of resources.
 */
export function refreshMacDockIcon(
  platform: NodeJS.Platform = process.platform,
  resourcesPath: string = process.resourcesPath,
  appPath: string = app.getAppPath(),
): void {
  if (platform !== "darwin") return;

  try {
    const icon = nativeImage.createFromPath(
      app.isPackaged ? join(resourcesPath, "app-icon.png") : join(appPath, "build", "icon-mac.png"),
    );
    if (!icon.isEmpty()) app.dock?.setIcon(icon);
  } catch (error) {
    // Icon refresh is cosmetic and must never prevent startup after an update.
    console.warn("[poracode] failed to refresh macOS Dock icon", error);
  }
}
