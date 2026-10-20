# Bilirkişi Hesap — Frontend V3.5

Bağımsız frontend iskeleti. Mevcut `frontendV3` referans alınır; kod kopyalanmaz.

## Çalıştırma

```bash
npm install
npm run dev
```

Uygulama varsayılan olarak **http://localhost:5173** üzerinde açılır (`strictPort: true`).

## Veri kaynağı

`.env` içinde:

- `VITE_DATA_SOURCE=api` — mevcut backend endpointleri (varsayılan)
- `VITE_DATA_SOURCE=mock` — yalnızca offline / tasarım senaryoları

Mock senaryoları (`mock` iken):

- `/?scenario=empty` — boş veri
- `/?scenario=error` — bağlantı hatası

## Komutlar

- `npm run dev` — geliştirme sunucusu
- `npm run build` — üretim derlemesi
- `npm run lint` — oxlint
- `npm run preview` — derleme önizleme
