# HediyeSepetim AI Pro v9

Mobil uyumlu e-ticaret/PWA prototipi. NilaVım XML ürün akışı, sepet, sipariş, yönetim paneli ve ödeme entegrasyonu için temel katman içerir.

## v9 yenilikleri
- PostgreSQL desteği (`DATABASE_URL`)
- PostgreSQL yoksa `orders.json` geri dönüşü
- Mevcut `orders.json` ilk açılışta boş PostgreSQL tablosuna aktarılabilir
- Render Blueprint ortam değişkenleri
- `ADMIN_TOKEN` Render tarafından otomatik üretilebilir
- v8'deki admin summary API yazım hatası düzeltildi

## Önemli
Gerçek ödeme henüz aktif değildir. Ödeme sağlayıcısı seçilip ticari/API bilgilerinin güvenli biçimde Render Environment bölümüne eklenmesi gerekir.

Render'da `DATABASE_URL`, `NILAVIM_XML_URL` ve ödeme sırlarını Environment bölümünden tanımlayın; `.env` dosyasını GitHub'a yüklemeyin.


## v10 ödeme
Bu sürüm iyzico Checkout Form için sandbox/production değişkenlerini içerir. Gerçek ödeme için iyzico hesabından alınan API anahtarı ve secret key Render Environment bölümüne girilmelidir. Kart bilgileri uygulama sunucusunda tutulmaz; Checkout Form akışı kullanılır.
