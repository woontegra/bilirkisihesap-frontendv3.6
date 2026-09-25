/** Statik SMMM oda listesi — admin toplu e-posta (segment: SMMM) */

export type SmmmChamber = {
  id: string;
  name: string;
  status: "ACTIVE";
  primaryEmail: string;
  secondaryEmail?: string | null;
  tertiaryEmail?: string | null;
  kepEmail?: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/** KEP sütunundaki adresler hariç; bu iki adres normal posta olarak sayılır */
export const SMMM_KEP_NORMAL_ALLOWLIST = new Set([
  "ozelkalem@ksmmmo.example.org",
  "destek@trbsmmmo.example.org",
]);

export function normalizeSmmmEmail(value: string | null | undefined): string | null {
  const v = String(value || "").trim().toLowerCase();
  return EMAIL_REGEX.test(v) ? v : null;
}

export function isKepOnlyEmail(email: string | null | undefined): boolean {
  const e = normalizeSmmmEmail(email);
  if (!e) return false;
  if (SMMM_KEP_NORMAL_ALLOWLIST.has(e)) return false;
  return e.endsWith(".kep.tr") || /@hs\d{2}\.kep\.tr$/i.test(e);
}

export function collectSmmmRecipientEmails(
  chamber: SmmmChamber,
  includeSecondary: boolean,
): string[] {
  const emails = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const n = normalizeSmmmEmail(raw);
    if (!n || isKepOnlyEmail(n)) return;
    emails.add(n);
  };
  add(chamber.primaryEmail);
  if (includeSecondary) {
    add(chamber.secondaryEmail);
    add(chamber.tertiaryEmail);
  }
  return [...emails];
}

function chamber(
  name: string,
  primaryEmail: string,
  secondaryEmail?: string | null,
  tertiaryEmail?: string | null,
  kepEmail?: string | null,
): SmmmChamber {
  const id = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return {
    id,
    name,
    status: "ACTIVE",
    primaryEmail,
    secondaryEmail: secondaryEmail ?? null,
    tertiaryEmail: tertiaryEmail ?? null,
    kepEmail: kepEmail ?? null,
  };
}

export const SMMM_CHAMBERS: SmmmChamber[] = [
  chamber("Adana SMMM Odası", "info@adana-smmm.example.org"),
  chamber("Adıyaman SMMM Odası", "info@adiyaman-smmm.example.org"),
  chamber("Afyonkarahisar SMMM Odası", "info@afyon-smmm.example.org", "idari@afyon-smmm.example.org"),
  chamber("Aksaray SMMM Odası", "info@aksaray-smmm.example.org"),
  chamber("Alanya SMMM Odası", "info@alanya-smmm.example.org"),
  chamber("Amasya SMMM Odası", "info@amasya-smmm.example.org"),
  chamber("Ankara SMMM Odası", "info@ankara-smmm.example.org", "idari@ankara-smmm.example.org"),
  chamber("Antalya SMMM Odası", "info@antalya-smmm.example.org"),
  chamber("Artvin SMMM Odası", "info@artvin-smmm.example.org"),
  chamber("Aydın SMMM Odası", "info@aydin-smmm.example.org"),
  chamber("Balıkesir SMMM Odası", "info@balikesir-smmm.example.org", "idari@balikesir-smmm.example.org"),
  chamber("Batman SMMM Odası", "info@batman-smmm.example.org"),
  chamber("Bilecik SMMM Odası", "info@bilecik-smmm.example.org"),
  chamber("Bitlis SMMM Odası", "info@bitlis-smmm.example.org"),
  chamber("Burdur SMMM Odası", "info@burdur-smmm.example.org"),
  chamber("Bursa SMMM Odası", "info@bursa-smmm.example.org", "idari@bursa-smmm.example.org"),
  chamber("Çanakkale SMMM Odası", "info@canakkale-smmm.example.org"),
  chamber("Çorum SMMM Odası", "info@corum-smmm.example.org"),
  chamber("Denizli SMMM Odası", "info@denizli-smmm.example.org"),
  chamber("Diyarbakır SMMM Odası", "info@diyarbakir-smmm.example.org"),
  chamber("Düzce SMMM Odası", "info@duzce-smmm.example.org"),
  chamber("Edirne SMMM Odası", "info@edirne-smmm.example.org"),
  chamber("Elazığ SMMM Odası", "info@elazig-smmm.example.org"),
  chamber("Erzincan SMMM Odası", "info@erzincan-smmm.example.org"),
  chamber("Erzurum SMMM Odası", "info@erzurum-smmm.example.org"),
  chamber("Eskişehir SMMM Odası", "info@eskisehir-smmm.example.org"),
  chamber("Gaziantep SMMM Odası", "info@gaziantep-smmm.example.org"),
  chamber("Giresun SMMM Odası", "info@giresun-smmm.example.org"),
  chamber("Gümüşhane SMMM Odası", "info@gumushane-smmm.example.org"),
  chamber("Hatay SMMM Odası", "info@hatay-smmm.example.org"),
  chamber("Isparta SMMM Odası", "info@isparta-smmm.example.org"),
  chamber("İzmir SMMM Odası", "info@izmir-smmm.example.org"),
  chamber("Kahramanmaraş SMMM Odası", "info@kahramanmaras-smmm.example.org"),
  chamber("Karabük SMMM Odası", "info@karabuk-smmm.example.org"),
  chamber("Karaman SMMM Odası", "info@karaman-smmm.example.org"),
  chamber("Kars SMMM Odası", "info@kars-smmm.example.org"),
  chamber("Kastamonu SMMM Odası", "info@kastamonu-smmm.example.org"),
  chamber("Kayseri SMMM Odası", "info@kayseri-smmm.example.org"),
  chamber("Kırklareli SMMM Odası", "info@kirklareli-smmm.example.org"),
  chamber("Kırşehir SMMM Odası", "info@kirsehir-smmm.example.org"),
  chamber("Kocaeli SMMM Odası", "info@kocaeli-smmm.example.org"),
  chamber(
    "Konya SMMM Odası",
    "info@konya-smmm.example.org",
    "idari@konya-smmm.example.org",
    "ozelkalem@ksmmmo.example.org",
  ),
  chamber("Malatya SMMM Odası", "info@malatya-smmm.example.org"),
  chamber("Manisa SMMM Odası", "info@manisa-smmm.example.org"),
  chamber("Mardin SMMM Odası", "info@mardin-smmm.example.org"),
  chamber("Mersin SMMM Odası", "info@mersin-smmm.example.org"),
  chamber("Muğla SMMM Odası", "info@mugla-smmm.example.org"),
  chamber("Muş SMMM Odası", "info@mus-smmm.example.org"),
  chamber("Nevşehir SMMM Odası", "info@nevsehir-smmm.example.org"),
  chamber("Ordu SMMM Odası", "info@ordu-smmm.example.org"),
  chamber("Osmaniye SMMM Odası", "info@osmaniye-smmm.example.org"),
  chamber("Rize SMMM Odası", "info@rize-smmm.example.org"),
  chamber("Sakarya SMMM Odası", "info@sakarya-smmm.example.org"),
  chamber("Samsun SMMM Odası", "info@samsun-smmm.example.org"),
  chamber("Sinop SMMM Odası", "info@sinop-smmm.example.org"),
  chamber("Sivas SMMM Odası", "info@sivas-smmm.example.org"),
  chamber("Şanlıurfa SMMM Odası", "info@sanliurfa-smmm.example.org"),
  chamber("Tekirdağ SMMM Odası", "info@tekirdag-smmm.example.org"),
  chamber("Tokat SMMM Odası", "info@tokat-smmm.example.org"),
  chamber("Trabzon SMMM Odası", "info@trabzon-smmm.example.org", "destek@trbsmmmo.example.org"),
  chamber("Uşak SMMM Odası", "info@usak-smmm.example.org"),
  chamber("Van SMMM Odası", "info@van-smmm.example.org"),
  chamber("Yalova SMMM Odası", "info@yalova-smmm.example.org"),
  chamber("Yozgat SMMM Odası", "info@yozgat-smmm.example.org"),
  chamber("Zonguldak SMMM Odası", "info@zonguldak-smmm.example.org"),
].sort((a, b) => a.name.localeCompare(b.name, "tr"));

export const ACTIVE_SMMM_CHAMBERS = SMMM_CHAMBERS.filter((c) => c.status === "ACTIVE");
