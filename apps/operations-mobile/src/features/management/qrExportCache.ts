import * as FileSystem from "expo-file-system/legacy";

export const QR_EXPORT_RETENTION_MS = 5 * 60 * 1000;
const exportName = /^restaurant-qr-(\d{13})\.png$/;

/** Only this feature's timestamp-named PNGs may be removed; no directory/recursive deletion. */
export async function purgeStaleQrExports(now = Date.now()): Promise<void> {
  if (!FileSystem.cacheDirectory) return;
  const directory = FileSystem.cacheDirectory;
  const names = await FileSystem.readDirectoryAsync(directory);
  await Promise.all(names.map(async name => {
    const match = exportName.exec(name);
    if (match && now - Number(match[1]) >= QR_EXPORT_RETENTION_MS) {
      await FileSystem.deleteAsync(`${directory}${name}`, { idempotent: true });
    }
  }));
}

/** Android chooser completion can precede the recipient copying its URI. Retain successful exports briefly. */
export async function releaseQrExport(path: string, shared: boolean): Promise<void> {
  const directory = FileSystem.cacheDirectory;
  if (!directory || !path.startsWith(directory) || !exportName.test(path.slice(directory.length))) return;
  const remove = () => FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
  if (shared) setTimeout(() => { void remove(); }, QR_EXPORT_RETENTION_MS);
  else await remove();
}
