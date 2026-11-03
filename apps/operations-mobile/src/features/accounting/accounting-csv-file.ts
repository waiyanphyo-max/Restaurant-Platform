import { Platform } from "react-native";
import { FormValidationError } from "../../hooks/mutation";

export const accountingReportNames = {
  "sales-ledger": "Sales history",
  "purchase-history": "Purchase history",
  "financial-summary": "Financial summary"
} as const;
export type AccountingCsvReport = keyof typeof accountingReportNames;
const retentionMs = 5 * 60 * 1000;
const privateExportName = /^accounting-(?:sales-ledger|purchase-history|financial-summary)-(\d{13})-[a-z0-9]+\.csv$/;
const legacyExportName = /^(?:sales-ledger|purchase-history)-(\d{13})\.csv$/;
/** The cache URI is available only after the user's explicit share action. */
export async function shareAccountingCsv(report: AccountingCsvReport, content: string, isCurrent: () => boolean): Promise<boolean> {
  if (!isCurrent()) return false;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report}.csv`;
      link.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }
    return true;
  }

  const [fs, sharing] = await Promise.all([import("expo-file-system/legacy"), import("expo-sharing")]);
  const directory = fs.cacheDirectory;
  if (!directory || !await sharing.isAvailableAsync()) throw new FormValidationError("File sharing is unavailable on this device.");
  if (!isCurrent()) return false;
  const now = Date.now();
  const names = await fs.readDirectoryAsync(directory);
  await Promise.all(names.map(async name => {
    const match = privateExportName.exec(name) ?? legacyExportName.exec(name);
    if (match && now - Number(match[1]) >= retentionMs) {
      await fs.deleteAsync(`${directory}${name}`, { idempotent: true }).catch(() => undefined);
    }
  }));
  if (!isCurrent()) return false;

  const path = `${directory}accounting-${report}-${now}-${Math.random().toString(36).slice(2) || "0"}.csv`;
  const remove = () => fs.deleteAsync(path, { idempotent: true }).catch(() => undefined);
  let opened = false;
  try {
    await fs.writeAsStringAsync(path, content, { encoding: fs.EncodingType.UTF8 });
    if (!isCurrent()) return false;
    await sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: `Share ${accountingReportNames[report].toLowerCase()}`, UTI: "public.comma-separated-values-text" });
    opened = true;
    return true;
  } finally {
    // The Android chooser may resolve before the recipient copies the file.
    if (opened) setTimeout(() => { void remove(); }, retentionMs);
    else await remove();
  }
}
