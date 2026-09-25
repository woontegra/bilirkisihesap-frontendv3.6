import { API_BASE_URL, apiClient } from "@/api/client";

export type AvatarUploadResult = {
  profilePicture: string;
  profilePictureUrl: string;
};

function unwrapAvatarPayload(payload: unknown): AvatarUploadResult {
  const root = payload as {
    data?: {
      profilePicture?: string;
      profilePictureUrl?: string;
      user?: { profilePicture?: string; profilePictureUrl?: string };
    };
  };
  const data = root.data ?? {};
  const user = data.user ?? data;
  const profilePicture = user.profilePicture ?? "";
  const profilePictureUrl =
    user.profilePictureUrl ??
    (profilePicture
      ? `${API_BASE_URL.replace(/\/$/, "")}${profilePicture.startsWith("/") ? profilePicture : `/${profilePicture}`}`
      : "");
  if (!profilePicture) {
    throw new Error("Profil resmi yüklenemedi.");
  }
  return { profilePicture, profilePictureUrl };
}

export async function uploadUserAvatar(file: File): Promise<AvatarUploadResult> {
  const formData = new FormData();
  formData.append("avatar", file);
  const data = await apiClient<unknown>("/api/user/upload-avatar", {
    method: "POST",
    body: formData,
  });
  return unwrapAvatarPayload(data);
}

export async function deleteUserAvatar(): Promise<void> {
  await apiClient("/api/user/delete-avatar", { method: "DELETE" });
}
