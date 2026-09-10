# Cloudflare kurulumu — Gün Akışı

Bu adımlar mevcut [Gün Akışı uygulamasının](https://gun-akisi.gunduz.chatgpt.site) otomatik bildirim gönderimini açar. Bilgisayara program kurman veya terminal kullanman gerekmez. Cloudflare'ın web panelinden GitHub'daki `scheduler` klasörünü bağlayacağız. ChatGPT'ye Cloudflare eklentisi kurmak bu yöntem için gerekli değil.

Bu klasördeki küçük program dakikada bir uygulamaya haber verir; zamanı gelen bildirimleri uygulamanın sunucusu gönderir. Telefonunda uygulamanın açık olması gerekmez.

## 1. Cloudflare hesabını aç

[Cloudflare kayıt sayfasına](https://dash.cloudflare.com/sign-up) gir, hesap oluştur ve istenirse e-posta adresini doğrula. Hesabın varsa giriş yap. Workers Free planıyla başlayabilirsin; kendi alan adını satın alman gerekmez, Cloudflare bir `workers.dev` adresi verir.

Sol menüde **Workers & Pages** bölümüne gir. **Create application** düğmesine bas. GitHub deposundan uygulama oluşturma seçeneğini seç, GitHub hesabını bağla ve `dgdfurkan/PushOr` deposunu seç. GitHub izin ekranında depo seçimi çıkarsa yalnız **PushOr** yeterli.

[Cloudflare: panelden uygulama oluşturma](https://developers.cloudflare.com/workers/get-started/dashboard/).

## 2. Kurulum alanlarını doldur

| Ekrandaki alan | Yazacağın değer |
| --- | --- |
| Worker / Project name | `gun-akisi-scheduler` |
| Repository | `dgdfurkan/PushOr` |
| Production branch | `main` |
| Root directory | `scheduler` |
| Build command | Boş bırak |
| Deploy command | `npx wrangler deploy` |

**Root directory alanını mutlaka `scheduler` yap.** Panel bu alanı gelişmiş ayarların içinde gösterebilir. Böylece sadece bildirim zamanlayıcısı yüklenir. Uygulamanın yayın adresi değişmez.

Cloudflare'ın otomatik oluşturduğu dağıtım yetkisi ayarını kullanabilirsin. Bu ekrandaki **Build variables and secrets** alanına bağlantı anahtarını yazma; anahtarın çalışma anında kullanılacağı doğru yer 3. adım.

**Deploy** düğmesine bas ve başarılı olmasını bekle. Bu depodaki ayarlar uygulama adresini ve her dakika çalışmayı (`* * * * *`) otomatik ekler. Anahtar henüz girilmediği için bu aşamada zamanlanmış çalışmanın hata vermesi normaldir.

[Cloudflare: build, deploy ve root directory alanları](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## 3. Bağlantı anahtarını ekle

Oluşan **gun-akisi-scheduler** uygulamasını aç. **Settings → Variables and Secrets → Add** yoluna git.

| Alan | Değer |
| --- | --- |
| Type | **Secret** |
| Variable name | `CRON_SECRET` |
| Value | Kurulum sırasında sana özel verilen bağlantı anahtarının tamamı |

**Deploy** ile kaydet. Başına/sonuna tırnak ekleme. Bu değer Cloudflare API token'ı veya hesap şifren değildir; Gün Akışı ile zamanlayıcının birbirini tanımasını sağlar. Anahtarı GitHub'a, `worker.js` içine veya ekran görüntüsüne koyma.

`SITE_ORIGIN` kodda hazır: `https://gun-akisi.gunduz.chatgpt.site`. Mevcut uygulama için ayrıca eklemene gerek yok.

[Cloudflare: gizli değişken ekleme](https://developers.cloudflare.com/workers/configuration/secrets/).

## 4. Bağlantıyı dene

Worker ekranındaki **Visit** bağlantısını veya gösterilen `workers.dev` adresini aç. “Bağlantıyı kontrol edelim” ekranı gelecek.

Az önce kullandığın anahtarı **Bağlantı anahtarı** alanına yapıştır ve **Bağlantıyı dene** düğmesine bas. **“Bağlantı tamam”** mesajı görmelisin. `0 bildirim gönderildi` normaldir: o anda zamanı gelmiş bildirim olmayabilir.

Bu düğme sunucuyla bağlantıyı kontrol eder; tek başına otomatik zamanlamanın çalıştığını kanıtlamaz. Testin zamanı gelmiş bildirimleri gönderebildiğini de aklında tut.

## 5. Otomatik çalışmayı doğrula

Cloudflare'da Worker'ın **Settings → Triggers → Cron Triggers** bölümünde `* * * * *` görünmeli. Bu kural kodla zaten kuruluyor; ayrıca ikinci bir kural ekleme. Görünmüyorsa 2. adımdaki kök klasörü ve Deploy sonucunu kontrol et. GitHub üzerinden yapılan sonraki yüklemelerde kaynak `wrangler.jsonc` dosyasıdır.

Yeni zamanlamanın yayılması **15 dakikayı bulabilir**. Ardından [Gün Akışı → Ayarlar](https://gun-akisi.gunduz.chatgpt.site/?view=settings) ekranını aç/yenile. Son başarılı otomatik çalışmanın güncel olması ve **Otomatik gönderim → Zamanlayıcı çalışıyor** durumunu görmen gerekir. Arayüz 150 saniyeden eski çalışmayı etkin saymaz.

Cloudflare tarafında **Settings → Trigger Events → View events** veya **Observability → Logs** alanından çalışmaları da görebilirsin. Yeni Worker için geçmiş olayların görünmesi 30 dakikayı bulabilir; bu ekranın geç dolması tek başına arıza demek değildir.

[Cloudflare: Cron Triggers, yayılma ve geçmiş olaylar](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## 6. iPhone'da gerçek bildirim testi yap

1. iOS 16.4 veya üzeri sürüm kullan. [Gün Akışı'nı](https://gun-akisi.gunduz.chatgpt.site) Safari'de aç → Paylaş → **Ana Ekrana Ekle**.
2. Ana ekrana eklenen Gün Akışı simgesinden aç. Ayarlar'dan bildirimleri aç ve iPhone izin sorusunu onayla.
3. **Test bildirimi** gönder. Bu, telefon iznini ve push bağlantısını kontrol eder.
4. Zamanlayıcı etkin olduktan sonra kısa bir Pomodoro molası başlat. Ana ekrana dön, uygulamayı kapalı bırak, mola bitiş bildirimini bekle. Bu son adım otomatik gönderimi telefonunda doğrular.

Test bildirimi geliyor ama mola bitişi gelmiyorsa önce 5. adımdaki zamanlayıcı durumuna bak. Zamanlayıcı etkinse iPhone internet bağlantısını ve Odak/Bildirim ayarlarını kontrol et. Dakikalık denetim ve iOS teslimatı nedeniyle push tam saniyeli alarm değildir; sabah kalkışı için Saat uygulamasındaki alarmını koru.

[Apple WebKit: ana ekrana eklenen uygulamalarda Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Bir sorun çıkarsa

| Gördüğün durum | Yapılacak işlem |
| --- | --- |
| Depo görünmüyor | GitHub bağlantısının `PushOr` deposuna erişimi olduğunu kontrol et. |
| Next.js kurulumu veya D1 hatası çıkıyor | Root directory yanlış. **Settings → Build** içinde `scheduler` yap ve yeniden dağıt. |
| `CRON_SECRET eksik` | **Settings → Variables and Secrets** altında **Secret** türüyle anahtarı ekle ve Deploy yap. Build variables alanı yeterli değil. |
| `Bağlantı anahtarı yanlış` | Test ekranına Cloudflare'a kaydettiğin anahtarın aynısını gir. |
| `Bağlantı anahtarı eşleşmiyor` | Cloudflare'daki anahtar uygulama sunucusundakiyle aynı değil. Verilen anahtarı tam kopyalayıp Secret değerini güncelle. |
| `Uygulama tarafındaki zamanlayıcı ayarı henüz hazır değil` | Site tarafındaki gizli ayar veya yayını eksik; geliştirici sunucu `CRON_SECRET` değerini kontrol etmeli. |
| `Site isteği engelledi` | Gün Akışı'nın yayın adresini ve herkese açık erişimini kontrol et. |
| Bağlantı testi başarılı, otomatik durum pasif | Cron ifadesini kontrol et, ilk kurulumda 15 dakika bekle, Cloudflare çalışma kayıtlarına bak. |
| Sürekli zaman aşımı / HTTP hatası | Cloudflare Logs ve uygulamanın hata kayıtları kontrol edilmeli; bunu etkin bağlantı kabul etme. |

## Başka bir uygulama adresinde kullanacak geliştirici için

Mevcut Gün Akışı kurulumu için bu bölümde işlem yapılmaz. Kendi kopyanı yayımlarsan en az 32 bayt rastgele anahtarı ana uygulamanın runtime'ına `CRON_SECRET` olarak ekle ve siteyi yeniden yayımla. Aynı anahtarı companion Worker'a Secret olarak ver. `wrangler.jsonc` içindeki `SITE_ORIGIN` ile ana uygulamanın `SITE_ORIGIN` değerini yeni HTTPS origin'e ayarla; sonuna `/api/tick` ekleme. Kurulum sayfasındaki uygulama bağlantısı için `worker.js` içindeki varsayılan adresi de değiştir.

Alternatif zamanlayıcı `POST /api/tick` çağrısını `Authorization: Bearer <CRON_SECRET>` ve `X-Gun-Akisi-Trigger: cron` başlıklarıyla yapmalı. Elle yapılan bağlantı testleri `manual` kullanır; otomatik çalışmanın sağlık kaydını güncellemez. Anahtar yokken API gönderimi kapalı tutar. Bağlantı sayfası anahtarı saklamaz; Worker logları anahtarı yazmaz.
