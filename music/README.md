# SpotifyGratuit 🎵

Lecteur de musique **PWA** (PC + téléphone), avec interface inspirée de
[MusicPlayer-Web](https://github.com/vittorioPiotti/MusicPlayer-Web) :
navigation Accueil / Recherche / Bibliothèque, mini-lecteur, lecteur plein
écran, **mode clair/sombre** et **lecture en arrière-plan avec écran
verrouillé**.

> ⚠️ **Important — lisible et assumé**
> - Ce projet *n'utilise pas* SpotAPI pour streame du contenu Spotify :
> SpotAPI est une **bibliothèque Python** (impossible dans un site GitHub
> Pages statique) et l'accès à l'API privée de Spotify viole les CGU de
> Spotify. À la place, l'application utilise le **lecteur embed officiel**
> de Spotify (aucun compte requis) et une recherche musicale gratuite.
> - **Pas de suppression de publicités** : forcer Spotify sans pubs =
> contourner son monétisation, interdit par Spotify (et contraire aux
> règles de la doc Spicetify elle-même). Le thème Spicetify fourni est
> purement **visuel**.

---

## 📁 Arborescence

```
SpotifyGratuit/
├── index.html                  Page unique de l'app
├── manifest.webmanifest        Manifest PWA (icône d'accueil)
├── sw.js                       Service Worker (cache hors-ligne)
├── css/style.css               Styles (thème clair & sombre)
├── js/
│   ├── library.js              Bibliothèque (IndexedDB + localStorage)
│   ├── player.js               Lecteur + Media Session API
│   └── app.js                  Navigation, recherche, installation
├── icons/                      Icônes PWA (192, 512, maskable, apple)
└── spicetify/MusicPlayerWeb/   Thème Spicetify (color.ini + user.css)
```

---

## 🚀 1. Publier sur GitHub Pages (github.io)

Tous les chemins dans le code sont **relatifs**, donc les deux options marchent.

**Option A — repo `monpseudo.github.io`** (le site sera à la racine)

1. Crée un dépôt nommé exactement `ton-pseudo.github.io`.
2. Pousse le contenu de ce dossier :

```bash
git init
git add .
git commit -m "SpotifyGratuit PWA"
git branch -M main
git remote add origin https://github.com/ton-pseudo/ton-pseudo.github.io.git
git push -u origin main
```

**Option B — n'importe quel nom de repo** (ex. `spotifygratuit`)

1. Pousse le projet dans le repo.
2. GitHub : **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
3. Ton app sera sur `https://ton-pseudo.github.io/spotifygratuit/`.

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

1. **Tes fichiers locaux** (`📄 Fichiers`) — glisse-dépose n'importe quel
   MP3 / M4A / OGG / WAV / FLAC dans l'app. Stockés dans **IndexedDB** (ils
   restent après un rafraîchissement). Nomme tes fichiers
   `Artiste - Titre.mp3` pour un affichage propre.
2. **Aperçus gratuits iTunes** (`▶ Gratuit`) — résultats de la barre de
   recherche (extrait 30 s / clip gratuit). **100 % légal**, sans compte ni
   clé API. Le bouton `＋` sauvegarde la piste dans ta bibliothèque.
3. **Lecteur Spotify officiel** (`Badge Spotify`) — colle un lien
   `https://open.spotify.com/track/...` (ou album / playlist) dans
   Bibliothèque → « + Lien Spotify ». La lecture passe par l'**iframe embed
   officielle**, aucun compte Spotify requis.

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
  ce projet est une réimplémentation indépendante, il ne copie pas son code.
- Il est **inspiré d'iTunes** selon la notice du repo d'origine.
- [Spicetify CLI](https://github.com/spicetify/cli) — doc officielle utilisée pour le thème.
- Recherche musicale via la **[iTunes Search API](https://performance-partners.apple.com/search-api)**
  d'Apple (gratuite).
- Lecteur Spotify via l'**iframe embed officielle** `open.spotify.com`.
