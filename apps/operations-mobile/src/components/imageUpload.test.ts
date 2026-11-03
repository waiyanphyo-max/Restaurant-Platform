import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormValidationError } from "../hooks/mutation";

const picker = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: picker.launch }));

import { pickAndUploadImage, validatePickedImage } from "./imageUpload";

class NativeFormData {
  readonly parts: { name: string; value: unknown }[] = [];
  append(name: string, value: unknown) { this.parts.push({ name, value }); }
}
const asset = { uri: "file:///storage/private/menu.png", mimeType: "image/png", fileSize: 1024 };

describe("native image upload", () => {
  beforeEach(() => {
    picker.launch.mockReset();
    vi.stubGlobal("FormData", NativeFormData);
  });
  it("leaves the server untouched when image selection is canceled", async () => {
    picker.launch.mockResolvedValue({ canceled: true, assets: null });
    const upload = vi.fn();
    await expect(pickAndUploadImage(upload)).resolves.toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(picker.launch).toHaveBeenCalledWith({ mediaTypes: ["images"], allowsMultipleSelection: false, quality: 1, exif: false });
  });
  it.each(["image/gif", "image/svg+xml", "text/plain", null, undefined])("rejects unsupported MIME %s before upload", async mimeType => {
    picker.launch.mockResolvedValue({ canceled: false, assets: [{ ...asset, mimeType }] });
    const upload = vi.fn();
    await expect(pickAndUploadImage(upload)).rejects.toThrow(FormValidationError);
    expect(upload).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity, -Infinity, 5 * 1024 * 1024 + 1])("rejects invalid or oversized file size %s", fileSize => {
    expect(() => validatePickedImage({ ...asset, fileSize })).toThrow(FormValidationError);
  });
  it.each([null, undefined, []])("rejects empty non-canceled picker assets %s without uploading", async assets => {
    picker.launch.mockResolvedValue({ canceled: false, assets });
    const upload = vi.fn();
    await expect(pickAndUploadImage(upload)).rejects.toThrow("No image was selected");
    expect(upload).not.toHaveBeenCalled();
  });
  it("reports picker failures without exposing native exception details", async () => {
    picker.launch.mockRejectedValue(new Error("private filesystem path or native stack"));
    const upload = vi.fn();
    await expect(pickAndUploadImage(upload)).rejects.toThrow("The image picker could not open");
    expect(upload).not.toHaveBeenCalled();
  });
  it.each(["https://media.example.com/menu.png", "http://localhost/image.png", "data:image/png;base64,secret", "/local/file.png", "javascript:alert(1)"])("rejects non-device URI %s", uri => {
    expect(() => validatePickedImage({ ...asset, uri })).toThrow("stored on this device");
  });
  it("accepts the 5 MB boundary, Android content URIs and unknown provider file size", () => {
    expect(() => validatePickedImage({ ...asset, fileSize: 5 * 1024 * 1024 })).not.toThrow();
    expect(() => validatePickedImage({ ...asset, uri: "content://media/external/images/media/5", fileSize: undefined })).not.toThrow();
  });
  it("propagates upload failure without pretending the image was saved or retrying a write", async () => {
    picker.launch.mockResolvedValue({ canceled: false, assets: [asset] });
    const failure = new Error("Native network upload failed");
    const upload = vi.fn().mockRejectedValue(failure);
    await expect(pickAndUploadImage(upload)).rejects.toBe(failure);
    expect(upload).toHaveBeenCalledTimes(1);
    const form = upload.mock.calls[0][0] as NativeFormData;
    expect(form.parts).toEqual([{ name: "file", value: { uri: asset.uri, name: "image.png", type: "image/png" } }]);
  });
  it.each([ ["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"] ])("uploads %s through native FormData", async (mimeType, extension) => {
    picker.launch.mockResolvedValue({ canceled: false, assets: [{ ...asset, mimeType }] });
    const upload = vi.fn().mockResolvedValue({ imageUrl: "https://media.example.com/new-image" });
    await expect(pickAndUploadImage(upload)).resolves.toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    const form = upload.mock.calls[0][0] as NativeFormData;
    expect(form.parts).toEqual([{ name: "file", value: { uri: asset.uri, name: `image.${extension}`, type: mimeType } }]);
  });
});
