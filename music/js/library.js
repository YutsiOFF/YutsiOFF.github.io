/* =========================================================
   library.js — Stockage de la bibliothèque
   - Métadonnées : localStorage  (clé "sg:tracks")
   - Fichiers audio locaux : IndexedDB (blobs, clé = id piste)
   ========================================================= */
(function () {
  "use strict";

  const LS_KEY = "sg:tracks";
  const DB_NAME = "sg-audio";
  const DB_STORE = "files";

  /* ---------- IndexedDB (fichiers locaux) ---------- */
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) {
          req.result.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(key, blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(blob, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result); // peut être undefined
      req.onerror = () => reject(req.error);
    });
  }

  async function dbDelete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  /* ---------- Stockage métadonnées ---------- */
  const Library = {
    /** Toutes les pistes (métadonnées). */
    tracks: [],

    load() {
      try {
        this.tracks = JSON.parse(localStorage.getItem(LS_KEY)) || [];
      } catch { this.tracks = []; }
      return this.tracks;
    },

    save() {
      localStorage.setItem(LS_KEY, JSON.stringify(this.tracks));
      if (window.App && App.onLibraryChange) App.onLibraryChange();
    },

    get(id) { return this.tracks.find(t => t.id === id); },

    upsert(track) {
      const i = this.tracks.findIndex(t => t.id === track.id);
      if (i >= 0) this.tracks[i] = track;
      else this.tracks.push(track);
      this.save();
      return track;
    },

    async remove(id) {
      const t = this.get(id);
      if (t && t.kind === "local") { try { await dbDelete(id); } catch {} }
      this.tracks = this.tracks.filter(t => t.id !== id);
      this.save();
    },

    /* ---------- Import de fichiers locaux ---------- */
    async addLocalFiles(fileList) {
      const { uid, pad } = makeIdFactory();
      const added = [];
      for (const file of fileList) {
        if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|aac|ogg|opus|wav|flac|webm)$/i.test(file.name)) continue;
        // conventions "Artiste - Titre.mp3" | "Artiste - Album - Titre.mp3"
        let artist = "Inconnu", title = file.name.replace(/\.[^.]+$/, "");
        const m = file.name.match(/^(.+?)\s-\s(.+?)(?:\s\[(.*?)\])?$/);
        if (m) { artist = m[1].trim(); title = m[2].trim(); }
        const id = "loc_" + uid();
        await dbPut(id, file);
        added.push(this.upsert({
          id, kind: "local",
          title, artist, album: "",
          artwork: "", duration: 0,
          addedAt: Date.now()
        }));
      }
      return added;
    },

    /** Récupère le blob d'une piste locale (null sinon). */
    async getBlob(id) {
      try { return (await dbGet(id)) || null; }
      catch { return null; }
    },

    /* ---------- Pistes Spotify (via lecteur embed officiel) ---------- */
    parseSpotify(text) {
      const link = String(text).trim();
      // https://open.spotify.com/(track|album|playlist)/ID?...  ou  spotify:track:ID
      let m = link.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist)\/([A-Za-z0-9]+)/);
      if (!m) m = link.match(/spotify:(track|album|playlist):([A-Za-z0-9]+)/);
      if (!m) return null;
      const duration = link.match(/t=(\d+)/); // timestamp éventuel
      return { type: m[1], id: m[2], seek: duration ? Number(duration[1]) : null };
    },

    async addSpotifyLink(text) {
      const p = this.parseSpotify(text);
      if (!p) throw new Error("Lien Spotify invalide");
      const kindName = { track: "Titre", album: "Album", playlist: "Playlist" }[p.type];
      const track = {
        id: "sp_" + p.type + "_" + p.id,
        kind: "spotify",
        spotifyType: p.type,
        spotifyId: p.id,
        title: kindName + " Spotify",
        artist: "Spotify",
        album: "",
        artwork: "",      // sera rempli via oEmbed si possible
        duration: 0,
        addedAt: Date.now()
      };
      // oEmbed officiel : récupérer titre / pochette (sans compte ni clé)
      try {
        const url = "https://open.spotify.com/oembed?url=" +
          encodeURIComponent(`https://open.spotify.com/${p.type}/${p.id}`);
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.title) track.title = data.title;
          track.artist = p.type === "track" ? (data.artist_name || "Spotify") : `Spotify • ${kindName}`;
          if (data.thumbnail_url) track.artwork = data.thumbnail_url;
        }
      } catch { /* hors-ligne : on garde le titre générique */ }
      this.upsert(track);
      return track;
    },

    /* ---------- Aperçus gratuits (iTunes) ---------- */
    savePreview(result) {
      return this.upsert({
        id: "it_" + result.id,
        kind: "preview",
        title: result.title,
        artist: result.artist,
        album: result.album,
        artwork: result.artwork,
        url: result.previewUrl,
        duration: 30,
        addedAt: Date.now()
      });
    },

    isPreviewSaved(itunesId) {
      return this.tracks.some(t => t.id === "it_" + itunesId);
    },

    /* ---------- Recherche via la passerelle SpotAPI ---------- */
    /* Le serveur local (server/spotapi_gateway.py) expose l'API Spotify
       émulée par SpotAPI : http://localhost:8800/api/search?q=...      */
    async getGateway() {
      const base = localStorage.getItem("sg:gateway") || "http://localhost:8800";
      try {
        const res = await fetch(base.replace(/\/$/, "") + "/health", { signal: AbortSignal.timeout(2500) });
        if (res.ok) return base.replace(/\/$/, "");
      } catch {}
      return null;
    },

    async searchSpotify(term, limit = 20) {
      const base = await this.getGateway();
      if (!base) return null;
      const res = await fetch(base + "/api/search?q=" + encodeURIComponent(term) + "&limit=" + limit);
      if (!res.ok) return null;
      const tracks = await res.json();
      return tracks.map(t => ({
        id: "sp_" + t.spotifyType + "_" + t.spotifyId,
        kind: "spotify",
        spotifyType: t.spotifyType,
        spotifyId: t.spotifyId,
        title: t.title,
        artist: t.artist,
        album: t.album,
        artwork: t.artwork,
        duration: 0
      }));
    },

    /* ---------- Recherche iTunes (gratuite, sans clé) ---------- */
    async searchItunes(term, limit = 30) {
      const url = "https://itunes.apple.com/search?media=music&limit=" + limit +
        "&term=" + encodeURIComponent(term);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Recherche impossible");
      const data = await res.json();
      return (data.results || [])
        .filter(r => r.previewUrl)
        .map(r => ({
          id: r.trackId,
          title: r.trackName,
          artist: r.artistName,
          album: r.collectionName || "",
          artwork: (r.artworkUrl100 || "").replace(/100x100/, "300x300"),
          previewUrl: r.previewUrl,
          duration: 30
        }));
    }
  };

  function makeIdFactory() {
    let n = 0;
    return { uid: () => Date.now().toString(36) + "_" + (n++), pad: () => n };
  }

  window.Library = Library;
  Library.load();
})();
