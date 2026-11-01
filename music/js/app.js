/* =========================================================
   app.js — Routeur + rendu de toutes les vues
   #/home  #/search  #/catalog  #/library
   #/playlist/:id  #/album/:id  #/artist/:id
   ========================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmtDur = (s) => (!s || !isFinite(s)) ? "—" :
    Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
  const fmtNum = (n) => (!n || !isFinite(n)) ? "—" :
    n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + " M" :
    n >= 1e3 ? (n / 1e3).toFixed(1).replace(".0", "") + " k" : String(n);

  const App = {
    deferredPrompt: null,
    currentView: "home",

    /* ============ Routage ============ */
    handleRoute() {
      const h = (location.hash || "#/home").slice(2);
      const [view, ...args] = h.split("/");
      App.currentView = view;
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      document.querySelectorAll(".nav-btn").forEach(b =>
        b.classList.toggle("active", b.dataset.view === view));
      const el = $("view-" + view) || $("view-home");
      el.classList.add("active");
      $("main").scrollTop = 0;
      const routes = { home: this.home.bind(this), search: this.search.bind(this), catalog: this.catalog.bind(this), library: this.library.bind(this), playlist: this.playlist.bind(this), album: this.album.bind(this), artist: this.artist.bind(this) };
      (routes[view] || routes.home)(args);
    },

    /* ============ Vues ============ */
    async home() {
      const v = $("view-home");
      const ready = Library.gatewayReady || Library.getGateway();
      const gw = await ready;
      if (!gw) return this.homeOffline();
      const data = await Library.home();
      if (!data) return this.homeOffline();
      {
        // Hero : première playlist mise en avant
        const hero = data.featured[0];
        const c1 = data.featured[1] || hero;
        if (hero) {
          $("hero").hidden = false;
          $("hero").style.setProperty("--hero-img", `url("${hero.artwork}")`);
          $("hero").innerHTML = `
            <div class="hero-tag">🎵 Playlist du moment</div>
            <h2>${esc(hero.title)}</h2>
            <p>${fmtNum(hero.followers)} abonnés ${data.trending[0] ? `• #1 « ${esc(data.trending[0].artist)} »` : ""}</p>
            <button class="btn btn-primary btn-lg" data-hero="${hero.playlistId}">▶ Lecture</button>`;
          $("hero").querySelector("[data-hero]").addEventListener("click", () =>
            this.openPlaylist(hero.playlistId));
        }
      }
      // Tendances
      this.fillRow("row-trending", (data.trending || []).map(t => this.trackCard(t, data.trending)));
      // Playlists populaires
      this.fillRow("row-playlists", (data.featured || []).map(p => this.playlistCard(p, data.featured)));
      // Genres
      const genres = await Library.genres();
      $("genres").innerHTML = "";
      (genres || []).forEach(g => {
        const b = document.createElement("button");
        b.className = "chip";
        b.textContent = g.name;
        b.addEventListener("click", () => { location.hash = "#/playlist/" + g.playlistId; });
        $("genres").appendChild(b);
      });
      // Bibliothèque
      const lib = [...Library.tracks].filter(t => t.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 10);
      $("lib-row").innerHTML = "";
      this.fillRow("lib-row", lib.map(t => this.trackCard(t, lib)));
      $("home-lib-title").hidden = lib.length === 0;
    },

    homeOffline() {
      $("hero").hidden = true;
      $("row-trending").innerHTML = "";
      $("row-playlists").innerHTML = "";
      $("genres").innerHTML = "";
      $("offline-banner").hidden = false;
    },

    /* ---------- Catalogue (toutes les playlists par genre) ---------- */
    async catalog() {
      const v = $("view-catalog");
      const grid = $("catalog-grid");
      v.querySelector("[data-catalog-loader]").hidden = true;
      grid.innerHTML = "";
      const genres = await Library.genres();
      if (!genres || !genres.length) {
        grid.innerHTML = `<p class="empty-msg">Catalogue indisponible — démarre la passerelle SpotAPI :
          <code>powershell -File server\\start-gateway.ps1</code></p>`;
        return;
      }
      genres.forEach((g, i) => {
        const tile = document.createElement("div");
        tile.className = "genre-tile";
        const hue = (i * 47) % 360;
        tile.style.background = `linear-gradient(135deg, hsl(${hue} 65% 30%), hsl(${(hue + 80) % 360} 65% 20%))`;
        tile.innerHTML = `<span>${esc(g.name)}</span>`;
        tile.addEventListener("click", () => { location.hash = "#/playlist/" + g.playlistId; });
        grid.appendChild(tile);
      });
    },

    /* ---------- Recherche ---------- */
    async search(args) {
      const box = $("search-input");
      if ((args[0] || "") && box.value === "") box.value = decodeURIComponent(args[0]);
      if (box.value.trim()) this.doSearch();
      setTimeout(() => box.focus(), 200);
    },

    async doSearch() {
      App.currentView = "search";
      const term = $("search-input").value.trim();
      const el = $("search-results");
      if (!term) { el.innerHTML = ""; $("search-empty").hidden = false; return; }
      $("search-empty").hidden = true;
      el.innerHTML = `<div class="loader"></div>`;
      const gwData = await Library.searchAll(term);
      let html = "";
      if (gwData && gwData.artists.length) {
        html += `<h3 class="row-title">Artistes</h3>
          <div class="scroll-row" id="s-artists"></div>`;
      }
      if (gwData && gwData.tracks.length) {
        html += `<h3 class="row-title">Titres</h3>
          <div class="scroll-row" id="s-tracks"></div>`;
      }
      let previews = [];
      try { previews = await Library.searchItunes(term, 12); } catch {}
      if (previews.length) {
        html += `<h3 class="row-title">Extraits gratuits (iTunes)</h3>
          <div class="scroll-row" id="s-previews"></div>`;
      }
      if (!html) html = `<p class="empty-msg">Aucun résultat pour « ${esc(term)} » ${!gwData ? "<br><small>Tu peux démarrer la passerelle sound local pour le catalogue Spotify.</small>" : ""}</p>`;
      el.innerHTML = html;
      if (gwData) {
        this.fillRow("s-artists", gwData.artists.map(a => this.artistCard(a)));
        // queue = uniquement les titres Spotify pour next/prev propre
        const queue = gwData.tracks;
        this.fillRow("s-tracks", queue.map(t => this.trackCard(t, queue)));
      }
      this.fillRow("s-previews", previews.map(r => this.previewCard(r)));
    },

    /* ---------- Bibliothèque ---------- */
    library() {
      const tracks = Library.tracks;
      const list = $("library-list");
      list.innerHTML = "";
      tracks.forEach(t => list.appendChild(this.trackRow(t, tracks, true)));
      $("library-empty").hidden = tracks.length > 0;
      this.bindLibraryActions();
    },

    bindLibraryActions() {
      const fi = $("file-input");
      if (fi) fi.addEventListener("change", async () => {
        const added = await Library.addLocalFiles(fi.files);
        this.toast(added.length + " fichier(s) importé(s)");
        fi.value = "";
        this.library();
      }, { once: true });
    },

    /* ---------- Playlist ---------- */
    async playlist(args) {
      const id = args[0];
      const v = $("view-playlist");
      v.innerHTML = `<div class="loader"></div>`;
      const data = await Library.playlist(id);
      if (!data) { v.innerHTML = `<p class="empty-msg">Playlist indisponible ${!Library.gatewayReady ? "— lance la <strong>passerelle SpotAPI</strong> (server/start-gateway.ps1)" : ""}</p>`; return; }
      const p = data.playlist;
      v.innerHTML = `
        <div class="detail-hero" style="--hero-img:url('${p.artwork}')">
          <div class="tag">PLAYLIST</div>
          <h1>${esc(p.title)}</h1>
          <p>${esc(p.description || "")}${p.owner ? " — par " + esc(p.owner) : ""}</p>
          <p class="muted">${fmtNum(p.followers)} abonnés • ${p.trackCount || data.tracks.length} pistes</p>
          <div class="detail-actions">
            <button class="btn btn-primary" id="pl-play">▶ Tout écouter</button>
            <a class="btn btn-ghost" target="_blank" rel="noopener"
               href="https://open.spotify.com/playlist/${p.spotifyId}">Spotify ↗</a>
          </div>
        </div>
        <ul class="track-list" id="pl-tracks"></ul>`;
      const list = v.querySelector("#pl-tracks");
      const queue = data.tracks.map(t => Library.toTrack(t));
      data.tracks.forEach((t, i) => list.appendChild(this.trackRow(queue[i], queue)));
      v.querySelector("#pl-play").addEventListener("click", () => this.playTrack(queue[0], queue));
    },

    /* ---------- Album ---------- */
    async album(args) {
      const id = args[0];
      const v = $("view-album");
      v.innerHTML = `<div class="loader"></div>`;
      const data = await Library.album(id);
      if (!data) { v.innerHTML = `<p class="empty-msg">Album indisponible${!Library.gatewayReady ? " — passerelle SpotAPI requise" : ""}</p>`; return; }
      const a = data.album;
      v.innerHTML = `
        <div class="detail-hero" style="--hero-img:url('${a.cover}')">
          <div class="tag">ALBUM</div>
          <h1>${esc(a.title)}</h1>
          ${a.artists && a.artists[0] ? `<a class="artist-link" href="#/artist/${a.artists[0][1]}">${esc(a.artist)}</a>` : ""}
          <p class="muted">${a.date || ""}${a.label ? " • " + esc(a.label) : ""} • ${data.tracks.length} pistes</p>
          <div class="detail-actions">
            <button class="btn btn-primary" id="al-play">▶ Lire</button>
            <a class="btn btn-ghost" target="_blank" rel="noopener"
               href="https://open.spotify.com/album/${a.spotifyId}">Spotify ↗</a>
          </div>
        </div>
        <ul class="track-list" id="al-tracks"></ul>`;
      const list = v.querySelector("#al-tracks");
      const queue = data.tracks.map((t, i) => ({
        ...Library.toTrack(t),
        index: i + 1,
        playcount: t.playcount,
        cover: a.cover
      }));
      data.tracks.forEach((t, i) => list.appendChild(this.trackRow(queue[i], queue)));
      v.querySelector("#al-play").addEventListener("click", () => this.playTrack(queue[0], queue));
    },

    /* ---------- Artiste ---------- */
    async artist(args) {
      const id = args[0];
      const v = $("view-artist");
      v.innerHTML = `<div class="loader"></div>`;
      const data = await Library.artist(id);
      if (!data) { v.innerHTML = `<p class="empty-msg">Artiste indisponible${!Library.gatewayReady ? " — passerelle SpotAPI requise" : ""}</p>`; return; }
      const A = data.artist;
      v.innerHTML = `
        <div class="artist-hero" style="--hero-img:url('${A.header}')">
          ${A.header ? `<img class="artist-header" src="${A.header}" alt="" loading="lazy">` : ""}
          <div class="artist-head-txt">
            <div class="tag">ARTISTE</div>
            <h1>${esc(A.title)}</h1>
            <p>${A.monthlyListeners ? fmtNum(A.monthlyListeners) + " auditeurs par mois • " : ""}${fmtNum(A.followers)} abonnés${A.worldRank ? ` • #${fmtNum(A.worldRank)} mondial` : ""}</p>
            ${A.bio ? `<p class="artist-bio">${esc(A.bio.slice(0, 260))}${A.bio.length > 260 ? "…" : ""}</p>` : ""}
            <a class="btn btn-ghost" target="_blank" rel="noopener"
               href="https://open.spotify.com/artist/${A.spotifyId}">Spotify ↗</a>
          </div>
        </div>
        <h3 class="row-title">Discographie</h3><div class="scroll-row" id="dv-albums"></div>
        <h3 class="row-title">Singles & EP</h3><div class="scroll-row" id="dv-singles"></div>
        <h3 class="row-title">Les fans aiment aussi</h3><div class="scroll-row" id="dv-related"></div>`;
      this.fillRow("dv-albums", (data.discography.albums || []).map(al => this.albumCard(al)));
      this.fillRow("dv-singles", (data.discography.singles || []).map(al => this.albumCard(al)));
      this.fillRow("dv-related", (data.related || []).map(x => this.artistCard(x)));
      // "see all"albums
      const seeAll = document.createElement("button");
      seeAll.className = "see-all";
      seeAll.textContent = "Tout voir";
      seeAll.addEventListener("click", async () => {
        const more = await Library.artistDiscography(id, "albums");
        if (more) this.fillRow("dv-albums", more.releases.map(al => this.albumCard(al)));
        seeAll.remove();
      });
      v.querySelector("#dv-albums").before(seeAll);
    },

    /* ---------- Spinners ---------- */
    showLoader(msg = "") {
      document.querySelectorAll(".view.active")[0].innerHTML = `<div class="loader"></div>${msg}`;
    },

    /* ============ Composants ============ */
    fillRow(id, nodes) {
      const el = $(id);
      if (!el) return;
      el.innerHTML = "";
      nodes.forEach(n => el.appendChild(n));
      el.hidden = nodes.length === 0;
    },

    playlistCard(p, contextList) {
      const el = document.createElement("div");
      el.className = "card playlist-card";
      el.innerHTML = `
        ${p.artwork ? `<img src="${p.artwork}" alt="" loading="lazy">` : `<div class="art-ph">🎧</div>`}
        <div class="t-title">${esc(p.title)}</div>
        <div class="t-sub">${fmtNum(p.followers)} abonnés</div>
        <button class="play-fab" data-play>▶</button>`;
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-play]")) { this.openPlaylist(p.playlistId, true); return; }
        this.openPlaylist(p.playlistId);
      });
      return el;
    },

    albumCard(al) {
      const el = document.createElement("div");
      el.className = "card playlist-card";
      el.innerHTML = `
        ${al.artwork ? `<img src="${al.artwork}" alt="" loading="lazy">` : `<div class="art-ph">💿</div>`}
        <div class="t-title">${esc(al.title)}</div>
        <div class="t-sub">${(al.type === "single" ? "Single • " : "") + (al.date ? al.date.slice(0, 4) : "")}</div>
        <button class="play-fab" data-play>▶</button>`;
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-play]")) { location.hash = "#/album/" + al.spotifyId; App.playAlbum(al.spotifyId); }
        else location.hash = "#/album/" + al.spotifyId;
      });
      return el;
    },

    artistCard(a) {
      const el = document.createElement("div");
      el.className = "card artist-card";
      el.innerHTML = `
        ${a.artwork ? `<img src="${a.artwork}" alt="" loading="lazy">` : `<div class="art-ph round">🎤</div>`}
        <div class="t-title">${esc(a.title)}</div>
        <div class="t-sub">Artiste</div>`;
      el.addEventListener("click", () => { location.hash = "#/artist/" + a.spotifyId; });
      return el;
    },

    trackCard(t, queue) {
      const el = document.createElement("div");
      el.className = "card track-card";
      const saved = Library.get(t.id);
      el.innerHTML = `
        ${t.artwork ? `<img src="${t.artwork}" alt="" loading="lazy">` : `<div class="art-ph">🎵</div>`}
        <div class="t-title">${esc(t.title)}</div>
        <div class="t-sub">${esc(t.artist)}</div>
        <button class="play-fab" data-play>▶</button>
        <button class="card-plus" data-plus title="Enregistrer">${saved ? "✓" : "＋"}</button>`;
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-plus]")) { this.saveTrack(t); return; }
        this.playTrack(t, queue);
      });
      return el;
    },

    previewCard(r) {
      const el = document.createElement("div");
      el.className = "card track-card";
      const saved = Library.isPreviewSaved(r.id);
      el.innerHTML = `
        <img src="${r.artwork}" alt="" loading="lazy">
        <div class="t-title">${esc(r.title)}</div>
        <div class="t-sub">${esc(r.artist)} • extrait 30 s</div>
        <button class="play-fab" data-play>▶</button>
        <button class="card-plus" data-plus title="Enregistrer">${saved ? "✓" : "＋"}</button>`;
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-plus]")) { this.savePreview(r); return; }
        this.playTrack({ id: "it_" + r.id, kind: "preview", ...r });
      });
      return el;
    },

    trackRow(t, queue, isLibrary = false) {
      const li = document.createElement("li");
      li.className = "track-item";
      const badge = { local: "local", preview: "extrait", spotify: "spotify", collection: "playlist" }[t.kind];
      const saved = t.kind === "spotify" ? !!Library.get(t.id) : true;
      li.innerHTML = `
        ${t.artwork ? `<img src="${t.artwork}" alt="" loading="lazy">` : `<div class="art-ph">🎵</div>`}
        <div class="track-item-body">
          <div class="t-title">${esc(t.title)}</div>
          <div class="t-sub">${esc(t.artist)}${t.index ? " • " + t.index : ""}${t.playcount ? " • " + fmtNum(+t.playcount) + " écoutes" : ""}</div>
        </div>
        ${t.duration && t.kind !== "spotify" ? `<span class="muted dur">${fmtDur(t.duration)}</span>` : ""}
        <span class="badge ${t.kind === "spotify" ? "spotify" : ""}">${badge}</span>
        ${t.kind === "spotify" && !isLibrary ? `<button class="icon-btn" data-plus title="Enregistrer">${saved ? "✓" : "＋"}</button>` : ""}
        ${isLibrary ? `<button class="icon-btn" data-del title="Retirer">🗑</button>` : ""}`;
      const savedAlready = () => Library.get(t.id);
      li.addEventListener("click", async (e) => {
        const del = e.target.closest("[data-del]");
        if (del) { await Library.remove(t.id); this.library(); return; }
        if (e.target.closest("[data-plus]")) {
          this.saveTrack(t, li);
          return;
        }
        this.playTrack(t, queue);
      });
      return li;
    },

    saveTrack(t, li) {
      if (!Library.get(t.id)) {
        Library.upsert({ ...t, addedAt: Date.now() });
        this.toast("Enregistré ✓");
        if (li) li.querySelector("[data-plus]").textContent = "✓";
      } else this.toast("Déjà dans ta bibliothèque");
    },

    savePreview(r) {
      if (!Library.isPreviewSaved(r.id)) { Library.savePreview(r); this.toast("Enregistré ✓"); }
    },

    /* ============ Lecture ============ */
    openPlaylist(id, autoplay) {
      location.hash = "#/playlist/" + id;
    },

    async playAlbum(id) {
      const data = await Library.album(id);
      if (data && data.tracks.length) {
        const queue = data.tracks.map((t, i) => ({ ...Library.toTrack(t), index: i + 1 }));
        this.playTrack(queue[0], queue);
      }
    },

    playTrack(t, queue) {
      Player.play(t, queue ? queue.map(x => ({ ...x })) : this.queueFromTrack(t));
      this.openPlayer();
      const stored = Library.get(t.id);
      if (stored) { stored.lastPlayed = Date.now(); Library.save(); }
    },

    queueFromTrack(t) {
      const q = Library.tracks.filter(x => x.kind !== "collection");
      if (q.some(x => x.id === t.id)) return [...q];
      return [{ ...t, lastPlayed: 0 }];
    },

    openPlayer() { $("player-full").hidden = false; this.updatePlayerUI(); this.updateProgress(); },
    closePlayer() { $("player-full").hidden = true; },

    updatePlayerUI() {
      const t = Player.track;
      $("mini-player").hidden = !t;
      if (!t) return;
      $("mini-title").textContent = t.title;
      $("mini-artist").textContent = t.artist;
      $("mini-art").src = t.artwork || "./icons/icon-192.png";
      $("pf-title").textContent = t.title;
      $("pf-artist").textContent = t.artist;
      $("pf-art").src = t.artwork || "./icons/icon-512.png";
      const isSp = t.kind === "spotify";
      $("pf-embed").hidden = !isSp;
      $("pf-progress-row").hidden = isSp;
      $("pf-note").textContent = isSp
        ? "Lecture via le lecteur officiel Spotify 🎧"
        : "";
      if (isSp && Player.current && Player.current.id === t.id) {
        $("pf-embed").innerHTML =
          `<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/${t.spotifyId}?theme=0"
            width="100%" height="352" frameBorder="0" allow="encrypted-media;"></iframe>`;
      }
      const isPlaying = !$("audio").paused;
      $("pf-play").textContent = isSp ? "🎧" : (isPlaying ? "⏸" : "▶");
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

    /* ============ Statut passerelle ============ */
    gatewayStatus(ok) {
      const dot = $("gw-dot");
      if (dot) {
        dot.className = "dot " + (ok ? "on" : "off");
        dot.title = ok ? "Passerelle SpotAPI connectée — catalogue complet"
                       : "Passerelle SpotAPI éteinte — catalogue Spotify indisponible";
      }
      const banner = $("offline-banner");
      if (banner) banner.hidden = ok;
    },

    /* ============ Boot ============ */
    init() {
      window.addEventListener("hashchange", () => this.handleRoute());
      this.bindNav();
      this.bindSearch();
      this.bindPlayerUI();
      this.bindInstall();
      this.registerSW();
      this.applyTheme(localStorage.getItem("sg:theme") || "dark");
      this.onLibraryChange();
      this.handleRoute();
      Library.getGateway();
    },

    bindNav() {
      document.querySelectorAll("[data-nav]").forEach(b =>
        b.addEventListener("click", () => { location.hash = "#/" + b.dataset.nav; }));
      document.querySelectorAll("[data-action]").forEach(b => {
        const act = b.dataset.action;
        if (act === "import-files") b.addEventListener("click", () => $("file-input").click());
        if (act === "add-link") b.addEventListener("click", () => this.promptSpotifyLink());
      });
      document.querySelector("[data-action=open-player]").addEventListener("click", () => this.openPlayer());
    },

    bindSearch() {
      const input = $("search-input");
      let timer = null;
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (location.hash !== "#/search") location.hash = "#/search";
          else this.doSearch();
        }, 450);
      });
    },

    promptSpotifyLink() {
      const link = prompt("Colle un / des liens Spotify (track, album, playlist), un par ligne :");
      if (!link) return;
      (async () => {
        let ok = 0, ko = 0;
        for (const line of link.split(/\s+/).filter(Boolean)) {
          try { await Library.addSpotifyLink(line); ok++; } catch { ko++; }
        }
        this.toast(ok + " ajouté(s)" + (ko ? " • " + ko + " invalide(s)" : ""));
        location.hash = "#/library";
      })();
    },

    onLibraryChange() {
      if (this.currentView === "library") this.library();
      if (this.currentView === "home") this.library();
    },

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
    },

    applyTheme(mode) {
      document.body.dataset.theme = mode;
      document.documentElement.dataset.theme = mode;
      $("btn-theme-toggle").textContent = mode === "light" ? "☀️" : "🌙";
      localStorage.setItem("sg:theme", mode);
      const meta = document.querySelector('meta[name=theme-color]');
      if (meta) meta.content = mode === "light" ? "#f5f5f7" : "#121212";
    },

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
        if (outcome === "accepted") { this.deferredPrompt = null; $("btn-install").hidden = true; this.toast("App installée 🎉"); }
      });
    },

    showManualInstallHelp() {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      alert(isIOS
        ? "Sur iPhone/iPad (Safari) :\n1. Bouton Partager ⎋\n2. « Sur l'écran d'accueil »\n3. « Ajouter »"
        : "Sur PC : icône d'installation dans la barre d'adresse du navigateur.\n\nSur Android : menu ⋮ → « Installer l'application ».");
    },

    registerSW() {
      if ("serviceWorker" in navigator)
        navigator.serviceWorker.register("./sw.js").catch(() => {});
    },

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

  window.App = App;
  document.addEventListener("DOMContentLoaded", () => App.init());
})();
