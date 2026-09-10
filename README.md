# Gün Akışı

Namaz vakitleri, yürüyüş / bisiklet, kısa dinlenme, Pomodoro ve günlük özet için Türkçe PWA. iPhone SE 2 ekranına uyumlu. Giriş formu yok; her cihazın kayıtları sunucuda ayrı tutulur.

## Çalışan özellikler

- EzanVakti API üzerinden Diyanet kaynaklı günlük veriler. Ankara / Etimesgut varsayılan konumu. Etimesgut ayrı listelenmediğinde API’nin ANKARA kaydı kullanılır ve arayüz bunu “Ankara merkez takvimi” olarak açıklar. İl ve ilçe seçimi, Türkçe/ASCII arama ve yeniden yükleme. Türkiye saat dilimi (`Europe/Istanbul`), cihazın saati yanlışsa sunucu saat farkını kullanma.
- Güneşten 20 dakika önce kalkış, 10 dakika sonra hareket önerisi. Öğle, ikindi, akşam, yatsıdan 5 dakika önce ve vakit girince bildirim planı.
- Konum / izin / ayar değişikliklerinde eski planın sürümle iptali. Şekerlemeyi atlama ve hafif gün seçenekleri.
- Hareketin son 5 dakikasında dönüş, bitiş, kahvaltı ve ardından odak önerisi. Yürüyüş ve bisiklet ayrı sürelerle.
- Kalıcı Pomodoro ve molalar. Sunucu zaman damgaları; ekran kapansa da süre doğru hesaplanır. Duraklatılan zaman toplama eklenmez.
- Evdeki malzemelere göre kahvaltı seçenekleri. Gerçek oturumlardan günlük özet ve son 7 gün grafiği. Sahte istatistik yok.
- 20 dakikalık şekerleme öğle namazından sonra, ikindiden önce tamamlanacak şekilde. Kısa uyku gece uykusunun yerine sayılmaz; eksik uyku açıkça gösterilir.
- Ana sayfada ve Ayarlar’da her zaman görünen test bildirimi düğmesi; izin yoksa kurulum/izin adımını açar.
- Web Push kayıt, VAPID, RFC 8291 şifreleme, Service Worker, test gönderimi ve cihaz gösterim onayı.
- D1 kayıtları; rastgele 256 bit HttpOnly cihaz çerezi. Ziyaretçiler birbirinin programına erişemez. Çerez silinirse bu cihazın eski kayıtlarına erişim kaybolur. Farklı PWA kurulumları ayrı kayıt oluşturabilir.

## Otomatik push için gerekli bağlantı

**Mevcut uygulama için adım adım, terminal gerektirmeyen rehber: [Cloudflare kurulumu](scheduler/KURULUM.md).** GitHub bağlantısında kök klasör `scheduler` seçilir; uygulama adresi ve dakikalık Cron Trigger kodda hazırdır. Tek gizli bağlantı değeri `CRON_SECRET` iki tarafta eşleşmelidir.

**PWA kurulumu ve bildirim izni tek başına zamanlanmış push göndermez.** Site, push kuyruğunu hazırlar. Uygulama kapalıyken gönderim için `scheduler/worker.js` içindeki küçük Cloudflare Worker'ın dakikada bir çalışması gerekir. Bağlantı tamamlanmadan arayüz “zamanlayıcı bekleniyor” gösterir. Test bildirimi bu zamanlayıcıdan bağımsızdır.

1. Siteyi Sites üzerinde D1 (`DB`) ile yayımla. Mantıksal kaynak `.openai/hosting.json` içindedir.
2. Rastgele, en az 32 baytlık bir `CRON_SECRET` oluştur. Site runtime'ına gizli değer olarak ekle. `SITE_ORIGIN` değerini yayın adresine ayarla ve yeniden yayımla.
3. `scheduler/wrangler.jsonc` ile Cloudflare hesabında companion Worker'ı yayımla. Aynı `CRON_SECRET` ve `SITE_ORIGIN` değerlerini bu Worker'a da ver. Gizli anahtarı depoya veya istemciye koyma.
4. Zamanlayıcı `POST /api/tick` çağrısını `Authorization: Bearer …` ve `X-Gun-Akisi-Trigger: cron` ile dakikada bir yapar. UI, 150 saniyeden eski bağlantıyı etkin göstermez. Worker adresindeki bağlantı testi `manual` kullanır; otomatik gönderimi etkin gibi göstermez. Sağlık kaydı işlem başarıyla tamamlandığında güncellenir.
5. iPhone'da Safari → Paylaş → Ana Ekrana Ekle. Eklenen simgeden aç, bildirim izni ver, test gönder. iOS 16.4+ gerekir.

Alternatif bir güvenilir zamanlayıcı da aynı korumalı endpoint'i dakikada bir çağırabilir. GitHub Actions zamanlaması dakik bildirimler için kullanılmıyor. Bu depodaki scheduler dosyalarının bulunması, scheduler'ın yayımlandığı anlamına gelmez.

Push tam saat garantili alarm değildir: cihaz çevrimdışıysa / Odak modu susturursa gecikebilir. Sabah kalkış ve kısa uyku bitişi için Saat uygulamasında ayrıca alarm kullan. Geç gelen push, güncel görev gibi gösterilmez. İşletim sistemi tarafından gösterilmeyen bildirimleri sunucu kesin olarak doğrulayamaz.

## Geliştirme

Node 24 ve pnpm. `pnpm install`, `pnpm dev`, `pnpm build`.

- `pnpm typecheck`: TypeScript denetimi.
- `pnpm test`: gerçek SQLite üzerinde cihaz izolasyonu, konum değişiminde kuyruk iptali, eşzamanlı ayar sürümü, idempotent oturum başlatma, duraklatma / devam, gece yarısı, izin günü, uyku sınırı, scheduler tekrarında çift gönderim ve bağımsız Web Push deşifre / VAPID doğrulaması. Companion Worker için anahtar denetimi, manuel/otomatik ayrımı, ayar doğrulama, hata iletimi ve bağlantı sayfasının JavaScript denetimi.
- `pnpm db:generate`: Drizzle migration üretimi. Yayımlanmış migration değiştirilmez.

Etimesgut kaydının bulunmadığı gerçek servis yapısı, sayısal konum kimlikleri, eski kurulumlarda boş ilçe kaydının onarımı, geçersiz/eski tarihlerin reddi ve önbelleği yenileme regresyon testleriyle denetlenir. 10 Eylül 2026 tarihinde canlı ANKARA API yanıtı ayrıca okunup güncel gün ayrıştırması doğrulandı.

Testlerde saat ve namaz verileri açıkça fixture olarak kullanılır; bunlar gerçek günlük veri doğrulaması veya fiziksel iPhone testi değildir. Yeni ilçedeki geçerli veri gelmezse mevcut konum korunur. Vakit servisi yoksa doğrulanmamış saat uydurulmaz.

## Başlıca dosyalar

`app/dashboard.tsx` · arayüz. `lib/model.ts` · plan kuralları. `server/prayers.ts` · vakit API'si. `server/service.ts` · oturumlar ve push kuyruğu. `server/push.ts` · şifreleme. `app/api/[...path]/route.ts` · API. `public/sw.js` · push alımı. `scheduler/` · ayrı zamanlayıcı. `db/schema.ts` ve `drizzle/` · kalıcı veri.

## Sınırlar

Bu sürüm kişisel kullanım ve düşük trafik içindir; bir tick en fazla 100 bildirimi, yenileme en fazla 500 kayıtlı cihazı işler. Her oturum başlangıç gününe yazılır. Oturum listesi son 1000 kaydı gösterir; günlük toplamlar tüm kayıtlardan hesaplanır. Gönderim günlüğü son 30 gün tutulur. WebMCP yalnız destekleyen tarayıcılarda devreye girer; tarayıcı doğrulaması yapılmamıştır. Fiziksel iPhone'da uçtan uca push testi, kullanıcının cihaz iznini gerektirir.

## Kaynaklar

- [EzanVakti API](https://ezanvakti.emushaf.net/) — Diyanet verisini aktaran bağımsız servis.
- [Apple WebKit: iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291) ve [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292).
- [CDC: yetişkinlerde uyku](https://www.cdc.gov/sleep/about/index.html).
