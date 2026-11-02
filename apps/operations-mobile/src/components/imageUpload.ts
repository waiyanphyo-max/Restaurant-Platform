import * as ImagePicker from "expo-image-picker";
import { FormValidationError } from "../hooks/mutation";

export function validatePickedImage(asset: { uri: string; mimeType?: string | null; fileSize?: number }) {
  if (!asset || typeof asset.uri !== "string") throw new FormValidationError("No image was selected. Choose a photo and try again.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType ?? "")) throw new FormValidationError("Choose a PNG, JPEG or WebP image.");
  if (!/^(file|content):\/\//.test(asset.uri)) throw new FormValidationError("Choose an image stored on this device.");
  if (asset.fileSize !== undefined && (!Number.isFinite(asset.fileSize) || asset.fileSize <= 0 || asset.fileSize > 5 * 1024 * 1024)) throw new FormValidationError("Images must be no larger than 5 MB.");
}
/** Android file objects are encoded by native FormData; no public Storage write credentials. */
export async function pickAndUploadImage(upload: (form: FormData) => Promise<unknown>): Promise<boolean> {
  let result: ImagePicker.ImagePickerResult;
  try { result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: false, quality: 1, exif: false }); }
  catch { throw new FormValidationError("The image picker could not open. Try again or check photo permissions in Android settings."); }
  if (result.canceled) return false;
  if (!Array.isArray(result.assets) || !result.assets.length) throw new FormValidationError("No image was selected. Choose a photo and try again.");
  const asset = result.assets[0];
  validatePickedImage(asset);
  const form = new FormData();
  const type = asset.mimeType!;
  form.append("file", { uri: asset.uri, name: `image.${type === "image/jpeg" ? "jpg" : type.split("/")[1]}`, type } as unknown as Blob);
  await upload(form);
  return true;
}
