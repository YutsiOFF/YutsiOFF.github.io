# SpotifyGratuit 🎵

> ✅ **Déployé !** → https://yutsioff.github.io/music/

Lecteur de musique **PWA** (PC + téléphone), avec interface inspirée de
[MusicPlayer-Web](https://github.com/vittorioPiotti/MusicPlayer-Web) :
navigation Accueil / Recherche / Bibliothèque, mini-lecteur, lecteur plein
écran, **mode clair/sombre** et **lecture en arrière-plan avec écran
verrouillé**.

Recherche musicale **hybride** :
1. **SpotAPI** ([Aran404/SpotAPI](https://github.com/Aran404/SpotAPI)) via une
   **passerelle locale** qui tourne sur le PC (`server/spotapi_gateway.py`) —
   résultats du **catalogue Spotify** avec pochettes, joués par le lecteur
   embed officiel Spotify ;
2. sinon **API iTunes Search** (gratuite, sans clé) : extraits jouables de 30 s.

---

## 📁 Arborescence

```
SpotifyGratuit/
├── index.html                  Page unique de l'app
├── manifest.webmanifest        Manifest PWA (icône d'accueil)
├── sw.js                       Service Worker (cache hors-ligne + MAJ)
├── css/style.css               Styles (thème clair & sombre)
├── js/
│   ├── library.js              Bibliothèque (IndexedDB) + recherches
│   ├── player.js               Lecteur + Media Session API
│   └── app.js                  Navigation, recherche, installation
├── icons/                      Icônes PWA (192, 512, maskable, apple)
├── server/                     ⭐ Passerelle SpotAPI locale
│   ├── spotapi_gateway.py      Flask + SpotlightAPI + CÔRSE ouvert
│   ├── start-gateway.ps1       Lanceur 1 double-clic (PowerShell)
│   └── requirements.txt
├── spicetify/MusicPlayerWeb/   Thème Spicetify (color.ini + user.css)
└── install-spicetify.ps1       Installe Spicetify + le thème d'un coup
```

---

## 🔌 0. Le système SpotAPI (PC uniquement)

GitHub Pages est **100 % statique** (aucun code serveur possible). Donc la
recherche SpotAPI tourne comme **passerelle locale** sur ton PC :

```powershell
# au premier lancement / quand tu veux chercher via le catalogue Spotify :
powershell -ExecutionPolicy Bypass -File server\start-gateway.ps1
```

- ✔️ La PWA github.io (ou open depuis http://localhost:8800) détecte la passerelle
  automatiquement (`/health`) et bilingue : SpotAPI d'abord, iTunes en secours.
- ✔️ Sans que la passerelle soit lancée, l'application continue de marcher
  (limité à iTunes + bibliothèque + liens Spotify enregistrés).
- Telephone : instinctuellement l'https ne peut pas joindre le PC (règle
  navigateur « contenu mixte + réseau privé »). Pour la recherche SpotAPI
  sur le téléphone, **ouvre directement `http://<ip-du-PC>:8800` en Wi-Fi**
  (servi par la passerelle elle-même) et installe la PWA depuis cette URL.
  Autorise aussi Python dans le pare-feu si demandé au 1er lancement.

---

## 🚀 1. Déploiement (déjà fait ✅)

Le site est déjà sur **`https://yutsioff.github.io/music/`**
(sous-dossier du compte `YutsiOFF`, sans toucher au site principal).

Mise à jour future : édite un fichier puis re-pousse via
`gh api -X PUT repos/YutsiOFF/YutsiOFF.github.io/contents/music/<fichier> -f content=<base64> -f branch=main`
ou un simple `git push` si Git est installé. Le service worker fait du
*network-first* sur les fichiers `.html/.js/.css` : les mises à jour s'appliquent
au 1er rechargement.

---

## 📲 2. Installer l'app sur la machine / le téléphone

L'app est une vraie **PWA** : une fois installée elle disparaît de la barre
de navigateur, a **sa propre icône** et se lance en plein écran.

| Plateforme | Comment installer |
| --- | --- |
| **Windows PC** | Chrome / Edge → bouton « Installer » dans l'app (ou l'icône ➕/TV dans la barre d'adresse) |
| **Android** | Chrome → bannière « Installer », ou menu ⋮ → « Installer l'application » |
| **iPhone / iPad** | Safari → bouton **Partager ⎋** → « Sur l'écran d'accueil » → « Ajouter » |

---

## 🔒 3. Lecture écran verrouillé / en arrière-plan

Le lecteur utilise la [**Media Session API**](https://developer.mozilla.org/docs/Web/API/Media_Session_API)
de ton navigateur : quand la musique joue, le verrouillage de l'écran
n'interrompt pas la lecture et :

- ⏯ lecture / pause,
- ⏭ piste suivante / précédente,
- la **pochette**, le titre et l'artiste s'affichent sur l'écran de verrouillage.

Comportement selon la plateforme :

| Navigateur | Fond + écran verrouillé | Boutons du lock screen |
| --- | --- | --- |
| Chrome Android / PWA installée | ✅ très fiable | ✅ |
| Chrome / Edge desktop (app installée) | ✅ | ✅ (HUD média de l'OS) |
| Safari iOS | ✅ (app installée conseillée) | ✅ |
| Firefox | ⚠️ partiel (le fond reste) | ⚠️ support limité |

> Astuce : la PWA installée reste en vie plus facilement que l'onglet ; le
> service worker (`sw.js`) recharge l'interface même hors connexion.

---

## 🎧 4. Sources de musique disponibles

1. **Catalogue Spotify via SpotAPI** (`🟢 Spotify`) — quand la passerelle locale
   tourne : la recherche interroge le catalogue Spotify (titres, artistes,
   pochettes) et la lecture passe par l'**iframe embed officielle** de Spotify,
   sans compte requis.
2. **Aperçus gratuits iTunes** (`🎵`) — résultats de la barre de recherche
   (extrait 30 s). **100 % légal**, sans compte ni clé API. Le bouton `＋`
   sauvegarde la piste dans ta bibliothèque.
3. **Tes fichiers locaux** (`📄 local`) — glisse-dépose n'importe quel
   MP3 / M4A / OGG / WAV / FLAC. Stockés dans **IndexedDB** (restent après
   rafraîchissement). Nom `Artiste - Titre.mp3` recommandé.
4. **Liens Spotify** — colle `https://open.spotify.com/track/...` (album,
   playlist) dans Bibliothèque → « + Lien Spotify ».

---

## 🎨 5. Thème Spicetify (dossier `spicetify/`)

Un thème **purement esthétique** au style de MusicPlayer-Web, fourni avec
deux palettes (`Dark` / `Light`), conforme à la
[doc Spicetify](https://spicetify.app/docs/customization/themes).

### a) Installer Spicetify CLI (PC Windows/macOS/Linux)

Suivre la doc officielle : <https://spicetify.app/docs/getting-started>.
Sur Windows, dans PowerShell :

```powershell
Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" | iex
spicetify backup apply
```

### b) Installer le thème

1. Copie le dossier :
   - **Windows** : colle `spicetify/MusicPlayerWeb` dans `%appdata%\spicetify\Themes\`
   - **macOS / Linux** : dans `~/.config/spicetify/Themes/`
2. Applique-le :

```powershell
spicetify config current_theme MusicPlayerWeb color_scheme Dark
spicetify apply
```

> Pour revenir au thème d'origine : `spicetify config current_theme "" spicetify apply`.
> Palette claire : `color_scheme Light`.

### ⚠️ Ce que ce thème ne fait PAS

Il **ne bloque pas** les publicités et ne permet **pas** de l'écoute sans
compte premium de contournement. Pour la lecture sans pubs, le moyen légal
et pérenne est **Spotify Premium**. Spicetify est un outil de
personnalisation visuelle, pas un moyen de paiement.

---

## 🧩 6. Développement local

Ouvre simplement `index.html` (double-clic) **ou mieux**, lance un petit
serveur (nécessaire à l'installation de la PWA hors-GitHub) :

```bash
python -m http.server 8080
# ou
npx serve .
```

---

## 📜 Crédits & licences

- **Design d'interface inspiré de**
  [MusicPlayer-Web](https://github.com/vittorioPiotti/MusicPlayer-Web) (GPL-3.0) —
  réimplémentation indépendante, aucun code copié.
- **[SpotAPI](https://github.com/Aran404/SpotAPI)** (GPL-3.0) — passée en passerelle
  locale côté PC. Avertissement du projet : l'usage de l'API privée de Spotify
  peut enfreindre leurs conditions ; à réserver à un usage personnel éducatif.
- [Spicetify CLI](https://github.com/spicetify/cli) — doc officielle pour le thème.
- Recherche via la **[iTunes Search API](https://performance-partners.apple.com/search-api)** d'Apple.
- Lecteur Spotify via l'**iframe embed officielle** `open.spotify.com`.
- **Pas de suppression de publicités** : le thème Spicetify est purement
  visuel ; contourner pubs / Premium va à l'encontre des CGU de Spotify.
