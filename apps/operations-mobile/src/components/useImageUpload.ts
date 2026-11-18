import { getOperationsApi } from "../api";
import { useOperationsAuth } from "../auth/AuthProvider";
import { FormValidationError } from "../hooks/mutation";
import { pickAndUploadImage } from "./imageUpload";

/** The picker can pause Android; never resume its write under another identity or role. */
export function useImageUpload() {
  const { state, verifyWorkspaceAccess, assertWorkspaceAccess } = useOperationsAuth();
  return async (upload: (api: ReturnType<typeof getOperationsApi>, form: FormData) => Promise<unknown>) => {
    if (state.status !== "ready") throw new FormValidationError("Verify your restaurant access before uploading an image.");
    const { userId, membership: { role } } = state;
    return pickAndUploadImage(form => upload(getOperationsApi({
      userId, assertCurrentAccess: () => assertWorkspaceAccess(userId, role),
    }), form), () => verifyWorkspaceAccess(userId, role));
  };
}
