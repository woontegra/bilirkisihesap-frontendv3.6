import { CirclePlay } from "lucide-react";
import { useMemo, useState } from "react";
import { CalculationVideoModal } from "./CalculationVideoModal";
import { resolveCalculationVideo, type CalculationVideoLinkTable } from "./resolveCalculationVideo";
import styles from "./CalculationVideo.module.css";

type Props = {
  pathname: string;
  links?: CalculationVideoLinkTable;
  className?: string;
};

export function CalculationVideoButton({ pathname, links, className }: Props) {
  const video = useMemo(() => resolveCalculationVideo(pathname, links), [pathname, links]);
  const [openPageKey, setOpenPageKey] = useState<string | null>(null);

  if (!video) return null;
  const open = openPageKey === video.pageKey;

  return (
    <>
      <button
        type="button"
        className={className ? `${styles.button} ${className}` : styles.button}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`${video.title} — eğitim videosu`}
        data-calculation-video={video.pageKey}
        onClick={() => setOpenPageKey(video.pageKey)}
      >
        <CirclePlay size={16} aria-hidden />
        <span className={styles.buttonLabel}>Videoyu İzle</span>
      </button>
      {open ? (
        <CalculationVideoModal
          title={video.title}
          embedUrl={video.embedUrl}
          onClose={() => setOpenPageKey(null)}
        />
      ) : null}
    </>
  );
}
