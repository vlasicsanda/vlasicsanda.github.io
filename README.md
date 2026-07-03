# Web stranica — Sanda Vlašić

Kompletna web stranica za umjetnicu: galerija radova, kolekcije, novosti, kontakt
i **vlastita administracija** kojom umjetnica sve uređuje sama, s mobitela ili računala.

## Zašto NE WordPress (obrazloženje odabira tehnologije)

| | WordPress | Ovo rješenje (statička stranica) |
|---|---|---|
| Hosting | Treba PHP + bazu → plaćeni hosting ili ograničen besplatni s reklamama | **GitHub Pages — besplatno zauvijek, bez reklama** |
| Održavanje | Stalna ažuriranja WP-a, tema i dodataka; česta meta hakera | **Ništa za održavati** — nema servera ni baze koju bi netko hakirao |
| Brzina | Ovisi o hostingu, često sporo | Vrlo brzo — samo statičke datoteke |
| Objava | Instalacija, konfiguracija, migracije | **Copy-paste datoteka u GitHub repozitorij** |
| Administracija | Moćna ali pretrpana | Vlastiti admin skrojen točno po potrebama umjetnice |

Cijela stranica su obične datoteke (HTML/CSS/JS + 4 JSON datoteke sa sadržajem).
Administracija (`admin.html`) sprema promjene izravno u GitHub repozitorij preko
GitHub API-ja — nema nikakvog servera, a ipak umjetnica sve uređuje kroz forme.

## Struktura projekta

```
├── index.html            naslovnica
├── galerija.html         svi radovi + pretraga i filtri
├── kolekcije.html        pregled kolekcija
├── rad.html              detalj jednog rada (?id=...)
├── novosti.html          popis novosti
├── novost.html           jedna novost (?id=...)
├── o-umjetnici.html      biografija
├── kontakt.html          kontakt + obrazac (otvara e-mail)
├── admin.html            ADMINISTRACIJA
├── data/                 SAV SADRŽAJ (uređuje se kroz admin)
│   ├── settings.json     tema, tekstovi, kontakt, jezik
│   ├── works.json        radovi
│   ├── collections.json  kolekcije
│   └── news.json         novosti
├── css/                  base.css + 4 teme + admin.css
├── js/                   site.js, admin.js, i18n.js (hr/en/sl)
└── images/               fotografije (admin ih automatski dodaje ovdje)
```

## Objava — korak po korak (jednokratno, ~15 minuta)

### 1. GitHub račun i repozitorij
1. Registriraj se na https://github.com (besplatno).
2. Klikni **New repository**, naziv npr. `sanda-vlasic-web`, ostavi **Public**, klikni **Create repository**.
3. Klikni **uploading an existing file** i povuci (drag & drop) **sav sadržaj ove mape** u prozor. Klikni **Commit changes**.
   (Ili preko git-a: `git push` — kako ti je draže.)

### 2. Uključi GitHub Pages
1. U repozitoriju: **Settings → Pages**.
2. Pod *Source* odaberi **Deploy from a branch**, grana **main**, mapa **/ (root)**. Spremi.
3. Za minutu-dvije stranica je živa na: `https://KORISNICKO-IME.github.io/sanda-vlasic-web/`

### 3. Napravi pristupni token (za administraciju)
1. GitHub → klik na avatar → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Naziv: npr. `sanda-admin`. **Expiration**: 366 dana (podsjetnik: nakon isteka napravi novi i ponovno se prijavi u admin).
3. **Repository access**: *Only select repositories* → odaberi `sanda-vlasic-web`.
4. **Permissions → Repository permissions → Contents: Read and write**. Ništa drugo.
5. Generiraj i **kopiraj token** (prikaže se samo jednom).

### 4. Prijava u administraciju
Otvori `https://KORISNICKO-IME.github.io/sanda-vlasic-web/admin.html`,
upiši korisničko ime, naziv repozitorija i token. Prijava se pamti na uređaju
(napravi to jednom na Sandinom mobitelu/tabletu i gotovo).

> `admin.html` je javno vidljiva stranica, ali bez tokena ništa ne može mijenjati.
> Token čuvajte kao lozinku.

### 5. Sitemap i robots
U `sitemap.xml` i `robots.txt` zamijeni `KORISNICKO-IME.github.io/sanda-vlasic-web`
stvarnom adresom (a kasnije domenom).

## Vlastita domena (npr. sandavlasic.art) — kad budete spremni
1. Kupi domenu (Namecheap, Porkbun… ~10–15 €/god).
2. U repozitoriju: **Settings → Pages → Custom domain** → upiši domenu.
3. Kod registrara domene postavi DNS: `CNAME` zapis `www` → `KORISNICKO-IME.github.io`
   i 4 `A` zapisa za apex domenu na GitHub Pages IP adrese (185.199.108.153, .109., .110., .111.).
4. Uključi **Enforce HTTPS**. Sadržaj i admin rade dalje bez ikakvih izmjena.

## Fotografije — preporuka (važno)

**Preporučeni način: upload kroz administraciju** (gumb „Odaberi fotografiju s uređaja").
- Fotografija se **automatski smanji** na max 1600 px i komprimira (brzo učitavanje),
  sprema se u `images/` u repozitorij i nikad ne nestaje.

**Zašto ne Google Photos:** Google Photos ne daje trajne izravne linkove na slike —
linkovi za dijeljenje vode na Googleovu stranicu (ne na samu sliku), a izravni
`googleusercontent` linkovi **istječu i mijenjaju se**, pa bi se slike na stranici
s vremenom „razbile". Zato je upload u repozitorij pouzdano i dugoročno rješenje.
Admin ipak prihvaća i URL fotografije (za slike s drugih pouzdanih adresa).

## Više jezika
Stranica je pripremljena za hrvatski, engleski i slovenski — svi tekstovi sučelja
su u `js/i18n.js`, a jezik se bira u admin Postavkama. Sadržaj (opisi, novosti) je
zasad jednojezičan; kad zatreba, polja u JSON-u se prošire u oblik
`{ "hr": "...", "en": "...", "sl": "..." }` uz malu dopunu `site.js`.

## Buduće mogućnosti (arhitektura ih podržava)
- **Online kupnja / kartice**: najlakše Stripe Payment Links (link po slici) ili
  Snipcart — dodaje se kao gumb na `rad.html`, bez servera.
- **Newsletter**: Buttondown/Mailerlite obrazac na naslovnici.
- **Kalendar izložbi**: nova JSON datoteka + kartica u adminu (isti obrazac kao novosti).
- **Video uz radove**: polje `video` (YouTube link) u `works.json`.

## Tehničke napomene
- Bez build koraka i bez ovisnosti — čisti HTML/CSS/JS.
- Teme se mijenjaju u admin Postavkama (mijenja se samo `settings.json` → drugi CSS).
- Nakon spremanja u adminu, GitHub Pages objavi promjenu za ~1 minutu.
- SEO: svaka stranica ima meta title/description, OG oznake na naslovnici,
  sitemap.xml i robots.txt. Za detalje radova title/description se postavljaju dinamički.
