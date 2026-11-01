/* =========================================================
   player.js — Lecteur audio + Media Session API
   → Permet la lecture en arrière-plan et l'écran VERROUILLÉ
     (boutons play/pause/next + pochette sur l'écran de verrouillage)
   ========================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const audio = $("audio");

  const Player = {
    queue: [],
    index: -1,
    current: null,
    /** URL objet du blob local courant, à révoquer. */
    _blobURL: null,

    get track() {
      return this.queue[this.index] || null;
    },

    /* ---------- Contrôle ---------- */
    play(track, queue) {
      if (queue) this.queue = queue;
      const i = this.queue.findIndex(t => t.id === track.id);
      if (i >= 0) this.index = i;
      else { this.queue = [track]; this.index = 0; }
      this._load(track);
    },

    togglePlay() {
      if (this.current && this.current.kind === "spotify") return; // l'iframe gère ça
      if (audio.paused) { if (audio.src) audio.play(); }
      else audio.pause();
    },

    next() { this._skip(1); },
    prev() { this._skip(-1); },

    _skip(dir) {
      if (!this.queue.length) return;
      this.index = (this.index + dir + this.queue.length) % this.queue.length;
      this._load(this.track);
    },

    seek(fraction) {
      if (audio.duration && isFinite(audio.duration)) {
        audio.currentTime = fraction * audio.duration;
      }
    },

    /* ---------- Chargement d'une piste ---------- */
    async _load(track) {
      this.current = track;
      if (this._blobURL) { URL.revokeObjectURL(this._blobURL); this._blobURL = null; }
      if (track.kind === "spotify") return this._loadSpotify(track);
      audio.hidden = false;

      if (track.kind === "local") {
        const blob = await Library.getBlob(track.id);
        if (!blob) {
          if (window.App) App.toast("Fichier introuvable — réimporte cette piste");
          return;
        }
        this._blobURL = URL.createObjectURL(blob);
        audio.src = this._blobURL;
      } else {
        audio.src = track.url;
      }
      audio.play().catch(() => { /* lecture bloquée jusqu'à interaction utilisateur */ });
      this._setMediaSession(track);
    },

    _loadSpotify(track) {
      // Spotify officiel : on montre l'iframe embed (aucun compte requis).
      audio.pause();
      audio.removeAttribute("src");
      $("pf-embed").hidden = false;
      $("pf-embed").innerHTML =
        `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/${track.spotifyType}/${track.spotifyId}?theme=0"
          width="100%" height="352" frameBorder="0" allow="encrypted-media;"
          title="${track.title}"></iframe>`;
      const note = "Lecture via le lecteur officiel Spotify. " +
        "Les commandes d'écran verrouillé physiques restent prises en charge par " +
        "l'app Spotify ou l'app installée SpotifyGratuit pour tes fichiers.";
      $("pf-note").textContent = note;
      $("pf-progress-row").hidden = true;
      this._setMediaSessionEmpty(track);
      if (window.App) App.updatePlayerUI();
    },

    _setMediaSession(track) {
      if (!("mediaSession" in navigator)) return;
      $("pf-progress-row").hidden = false;
      $("pf-note").textContent = "";
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || "",
        artwork: [
          { src: track.artwork || "./icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: track.artwork || "./icons/icon-192.png", sizes: "192x192", type: "image/png" }
        ]
      });
      this._setHandlers();
    },

    _setMediaSessionEmpty(track) {
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title, artist: track.artist, album: "", artwork: []
      });
      this._setHandlers();
    },

    _setHandlers() {
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.setActionHandler("play", () => {
        if (this.current && this.current.kind === "spotify") return;
        audio.play(); navigator.mediaSession.playbackState = "playing";
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        if (this.current && this.current.kind === "spotify") return;
        audio.pause(); navigator.mediaSession.playbackState = "paused";
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.prev());
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) audio.currentTime = d.seekTime;
      });
      navigator.mediaSession.setActionHandler("stop", () => { audio.pause(); });
    },

    /* ---------- Formatage ---------- */
    fmt(s) {
      if (!isFinite(s)) return "0:00";
      const m = Math.floor(s / 60), r = Math.floor(s % 60);
      return m + ":" + String(r).padStart(2, "0");
    }
  };

  /* ---------- Événements audio → maj de l'UI + Media Session ---------- */
  audio.addEventListener("timeupdate", () => {
    if (window.App) App.updateProgress();
  });
  audio.addEventListener("loadedmetadata", () => { if (window.App) App.updateProgress(); });
  ["play", "pause"].forEach(ev => audio.addEventListener(ev, () => {
    if (window.App) App.updatePlayerUI();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = ev === "play" ? "playing" : "paused";
    }
  }));
  audio.addEventListener("ended", () => Player.next());
  audio.addEventListener("error", () => {
    if (Player.current && Player.current.kind !== "spotify" && window.App) {
      App.toast("Lecture impossible : " + Player.current.title);
    }
  });

  window.Player = Player;
})();
