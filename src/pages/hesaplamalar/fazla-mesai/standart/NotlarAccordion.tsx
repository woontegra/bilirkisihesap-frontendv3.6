/**
 * Standart Fazla Mesai — bilgilendirme notları (V3 NotlarAccordion ile aynı içerik).
 */

import { ChevronDown, FileText } from "lucide-react";
import styles from "./StandartFmPage.module.css";

function Section({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className={styles.notlarSection}>
      <div className={styles.notlarIcon} aria-hidden>
        {icon}
      </div>
      <p className={styles.notlarText}>{children}</p>
    </div>
  );
}

export function NotlarAccordion() {
  return (
    <details className={styles.notlarAccordion}>
      <summary className={styles.notlarSummary}>
        <span className={styles.notlarSummaryLabel}>
          <span className={styles.notlarSummaryBadge}>
            <FileText size={14} />
          </span>
          Notlar
        </span>
        <ChevronDown size={16} className={styles.notlarChevron} aria-hidden />
      </summary>
      <div className={styles.notlarBody}>
        <Section icon="📌">
          Fazla çalışma alacağının hesaplanmasında birden fazla değişken dikkate alınmaktadır. Hesaplama süreci,
          öncelikle işçinin fiili çalışma döneminin belirlenmesi ile başlamakta olup; bu kapsamda davacının işe giriş
          ve işten ayrılış tarihleri esas alınarak çalışma aralığı tespit edilmektedir.
        </Section>
        <Section icon="💰">
          Ücret hesabına esas olmak üzere işçinin çıplak brüt ücreti dikkate alınmakta; bu ücretin tespit
          edilememesi hâlinde ilgili dönem için geçerli olan asgari ücret üzerinden hesaplama yapılmaktadır. Ayrıca
          bilinen ücretin asgari ücretin üzerinde olması ve geçmiş dönem ücret bilgilerinin bulunmaması hâlinde,
          sistem içerisinde yer alan katsayı hesaplama modülü aracılığıyla ücret çarpanı belirlenerek geçmiş dönem
          ücretlerinin oransal şekilde hesaplanabilmesine imkân tanınmaktadır.
        </Section>
        <Section icon="⏱️">
          Fazla mesai saatlerinin belirlenmesinde günlük fiili çalışma süresi esas alınmaktadır. Günlük çalışma süresi,
          işçinin işe giriş saati ile işten çıkış saati arasındaki sürenin tespiti ve bu süreden 4857 sayılı İş
          Kanunu&apos;nun 68. maddesi kapsamında öngörülen ara dinlenme sürelerinin düşülmesi suretiyle
          hesaplanmaktadır.
        </Section>
        <Section icon="📈">
          Uzun süreli fiili çalışmalarda (özellikle 11 saat ve üzeri çalışmalarda) ara dinlenme süresi kademeli olarak
          artırılmakta (örneğin 1,5 saat ve üzeri) ve net günlük çalışma süresi bu şekilde belirlenmektedir.
        </Section>
        <Section icon="🗓️">
          Net günlük çalışma süresi, haftalık çalışma günü sayısı ile çarpılarak haftalık fiili çalışma süresine
          ulaşılmakta; çıkan çalışma süresinden haftalık yasal çalışma süresi olan 45 saat çıkarılarak haftalık fazla
          çalışma süresi hesap edilmektedir.
        </Section>
        <Section icon="⚠️">
          İşçinin haftada 7 gün çalıştığına ilişkin iddia bulunması ve ayrıca hafta tatili ücreti talebinin mevcut
          olması hâlinde, hesaplamada hafta tatili günü ayrıca ele alınmakta; haftalık fazla çalışma hesabı yapılırken:
          Günlük 7,5 saatlik yasal çalışma süresi dışlanmakta, 6 günlük fiili çalışma toplamı esas alınmakta, bu
          toplamdan haftalık 45 saatlik yasal çalışma süresi çıkarılarak haftalık fazla mesai süresi belirlenmektedir.
          Hafta tatiline denk gelen 1 günlük çalışma ise ayrıca hesaplama konusu yapılmaktadır.
        </Section>
        <Section icon="🔄">
          Vardiyalı çalışma, gece çalışması ve farklı günlerde değişken süreli çalışmalar bakımından hesaplama
          işlemleri, sistem içerisinde ayrı hesaplama modülleri üzerinden yürütülmektedir.
        </Section>
        <Section icon="📋">
          Hesaplama sürecinde; işçinin kullandığı yıllık izin günleri, ücretli veya ücretsiz izin süreleri, sağlık
          raporu nedeniyle çalışılmayan günler vb. istenildiği takdirde toplam çalışma süresinden dışlanarak hesaplama
          yapılabilmektedir.
        </Section>
        <Section icon="⏳">
          Ayrıca zamanaşımı bakımından ilgili dönemlerin ayrıştırılması suretiyle hesaplama yapılmasına imkân
          tanınmaktadır.
        </Section>
        <Section icon="⚖️">
          İş sözleşmesinde fazla çalışma ücretinin aylık ücrete dâhil olduğuna ilişkin hüküm bulunan işçiler bakımından,
          sistem içerisinde yıllık 270 saatlik fazla çalışma süresinin dışlanmasına yönelik seçenekli hesaplama
          yöntemleri yer almaktadır. Bu kapsamda; işçinin iş akdinin başlangıcından itibaren toplam 270 saatin tek
          seferde dışlanması (işe giriş tarihinden itibaren haftalık fazla mesai hesabının dışlanarak kalan haftalar
          için hesap yapılması; 270 / hesaplanan haftalık fazla mesai saati = çıkan hafta sayısının dışlanması) veya
          270/52 hafta = 5,2 fazla çalışma saati haftalık fazla çalışma saatinden düşülmek suretiyle uygulanmaktadır.
        </Section>
        <Section icon="📚">
          Hakkaniyet indirimi yönünden, ilgili yargı kararları doğrultusunda belirlenen 1/3 oranındaki indirim, sistem
          tarafından otomatik olarak uygulanabilmektedir.
        </Section>
        <Section icon="🔁">
          İşçiye ödenmiş fazla mesai ücretlerinin mevcut olması hâlinde; mahsup ve dönemsel ayrıştırmalar bakımından
          12&apos;şer aylık periyotlar hâlinde ayrı ayrı hesaplama tablolarına veri girişi yapılabilmektedir.
        </Section>
        <Section icon="💳">
          Ücret hesaplamalarında brüt tutardan net tutara geçiş süreci sistem tarafından otomatik olarak
          gerçekleştirilmekte olup; gelir vergisi oranları, hesaplama yapılan yılın vergi dilimleri ve kademeli vergi
          sistemi dikkate alınarak net ücret hesaplaması yapılmaktadır.
        </Section>
      </div>
    </details>
  );
}
