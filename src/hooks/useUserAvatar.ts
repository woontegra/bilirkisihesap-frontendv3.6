import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { fetchAuthMe } from "@/api/profile";
import { patchCurrentUserProfile, readCurrentUser } from "@/auth/session";
import {
  getStoredAvatarBase64,
  isPlaceholderAvatarDimensions,
  profilePictureFromApiUser,
  resolveProfilePictureUrl,
} from "@/utils/profilePicture";

function readUserId(): number | undefined {
  const user = readCurrentUser();
  if (user?.id) return user.id;
  return undefined;
}

function readStoredPicture() {
  try {
    const raw = JSON.parse(localStorage.getItem("current_user") || "null") as Record<string, unknown> | null;
    return profilePictureFromApiUser(raw ?? undefined);
  } catch {
    return {};
  }
}

function resolveAvatarFromSession(): string | null {
  const id = readUserId();
  const pic = readStoredPicture();
  return resolveProfilePictureUrl(id, pic.profilePicture, pic.profilePictureUrl);
}

export function useUserAvatar() {
  const [userId, setUserId] = useState(readUserId);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(resolveAvatarFromSession);

  const syncFromStorage = useCallback(() => {
    setUserId(readUserId());
    setAvatarUrl(resolveAvatarFromSession());
  }, []);

  useEffect(() => {
    syncFromStorage();
    const onAuthChanged = () => syncFromStorage();
    window.addEventListener("auth-changed", onAuthChanged);
    return () => window.removeEventListener("auth-changed", onAuthChanged);
  }, [syncFromStorage]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const me = await fetchAuthMe();
        if (!active) return;

        const id = typeof me.id === "number" ? me.id : readUserId();
        const picture = profilePictureFromApiUser(me);

        patchCurrentUserProfile({
          ...(typeof me.id === "number" ? { id: me.id } : {}),
          ...picture,
        });

        if (id) setUserId(id);
        setAvatarUrl(resolveProfilePictureUrl(id, picture.profilePicture, picture.profilePictureUrl));
      } catch {
        /* oturumdaki veri yeterli */
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const setAvatar = useCallback((url: string | null) => {
    setAvatarUrl(url);
  }, []);

  const handleAvatarError = useCallback(() => {
    const base64 = getStoredAvatarBase64(readUserId());
    if (base64) {
      setAvatarUrl(base64);
      return;
    }
    setAvatarUrl(null);
  }, []);

  const handleAvatarLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      if (isPlaceholderAvatarDimensions(img.naturalWidth, img.naturalHeight)) {
        handleAvatarError();
      }
    },
    [handleAvatarError],
  );

  return {
    userId,
    avatarUrl,
    setAvatar,
    handleAvatarError,
    handleAvatarLoad,
    syncFromStorage,
  };
}
