
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { FormValidationError } from "../hooks/mutation";

export type PickedImage = ImagePicker.ImagePickerAsset;

export function validatePickedImage(asset: {
  uri: string;
  mimeType?: string | null;
  fileSize?: number;
}) {
  if (!asset || typeof asset.uri !== "string") {
    throw new FormValidationError(
      "No image was selected. Choose a photo and try again."
    );
  }

  if (!["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType ?? "")) {
    throw new FormValidationError(
      "Choose a PNG, JPEG or WebP image."
    );
  }

  if (!/^(file|content):\/\//.test(asset.uri)) {
    throw new FormValidationError(
      "Choose an image stored on this device."
    );
  }

  if (
    asset.fileSize !== undefined &&
    (!Number.isFinite(asset.fileSize) ||
      asset.fileSize <= 0 ||
      asset.fileSize > 5 * 1024 * 1024)
  ) {
    throw new FormValidationError(
      "Images must be no larger than 5 MB."
    );
  }
}

/**
 * Picks and validates an image, verifies workspace access,
 * and uploads it through the authenticated backend API.
 * Storage credentials are never exposed to the mobile app.
 */
export async function pickImage(): Promise<PickedImage | null> {
  let result: ImagePicker.ImagePickerResult;

  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 1,
      exif: false,
    });
  } catch {
    throw new FormValidationError(
      "The image picker could not open. Try again or check photo permissions in Android settings."
    );
  }

  if (result.canceled) return null;

  if (!Array.isArray(result.assets) || !result.assets.length) {
    throw new FormValidationError(
      "No image was selected. Choose a photo and try again."
    );
  }

  const asset = result.assets[0];

  // Validate the selected image once.
  validatePickedImage(asset);
  return asset;
}

export async function pickAndUploadImage(
  upload: (form: FormData) => Promise<unknown>,
  beforeUpload?: () => Promise<void>,
  selected?: PickedImage
): Promise<boolean> {
  const asset = selected ?? await pickImage();
  if (!asset) return false;
  validatePickedImage(asset);

  // Reverify restaurant access before uploading.
  await beforeUpload?.();

  const type = asset.mimeType!;
  const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1];
  const fileName = `image.${extension}`;

  // Expo File supports native multipart uploads.
  const file = new File(asset.uri);

  const form = new FormData();
  form.append("file", file, fileName);

  // Upload through the Spring Boot API.
  await upload(form);

  return true;
}
