/**
 * 12 aylık eklenti penceresi taslağı. Pencere, kalemin uygulanmış dökümünden (yoksa boş aylar ve
 * formun gün esasıyla) açılır; ay ve gün esası değişiklikleri yalnızca taslakta kalır.
 * Uygula sayfada forma yazılır; İptal/kapatma taslağı atar ve uygulanmış verilere dokunmaz.
 */

import { useCallback, useState } from "react";
import { bosEklentiAylari, type EklentiDokumleri } from "./eklentiDokumu";
import type { EklentiGunEsasi } from "./eklentiGunEsasi";

export type EklentiTaslagi<T> = {
  target: T;
  key: string;
  aylar: string[];
  gunEsasi: EklentiGunEsasi;
};

export function useEklentiPenceresi<T>(opts: {
  dokumler: EklentiDokumleri | undefined;
  varsayilanGunEsasi: EklentiGunEsasi;
  hesapla: (aylar: string[], gunEsasi: EklentiGunEsasi) => number;
}) {
  const { dokumler, varsayilanGunEsasi, hesapla } = opts;
  const [taslak, setTaslak] = useState<EklentiTaslagi<T> | null>(null);

  const ac = useCallback(
    (target: T, key: string) => {
      const dokum = dokumler?.[key];
      setTaslak({
        target,
        key,
        aylar: dokum ? [...dokum.aylar] : bosEklentiAylari(),
        gunEsasi: dokum?.gunEsasi ?? varsayilanGunEsasi,
      });
    },
    [dokumler, varsayilanGunEsasi],
  );

  const ayDegistir = useCallback((index: number, value: string) => {
    setTaslak((prev) => (prev ? { ...prev, aylar: prev.aylar.map((m, i) => (i === index ? value : m)) } : prev));
  }, []);

  const gunEsasiDegistir = useCallback((gunEsasi: EklentiGunEsasi) => {
    setTaslak((prev) => (prev ? { ...prev, gunEsasi } : prev));
  }, []);

  const kapat = useCallback(() => setTaslak(null), []);

  return {
    taslak,
    hedef: taslak?.target ?? null,
    sonuc: taslak ? hesapla(taslak.aylar, taslak.gunEsasi) : 0,
    ac,
    ayDegistir,
    gunEsasiDegistir,
    kapat,
  };
}
