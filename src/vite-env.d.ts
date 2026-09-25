/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_SUBSCRIPTION_RENEWAL_ENABLED?: string;
  readonly VITE_SMART_IMPORT_V2?: string;
  readonly VITE_YANDEX_METRICA_ENABLED?: string;
  readonly VITE_YANDEX_METRICA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
