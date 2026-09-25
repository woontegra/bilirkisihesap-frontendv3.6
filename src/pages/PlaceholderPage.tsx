import { Construction } from "lucide-react";
import { StatePanel } from "@/components/ui/StatePanel";
import styles from "./PlaceholderPage.module.css";

type Props = {
  title?: string;
};

export default function PlaceholderPage({ title = "Bu modül" }: Props) {
  return (
    <div className={`anim-fade-up ${styles.wrap}`}>
      <StatePanel
        icon={Construction}
        title={`${title} henüz hazır değil`}
        description="Bu aşamada yalnızca uygulama iskeleti ve Yönetim Paneli tamamlandı. Hesaplama sayfaları sonraki sprintte eklenecek."
      />
    </div>
  );
}
