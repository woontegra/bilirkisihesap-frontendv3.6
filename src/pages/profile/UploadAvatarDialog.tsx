import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { deleteUserAvatar, uploadUserAvatar } from "@/api/avatar";
import { patchCurrentUserProfile } from "@/auth/session";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import styles from "./UploadAvatarDialog.module.css";

type Props = {
  open: boolean;
  userId?: number;
  userName: string;
  currentAvatarUrl?: string | null;
  onOpenChange: (open: boolean) => void;
  onAvatarChange: (url: string | null) => void;
};

export default function UploadAvatarDialog({
  open,
  userId,
  userName,
  currentAvatarUrl,
  onOpenChange,
  onAvatarChange,
}: Props) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl ?? null);
  const [uploading, setUploading] = useState(false);

  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    if (open && !selectedFile) {
      setPreviewUrl(currentAvatarUrl ?? null);
    }
  }, [open, currentAvatarUrl, selectedFile]);

  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setPreviewUrl(currentAvatarUrl ?? null);
    }
  }, [open, currentAvatarUrl]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir resim dosyası seçin");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Dosya boyutu 5MB'dan küçük olmalıdır");
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setPreviewUrl(base64);
      if (userId && base64.startsWith("data:image/")) {
        try {
          localStorage.setItem(`avatar_base64_${userId}`, base64);
        } catch {
          /* ignore */
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const result = await uploadUserAvatar(selectedFile);
      const cacheBusted = `${result.profilePictureUrl}?t=${Date.now()}`;

      if (userId) {
        const base64 = localStorage.getItem(`avatar_base64_${userId}`);
        patchCurrentUserProfile({
          profilePicture: result.profilePicture,
          profilePictureUrl: result.profilePictureUrl,
        });
        onAvatarChange(base64?.startsWith("data:image/") ? base64 : cacheBusted);
      } else {
        patchCurrentUserProfile({
          profilePicture: result.profilePicture,
          profilePictureUrl: result.profilePictureUrl,
        });
        onAvatarChange(cacheBusted);
      }

      toast.success("Profil resmi başarıyla güncellendi");
      setSelectedFile(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resim yüklenirken bir hata oluştu");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      await deleteUserAvatar();
      if (userId) {
        localStorage.removeItem(`avatar_base64_${userId}`);
      }
      patchCurrentUserProfile({
        profilePicture: null,
        profilePictureUrl: null,
      });
      setSelectedFile(null);
      setPreviewUrl(null);
      onAvatarChange(null);
      toast.success("Profil resmi kaldırıldı");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Profil resmi kaldırılırken bir hata oluştu");
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={() => onOpenChange(false)}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-avatar-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="upload-avatar-title" className={styles.title}>
          Profil Resmi Yükle
        </h2>
        <p className={styles.desc}>
          Profil resminizi yükleyin veya güncelleyin. Maksimum dosya boyutu 5MB.
        </p>

        <div className={styles.previewWrap}>
          <div className={styles.preview}>
            {previewUrl ? (
              <img src={previewUrl} alt="" className={styles.previewImg} />
            ) : (
              <span className={styles.previewFallback}>{initials}</span>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileSelect}
        />
        <Button
          type="button"
          variant="soft"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          style={{ width: "100%", marginTop: "0.5rem" }}
        >
          <Upload size={16} aria-hidden />
          {selectedFile ? "Resmi Değiştir" : "Resim Seç"}
        </Button>
        {selectedFile ? <p className={styles.fileName}>Seçili: {selectedFile.name}</p> : null}

        <div className={styles.actions}>
          {currentAvatarUrl ? (
            <Button type="button" variant="danger" disabled={uploading} onClick={() => void handleRemove()}>
              <X size={16} aria-hidden />
              Resmi Kaldır
            </Button>
          ) : null}
          <div className={styles.actionsMain}>
            <Button type="button" variant="soft" disabled={uploading} onClick={() => onOpenChange(false)}>
              İptal
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!selectedFile || uploading}
              onClick={() => void handleUpload()}
            >
              {uploading ? "Yükleniyor…" : "Yükle"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
