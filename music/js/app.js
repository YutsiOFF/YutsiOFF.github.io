/* =========================================================
   app.js — Navigation, rendu des vues, installation PWA
   ========================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const App = {
    deferredPrompt: null,
    _lastSavedResults: [],

    init() {
      this.bindNav();
      this.bindSearch();
      this.bindPlayerUI();
      this.bindInstall();
      this.registerSW();
      this.applyTheme(localStorage.getItem("sg:theme") || "dark");
      this.onLibraryChange();
    },

    /* ================= Navigation ================= */
    go(view) {
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      $("view-" + view).classList.add("active");
      document.querySelectorAll(".nav-btn").forEach(b =>
        b.classList.toggle("active", b.dataset.view === view));
      $("main").scrollTop = 0;
      if (view === "library" || view === "home") this.renderLibraryViews();
    },

    bindNav() {
      document.querySelectorAll(".nav-btn").forEach(btn =>
        btn.addEventListener("click", () => this.go(btn.dataset.view)));
      document.querySelectorAll("[data-action=go-search]").forEach(b =>
        b.addEventListener("click", () => this.go("search")));
      document.querySelectorAll("[data-action=go-import]").forEach(b =>
        b.addEventListener("click", () => { this.go("library"); $("file-input").click(); }));
      document.querySelectorAll("[data-action=import-files]").forEach(b =>
        b.addEventListener("click", () => $("file-input").click()));
      document.querySelectorAll("[data-action=go-addlink], [data-action=add-link]").forEach(b =>
        b.addEventListener("click", () => this.promptSpotifyLink()));
      document.querySelector("[data-action=open-player]").addEventListener("click", () => this.openPlayer());
    },

    /* ================= Bibliothèque ================= */
    onLibraryChange() {
      this.renderLibraryViews();
      document.getElementById("library-empty").hidden = Library.tracks.length > 0;
    },

    renderLibraryViews() {
      const tracks = Library.tracks;
      const recent = [...tracks].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)).slice(0, 8);

      // Accueil
      $("home-recent-title").hidden = recent.filter(t => t.lastPlayed).length === 0;
      this.renderGrid($("home-recent"), recent.filter(t => t.lastPlayed));
      this.renderGrid($("home-library"), tracks.slice(0, 12));

      // Bibliothèque (liste)
      const list = $("library-list");
      list.innerHTML = "";
      tracks.forEach(t => list.appendChild(this.renderItem(t)));
      $("library-empty").hidden = tracks.length > 0;
    },

    kindBadge(t) {
      return { local: "📄 local", preview: "▶ gratuit", spotify: "Spotify" }[t.kind] || t.kind;
    },

    renderGrid(el, tracks) {
      el.innerHTML = "";
      tracks.forEach(t => {
        const card = document.createElement("div");
        card.className = "track-card";
        card.innerHTML = `
          ${t.artwork
            ? `<img src="${t.artwork}" alt="" loading="lazy">`
            : `<div class="art-ph">🎵</div>`}
          <div class="t-title">${escapeHtml(t.title)}</div>
          <div class="t-artist">${escapeHtml(t.artist)}</div>
          <div class="card-actions">
            <button class="icon-btn" data-del title="Retirer de la bibliothèque">🗑</button>
          </div>`;
        card.addEventListener("click", (e) => {
          if (e.target.closest("[data-del]")) { Library.remove(t.id); return; }
          this.playTrack(t);
        });
        el.appendChild(card);
      });
    },

    renderItem(t) {
      const li = document.createElement("li");
      li.className = "track-item";
      li.innerHTML = `
        ${t.artwork
          ? `<img src="${t.artwork}" alt="" loading="lazy">`
          : `<div class="art-ph">🎵</div>`}
        <div style="min-width:0">
          <div class="t-title">${escapeHtml(t.title)}</div>
          <div class="t-artist">${escapeHtml(t.artist)}</div>
        </div>
        <div class="item-actions">
          <span class="badge ${t.kind === "spotify" ? "spotify" : ""}">${this.kindBadge(t)}</span>
          <button class="icon-btn" data-del title="Retirer">🗑</button>
        </div>`;
      li.addEventListener("click", (e) => {
        if (e.target.closest("[data-del]")) { Library.remove(t.id); return; }
        this.playTrack(t);
      });
      return li;
    },

    /* ================= Recherche iTunes ================= */
    bindSearch() {
      const input = $("search-input");
      let timer = null;
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.doSearch(), 400);
      });
    },

    async doSearch() {
      const term = $("search-input").value.trim();
      if (!term) { $("search-empty").hidden = false; $("search-results").innerHTML = ""; return; }
      $("search-empty").hidden = true;
      $("search-results").innerHTML = `<div class="empty-msg">Recherche en cours…</div>`;
      let combined = [];
      // 1) Passerelle SpotAPI (si le serveur local tourne)
      const gw = await Library.searchSpotify(term, 20).catch(() => null);
      if (gw && gw.length) combined = gw;
      // 2) Aperçus iTunes gratuits en secours / en plus
      try {
        const itunes = await Library.searchItunes(term);
        const have = new Set(combined.map(t => t.title.toLowerCase()));
        combined = combined.concat(itunes.filter(r => !have.has(r.title.toLowerCase())));
      } catch {}
      $("search-results").innerHTML = "";
      combined.forEach(r => $("search-results").appendChild(this.renderSearchCard(r)));
      if (!combined.length) {
        $("search-results").innerHTML = `<p class="empty-msg">Aucun résultat — vérifie ta connexion web et que la passerelle est démarrée.</p>`;
      }
    },

    renderSearchCard(r) {
      const card = document.createElement("div");
      card.className = "track-card";
      const isSpotify = r.kind === "spotify";
      const saved = isSpotify
        ? !!Library.get(r.id) || Library.tracks.some(t => t.id === r.id)
        : Library.isPreviewSaved(r.id);
      card.innerHTML = `
        ${r.artwork
          ? `<img src="${r.artwork}" alt="" loading="lazy">`
          : `<div class="art-ph">${isSpotify ? "🟢" : "🎵"}</div>`}
        <div class="t-title">${escapeHtml(r.title)}</div>
        <div class="t-artist">${escapeHtml(r.artist)}</div>
        <div class="card-actions">
          <button class="icon-btn" data-lib title="${saved ? "Déjà enregistré" : "Enregistrer"}">${saved ? "✓" : "＋"}</button>
        </div>`;
      card.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-lib]");
        if (btn) {
          if (isSpotify) {
            if (!Library.get(r.id)) { Library.tracks.push(r); Library.save(); this.toast("Enregistré ✓"); }
            else this.toast("Déjà dans ta bibliothèque");
          } else {
            if (!Library.isPreviewSaved(r.id)) { Library.savePreview(r); this.toast("Enregistré ✓"); }
            else this.toast("Déjà dans ta bibliothèque");
          }
          return;
        }
        if (isSpotify) {
          if (!Library.tracks.some(t => t.id === r.id)) { Library.tracks.push({ ...r }); Library.save(); }
          this.playTrack({ ...r });
        } else {
          this.playTrack({ id: "it_" + r.id, kind: "preview", ...r });
        }
      });
      return card;
    },

    /* ================= Ajout lien Spotify ================= */
    async promptSpotifyLink() {
      const link = prompt("Colle un / des liens Spotify (titre, album ou playlist), un par ligne :\nEx : https://open.spotify.com/track/…");
      if (!link) return;
      const lines = link.split(/\s+/).filter(Boolean);
      let ok = 0, ko = 0;
      for (const line of lines) {
        try { await Library.addSpotifyLink(line); ok++; }
        catch { ko++; }
      }
      this.toast(ok + " ajouté(s)" + (ko ? " • " + ko + " lien(s) invalide(s)" : ""));
      this.go("library");
    },

    /* ================= Lecteur ================= */
    playTrack(t, queue) {
      if (t.lastPlayed === undefined) t.lastPlayed = 0;
      Player.play(t, queue
        ? queue.map(q => ({ ...q }))
        : Library.tracks.some(x => x.id === t.id)
          ? [...Library.tracks]
          : [{ ...t, lastPlayed: 0 }]);
      this.openPlayer();
      const stored = Library.get(t.id);
      if (stored) { stored.lastPlayed = Date.now(); Library.save(); }
    },

    openPlayer() { $("player-full").hidden = false; this.updatePlayerUI(); this.updateProgress(); },
    closePlayer() { $("player-full").hidden = true; },

    bindPlayerUI() {
      $("player-close").addEventListener("click", () => this.closePlayer());
      $("pf-play").addEventListener("click", () => Player.togglePlay());
      $("mini-play").addEventListener("click", () => Player.togglePlay());
      $("pf-next").addEventListener("click", () => Player.next());
      $("mini-next").addEventListener("click", () => Player.next());
      $("pf-prev").addEventListener("click", () => Player.prev());
      $("pf-seek").addEventListener("input", (e) => Player.seek(e.target.value / 1000));
      $("btn-theme-toggle").addEventListener("click", () => {
        this.applyTheme(document.body.dataset.theme === "light" ? "dark" : "light");
      });
      const fi = $("file-input");
      fi.addEventListener("change", async () => {
        const added = await Library.addLocalFiles(fi.files);
        this.toast(added.length + " fichier(s) importé(s)");
        fi.value = "";
      });
      // Drag & drop sur toute la fenêtre
      window.addEventListener("dragover", e => e.preventDefault());
      window.addEventListener("drop", async (e) => {
        e.preventDefault();
        const files = [...e.dataTransfer.files];
        const added = await Library.addLocalFiles(files);
        this.toast(added.length + " fichier(s) importé(s)");
      });
    },

    updatePlayerUI() {
      const t = Player.track;
      const mini = $("mini-player");
      mini.hidden = !t;
      if (t) {
        $("mini-title").textContent = t.title;
        $("mini-artist").textContent = t.artist;
        $("mini-art").src = t.artwork || "./icons/icon-192.png";
        $("pf-title").textContent = t.title;
        $("pf-artist").textContent = t.artist;
        $("pf-art").src = t.artwork || "./icons/icon-512.png";
        $("pf-embed").hidden = !(Player.current && Player.current.kind === "spotify");
        $("pf-note").textContent = t.kind === "spotify"
          ? "Lecture via le lecteur officiel Spotify (iframe)."
          : "";
        $("pf-progress-row").hidden = t.kind === "spotify";
        if (t.kind === "spotify") $("pf-embed").innerHTML =
          `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/${t.spotifyType}/${t.spotifyId}?theme=0"
            width="100%" height="352" frameBorder="0" allow="encrypted-media;"></iframe>`;
      }
      const isPlaying = !$("audio").paused;
      $("pf-play").textContent = t && t.kind === "spotify" ? "🎧" : (isPlaying ? "⏸" : "▶");
      $("mini-play").textContent = isPlaying ? "⏸" : "▶";
    },

    updateProgress() {
      const a = $("audio");
      if (a.duration && isFinite(a.duration)) {
        $("pf-seek").value = Math.round((a.currentTime / a.duration) * 1000);
        $("pf-cur").textContent = Player.fmt(a.currentTime);
        $("pf-dur").textContent = Player.fmt(a.duration);
      }
    },

    /* ================= Thème ================= */
    applyTheme(mode) {
      document.body.dataset.theme = mode;
      document.documentElement.dataset.theme = mode;
      $("btn-theme-toggle").textContent = mode === "light" ? "☀️" : "🌙";
      localStorage.setItem("sg:theme", mode);
      const meta = document.querySelector('meta[name=theme-color]');
      if (meta) meta.content = mode === "light" ? "#f5f5f7" : "#121212";
    },

    /* ================= Installation PWA ================= */
    bindInstall() {
      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        this.deferredPrompt = e;
        $("btn-install").hidden = false;
      });
      $("btn-install").addEventListener("click", async () => {
        if (!this.deferredPrompt) { this.showManualInstallHelp(); return; }
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === "accepted") { this.hideInstallBtn(); this.toast("App installée 🎉"); }
        this.deferredPrompt = null;
      });
    },

    hideInstallBtn() { $("btn-install").hidden = true; },

    showManualInstallHelp() {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      alert(isIOS
        ? "Sur iPhone/iPad (Safari) :\n1. Appuie sur le bouton Partager ⎋\n2. « Sur l'écran d'accueil »\n3. « Ajouter »"
        : "Sur PC : clique sur l'icône d'installation dans la barre d'adresse du navigateur.\n\nSur Android (Chrome) : menu ⋮ → « Installer l'application » / « Ajouter à l'écran d'accueil ».");
    },

    /* ================= Service Worker ================= */
    registerSW() {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      }
    },

    /* ================= Toast ================= */
    toast(msg) {
      const existing = document.querySelector(".toast");
      if (existing) existing.remove();
      const el = document.createElement("div");
      el.className = "toast";
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    }
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.App = App;
  document.addEventListener("DOMContentLoaded", () => App.init());
})();
