# İl ve ilçe kataloğu

`turkey-districts.json`: TurkiyeAPI 2025 veri kümesinden yalnız il adı, ilçe ID ve ilçe adı alınmıştır (81 il, 973 ilçe). Sunucu paketine dahildir; konum ararken ek bir dış servise istek gönderilmez. Mahalle/bölge alanı kullanıcının yazdığı etikettir; ayrı namaz takvimi veya koordinat hesabı değildir.

Kaynak: https://github.com/ubeydeozdmr/turkiye-api/tree/main/datasets/2025

Kaynak blobları: districts `71d997c298c2dba06cad57a6a0e85a25b0fd323b`, provinces `d231cbd136325bb167c9366f0d7cb839fce77c16`. Alındığı tarih: 2026-09-10. Güncellemede alanları yeniden daraltıp il/ilçe sayılarını ve eşleşme testlerini kontrol edin.

Namaz takvimleri EzanVakti API'den gelir. Aynı adlı kayıt varsa doğrudan eşlenir. Mevcut Etimesgut → Ankara merkez tercihi açıkça gösterilir. Başka ilçeler için tahmini coğrafi eşleme yapılmaz; ayrı takvim yoksa kullanıcı bu ildeki mevcut takvimlerden birini açıkça seçer.

MIT License

Copyright (c) 2022-2026 Ubeyde Emir Özdemir

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
