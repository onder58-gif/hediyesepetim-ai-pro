# Render yayınlama – v9

1. Projeyi GitHub'a yükleyin.
2. Render'da New → Web Service ile repository'yi bağlayın.
3. Build: `npm install`
4. Start: `npm start`
5. Environment bölümünde `NILAVIM_XML_URL` değerini girin.
6. `ADMIN_TOKEN` için güçlü bir gizli değer kullanın; Blueprint'teki `generateValue: true` da kullanılabilir.
7. Kalıcı siparişler için `DATABASE_URL` olarak PostgreSQL bağlantısını ekleyin.
8. Ödeme sağlayıcısı seçilmeden `PAYMENT_PROVIDER=none` bırakın.

Render ortam değişkenleri ve gizli değerleri Dashboard üzerinden yönetir. `.env` dosyasını kaynak depoya koymayın.
