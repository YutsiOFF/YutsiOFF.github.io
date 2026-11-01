/* =========================================================
   library.js — Bibliothèque + client API (passerelle SpotAPI)
   - Bibliothèque : IndexedDB (fichiers locaux) + localStorage
   - Catalogue   : https://gateway/api/*  avec cache mémoire
   ========================================================= */
(function () {
  "use strict";

  const LS_KEY = "sg:tracks";
  const DB_NAME = "sg-audio";
  const DB_STORE = "files";

  /* ============ Bibliothèque locale ============ */
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
  const dbPut = (key, blob) =>
    openDB().then(db => new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(blob, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    }));
  const dbGet = (key) =>
    openDB().then(db => new Promise((res, rej) => {
      const rq = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    }));
  const dbDelete = (key) =>
    openDB().then(db => new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    }));

  /* ============ Passerelle SpotAPI ============ */
  const _fetchCache = new Map();
  const TTL_MS = 5 * 60 * 1000;

  async function gw(path) {
    const base = await Library.getGateway();
    if (!base) throw new Error("Passerelle non disponible");
    const key = base + path;
    const hit = _fetchCache.get(key);
    if (hit && Date.now() - hit.t < TTL_MS) return hit.data;
    const res = await fetch(key);
    if (!res.ok) throw new Error("Erreur passerelle " + res.status);
    const data = await res.json();
    _fetchCache.set(key, { t: Date.now(), data });
    return data;
  }

  async function gwOrNull(path) {
    try { return await gw(path); } catch { return null; }
  }

  const Library = {
    tracks: [],
    gatewayReady: null,   // promesse statut booléen

    load() {
      try { this.tracks = JSON.parse(localStorage.getItem(LS_KEY)) || []; }
      catch { this.tracks = []; }
      return this.tracks;
    },
    save() {
      localStorage.setItem(LS_KEY, JSON.stringify(this.tracks));
      if (window.App && App.onLibraryChange) App.onLibraryChange();
    },
    get(id) { return this.tracks.find(t => t.id === id); },
    upsert(track) {
      const i = this.tracks.findIndex(t => t.id === track.id);
      if (i >= 0) this.tracks[i] = track; else this.tracks.push(track);
      this.save();
      return track;
    },
    async remove(id) {
      const t = this.get(id);
      if (t && t.kind === "local") { try { await dbDelete(id); } catch {} }
      this.tracks = this.tracks.filter(t => t.id !== id);
      this.save();
    },

    /* ---------- Passerelle : statut + accès ---------- */
    getGateway() {
      const base = localStorage.getItem("sg:gateway") || "http://localhost:8800";
      if (!this._gwPromise) {
        this._gwPromise = (async () => {
          try {
            const res = await fetch(base.replace(/\/$/, "") + "/health", { signal: AbortSignal.timeout(2500) });
            if (res.ok) return base.replace(/\/$/, "");
          } catch {}
          return null;
        })();
        this._gwPromise.then(ok => {
          if (window.App) App.gatewayStatus(!!ok);
        });
      }
      return this._gwPromise;
    },
    resetGateway() { this._gwPromise = null; },

    home: () => gwOrNull("/api/home"),
    playlist: (id, offset = 0) => gwOrNull(`/api/playlist/${id}?limit=100&offset=${offset}`),
    album: (id) => gwOrNull(`/api/album/${id}?limit=100`),
    artist: (id) => gwOrNull(`/api/artist/${id}`),
    artistDiscography: (id, section) => gwOrNull(`/api/artist/${id}/discography?section=${section}&limit=50`),
    genres: () => gwOrNull("/api/genres"),

    /** Recherche complète : titres Spotify + artistes SpotAPI */
    async searchAll(term) {
      const data = await gwOrNull("/api/search?q=" + encodeURIComponent(term) + "&limit=24");
      if (!data) return null;
      return {
        tracks: (data.tracks || []).map(t => Library.toTrack(t)),
        artists: data.artists || []
      };
    },
    /** Node API -> modèle de piste bibliothèque */
    toTrack(t) {
      return {
        id: "sp_track_" + t.spotifyId,
        kind: "spotify",
        spotifyType: "track",
        spotifyId: t.spotifyId,
        title: t.title,
        artist: t.artist,
        artwork: t.artwork,
        duration: t.duration || 0
      };
    },

    /* ---------- Import fichiers locaux ---------- */
    async addLocalFiles(fileList) {
      let n = 0;
      const added = [];
      for (const file of fileList) {
        if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|aac|ogg|opus|wav|flac|webm)$/i.test(file.name)) continue;
        let artist = "Inconnu", title = file.name.replace(/\.[^.]+$/, "");
        const m = file.name.match(/^(.+?)\s-\s(.+?)(?:\s\[(.*?)\])?$/);
        if (m) { artist = m[1].trim(); title = m[2].trim(); }
        const id = "loc_" + Date.now().toString(36) + "_" + (n++);
        await dbPut(id, file);
        added.push(this.upsert({
          id, kind: "local", title, artist, album: "",
          artwork: "", duration: 0, addedAt: Date.now()
        }));
      }
      return added;
    },
    async getBlob(id) {
      try { return (await dbGet(id)) || null; } catch { return null; }
    },

    /* ---------- Liens Spotify ---------- */
    parseSpotify(text) {
      const link = String(text).trim();
      let m = link.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist)\/([A-Za-z0-9]+)/);
      if (!m) m = link.match(/spotify:(track|album|playlist):([A-Za-z0-9]+)/);
      return m ? { type: m[1], id: m[2] } : null;
    },
    async addSpotifyLink(text) {
      const p = this.parseSpotify(text);
      if (!p) throw new Error("Lien Spotify invalide");
      const kindName = { track: "Titre", album: "Album", playlist: "Playlist" }[p.type];
      const t = {
        id: "sp_" + p.type + "_" + p.id,
        kind: p.type === "track" ? "spotify" : "collection",
        spotifyType: p.type,
        spotifyId: p.id,
        title: kindName,
        artist: "Spotify", album: "", artwork: "", duration: 0
      };
      // Tente d'approfondir via la passerelle
      if (p.type !== "track" && await this.getGateway()) {
        const data = await (p.type === "album" ? this.album(p.id) : this.playlist(p.id));
        if (data) {
          const meta = data.album || data.playlist;
          if (meta) { t.title = meta.title; t.artwork = meta.cover || meta.artwork; }
        }
      }
      this.upsert(t);
      return t;
    },

    /* ---------- Aperçus iTunes ---------- */
    isPreviewSaved(itunesId) { return this.tracks.some(t => t.id === "it_" + itunesId); },
    savePreview(r) {
      return this.upsert({
        id: "it_" + r.id, kind: "preview",
        title: r.title, artist: r.artist, album: r.album,
        artwork: r.artwork, url: r.previewUrl, duration: 30,
        lastPlayed: 0
      });
    },
    async searchItunes(term, limit = 30) {
      const url = "https://itunes.apple.com/search?media=music&limit=" + limit + "&term=" + encodeURIComponent(term);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Recherche impossible");
      const data = await res.json();
      return (data.results || []).filter(r => r.previewUrl).map(r => ({
        id: r.trackId,
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName || "",
        artwork: (r.artworkUrl100 || "").replace(/100x100/, "300x300"),
        previewUrl: r.previewUrl
      }));
    }
  };

  window.Library = Library;
  Library.load();
})();
