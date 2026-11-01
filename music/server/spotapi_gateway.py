#!/usr/bin/env python3
# ============================================================
#  SpotifyGratuit — Passerelle SpotAPI locale (v2)
#  ------------------------------------------------------------
#  Expose SpotAPI (https://github.com/Aran404/SpotAPI) en HTTP
#  avec CORS pour la PWA : catalogue complet, tendances,
#  playlists, albums, artistes.
#
#  Usage :  pip install spotapi flask flask-cors pymongo redis
#           python spotapi_gateway.py
#  -> http://localhost:8800
# ============================================================
import os
import sys
import time
import socket

try:
    from flask import Flask, jsonify, request, send_from_directory
    from flask_cors import CORS
except ImportError:
    sys.exit("Librairies manquantes :  pip install spotapi flask flask-cors")

try:
    from spotapi import Song, Artist, PublicAlbum, PublicPlaylist
except ImportError:
    sys.exit("SpotAPI manquant :  pip install spotapi")

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("SG_PORT", "8800"))

app = Flask(__name__, static_folder=None)
CORS(app)

# ---------- cache mémoire (10 min) ----------
_CACHE = {}
TTL = 600


def cached(key, fn):
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    val = fn()
    _CACHE[key] = (time.time(), val)
    return val


# ---------- normalisation ----------
def best_art(node_list):
    """Garde la plus grande image d'une liste de sources."""
    try:
        return max(node_list, key=lambda s: s.get("width", 0) or 0)["url"]
    except Exception:
        try:
            return node_list[-1]["url"]
        except Exception:
            return ""


def norm_track(t: dict) -> dict:
    """Node « Track » SpotAPI -> dict simple."""
    uri = t.get("uri", "") or ""
    sid = uri.split(":")[-1]
    cover = best_art(((t.get("albumOfTrack") or {}).get("coverArt") or {}).get("sources") or [])
    artists = []
    try:
        artists = [(a["profile"]["name"], a["profile"]["uri"].split(":")[-1])
                   for a in t["artists"]["items"]]
    except Exception:
        pass
    ms = ((t.get("duration") or {}).get("totalMilliseconds")) or 0
    return {
        "spotifyType": "track",
        "spotifyId": sid,
        "title": t.get("name", "Titre"),
        "artists": artists,
        "artist": ", ".join(n for n, _ in artists) or "Spotify",
        "album": (t.get("albumOfTrack") or {}).get("name") or "",
        "artwork": cover,
        "duration": round(ms / 1000) if ms else 0,
        "playcount": t.get("playcount"),
    }


def parse_cover(d):
    for key in ("coverArt",):
        url = best_art((d.get(key) or {}).get("sources") or [])
        if url:
            return url
    return ""


artist_cache = {}


def artist_name_from_uri(uri, fallback=""):
    if not uri:
        return fallback
    aid = uri.split(":")[-1]
    if aid in artist_cache:
        return artist_cache[aid]
    try:
        node = (Artist().get_artist(aid)["data"]["artistUnion"])
        name = node.get("profile", {}).get("name", fallback)
        artist_cache[aid] = name
        return name
    except Exception:
        return fallback


# ---------- Playlists publiques ----------
@app.route("/api/playlist/<pid>")
def api_playlist(pid):
    limit = min(int(request.args.get("limit", 100)), 200)
    offset = int(request.args.get("offset", 0))

    def build():
        pl = PublicPlaylist(pid)
        if limit >= 343 or limit > 100:
            # gros playlists : on assemble plusieurs pages
            items, info_tracks = [], None
            info = pl.get_playlist_info(limit=100, offset=offset)
        else:
            info = pl.get_playlist_info(limit=limit, offset=offset)
        d = info["data"]["playlistV2"]
        if limit >= 100:
            tracks_total = (d.get("content") or {}).get("totalCount") or 0

        meta = {
            "spotifyType": "playlist",
            "spotifyId": pid,
            "title": d.get("name", "Playlist"),
            "description": (d.get("description") or {}).get("text", "") if isinstance(d.get("description"), dict) else (d.get("description") or ""),
            "artwork": "",
            "followers": ((d.get("followers") or {}).get("totalCount") if isinstance(d.get("followers"), dict) else d.get("followers")) or 0,
            "owner": (((d.get("ownerV2") or {}).get("data")) or {}).get("name") or "",
        }
        imgs = d.get("images")
        if isinstance(imgs, dict):
            img = (imgs.get("largestImage") or {}).get("source") or (imgs.get("mediumImage") or {}).get("source")
            meta["artwork"] = img or ""
        elif isinstance(imgs, list) and imgs:
            meta["artwork"] = best_art(imgs)

        node = d.get("content") or {}
        raw_items = node.get("items") or []
        tracks = []
        for it in raw_items:
            t = (it.get("itemV2") or {}).get("data") or {}
            if t.get("__typename") == "Track":
                tracks.append(norm_track(t))
        if not meta["artwork"] and tracks:
            meta["artwork"] = tracks[0]["artwork"]
        meta["trackCount"] = node.get("totalCount") or len(tracks)
        return {"playlist": meta, "tracks": tracks, "offset": offset + len(tracks)}

    try:
        return jsonify(cached("pl:%s:%d:%d" % (pid, limit, offset), build))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.route("/api/album/<aid>")
def api_album(aid):
    limit = min(int(request.args.get("limit", 100)), 200)
    offset = int(request.args.get("offset", 0))

    def build():
        info = PublicAlbum(aid).get_album_info(limit=limit, offset=offset)
        au = info["data"].get("albumUnion") or {}
        if au.get("__typename") not in ("Album", None):
            return {"error": "Album introuvable"}, 404
        artists = []
        try:
            artists = [(a["profile"]["name"], a["profile"]["uri"].split(":")[-1])
                       for a in ((au.get("artists") or {}).get("items") or [])]
        except Exception:
            pass
        meta = {
            "spotifyType": "album",
            "spotifyId": aid,
            "title": au.get("name", "Album"),
            "artists": artists,
            "artist": ", ".join(n for n, _ in artists) or "Spotify",
            "cover": parse_cover(au),
            "date": ((au.get("date") or {}).get("isoString") or "")[:10],
            "label": (au.get("label") or ""),
            "type": (au.get("type") or "ALBUM"),
            "uri": au.get("uri") or ("spotify:album:" + aid),
        }
        tracks = []
        for node in ((au.get("tracksV2") or {}).get("items") or []):
            t = node.get("track") or {}
            if t.get("name"):
                tracks.append(norm_track(t))
        return {"album": meta, "tracks": tracks}

    try:
        return jsonify(cached("al:%s:%d:%d" % (aid, limit, offset), build))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.route("/api/artist/<aid>")
def api_artist(aid):
    def build():
        node = Artist().get_artist(aid)["data"]["artistUnion"]
        profile = node.get("profile") or {}
        visuals = node.get("visuals") or {}
        avatar = best_art((visuals.get("avatarImage") or {}).get("sources") or [])
        header = best_art(((node.get("headerImage") or {}).get("sources") or []))
        stats = node.get("stats") or {}
        rel = node.get("relatedContent") or {}
        raw_rel = []
        try:
            raw_rel = (rel["relatedArtists"]["items"]) or []
        except Exception:
            pass
        related = []
        for r in raw_rel[:12]:
            d = (r.get("data") or (r.get("artist") or {}))
            art = best_art((((d.get("visuals") or {}).get("avatarImage") or {}).get("sources")) or [])
            related.append({
                "spotifyType": "artist",
                "spotifyId": (d.get("uri") or "").split(":")[-1],
                "title": d.get("profile", {}).get("name", ""),
                "artwork": art,
            })
        disc = {"albums": [], "singles": [], "compilations": [], "appearsOn": []}
        node_disc = node.get("discography") or {}
        for sec in disc:
            arr = (node_disc.get(sec) or {}).get("items") or []
            for entry in arr:
                rel_list = (entry.get("releases") or {}).get("items") or []
                for rel_ in rel_list[:3]:
                    disc[sec].append({
                        "spotifyType": "album",
                        "spotifyId": rel_.get("id", ""),
                        "title": rel_.get("name", ""),
                        "artwork": parse_cover(rel_),
                        "date": ((rel_.get("date") or {}).get("isoString") or "")[:10],
                        "type": rel_.get("type") or sec,
                    })
        meta = {
            "spotifyType": "artist",
            "spotifyId": aid,
            "title": profile.get("name", "Artiste"),
            "bio": ((profile.get("biography") or {}).get("text") or ""),
            "artwork": avatar,
            "header": header or avatar,
            "followers": (stats.get("followers") or 0),
            "monthlyListeners": (stats.get("monthlyListeners") or 0),
            "worldRank": (stats.get("worldRank") or None),
        }
        return {"artist": meta, "discography": disc, "related": related}

    try:
        return jsonify(cached("ar:%s" % aid, build))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.route("/api/artist/<aid>/discography")
def api_artist_discography(aid):
    section = request.args.get("section", "albums")
    limit = min(int(request.args.get("limit", 50)), 50)

    def build():
        res = Artist().get_artist_discography(aid, section=section, limit=limit)
        du = res.get("data", {}).get("artistUnion", {}).get("discography", {}).get(section, {})
        out = []
        for entry in du.get("items", []):
            for rel_ in ((entry.get("releases") or {}).get("items") or []):
                out.append({
                    "spotifyType": "album",
                    "spotifyId": rel_.get("id", ""),
                    "title": rel_.get("name", ""),
                    "artwork": parse_cover(rel_),
                    "date": ((rel_.get("date") or {}).get("isoString") or "")[:10],
                    "type": rel_.get("type") or section,
                })
        return {"artist": aid, "section": section, "releases": out,
                "totalCount": du.get("totalCount") or 0}

    try:
        return jsonify(cached("ard:%s:%s:%d" % (aid, section, limit), build))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


# ---------- Recherche ----------
@app.route("/api/search")
def api_search():
    q = (request.args.get("q") or "").strip()
    limit = min(int(request.args.get("limit", 20)), 50)
    if not q:
        return jsonify({"tracks": [], "artists": []})

    def build():
        out = {"tracks": [], "artists": []}
        try:
            result = Song().query_songs(q, limit=limit)
            items = result.get("data", {}).get("searchV2", {}).get("tracksV2", {}).get("items", [])
            for i in items:
                t = i.get("item", {}).get("data", {})
                if t.get("name"):
                    out["tracks"].append(norm_track(t))
        except Exception as exc:
            out["tracks_error"] = str(exc)
        try:
            res = Artist().query_artists(q, limit=min(limit, 12))
            raw = res.get("data", {}).get("searchV2", {}).get("artists", {}).get("items", []) or []
            for i in raw:
                d = i.get("data") or (i.get("item") or {}).get("data") or {}
                if not d:
                    continue
                out["artists"].append({
                    "spotifyType": "artist",
                    "spotifyId": (d.get("uri") or "").split(":")[-1],
                    "title": d.get("profile", {}).get("name", ""),
                    "artwork": best_art((((d.get("visuals") or {}).get("avatarImage") or {}).get("sources")) or []),
                })
        except Exception as exc:
            out["artists_error"] = str(exc)
        return out

    try:
        return jsonify(cached("se:%s:%d" % (q.lower(), limit), build))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


# ---------- Accueil : playlists éditoriales + tendances ----------
FEATURED = [
    ("37i9dQZF1DXcBWIGoYBM5M", "Aujourd'hui : Top Hits"),
    ("37i9dQZF1DX0XUsuxWHRQd", "RapCaviar"),
    ("37i9dQZF1DX10zKzsJ2jva", "Viva Latino"),
    ("37i9dQZF1DX4dyzvuaRJ0n", "mint"),
    ("37i9dQZF1DXbVhgADIy4mR", "Global Top 50"),
    ("37i9dQZF1DWXRqgorJmk26", "Rock Classics"),
    ("37i9dQZF1DX4sWSpwq3LiO", "Peaceful Piano"),
    ("37i9dQZF1DWWMOmoXKqHTD7", "Late Night Jazz"),
]

GENRES = [
    ("Pop", "37i9dQZF1DXcBWIGoYBM5M"),
    ("Rap FR", "37i9dQZF1DX6w4nkSxAEWc"),
    ("Hip-Hop", "37i9dQZF1DX0XUsuxWHRQd"),
    ("Latin", "37i9dQZF1DX10zKzsJ2jva"),
    ("Dance / Électro", "37i9dQZF1DX4dyzvuaRJ0n"),
    ("Rock", "37i9dQZF1DWXRqgorJmk26"),
    ("Élection francophone", "37i9dQZF1DXc2g7hs9AwsZ"),
    ("Jazz", "37i9dQZF1DWWMOmoXKqHTD7"),
    ("Piano", "37i9dQZF1DX4sWSpwq3LiO"),
    ("Métal", "37i9dQZF1DWWmoSC9Wqqpn"),
]


@app.route("/api/home")
def api_home():
    def build():
        featured = []
        trending = []
        for pid, _label in FEATURED:
            try:
                d = PublicPlaylist(pid).get_playlist_info(limit=50)
                node = d["data"]["playlistV2"]
                meta = {
                    "playlistId": pid,
                    "title": node.get("name", ""),
                    "followers": ((node.get("followers") or {}).get("totalCount") if isinstance(node.get("followers"), dict) else node.get("followers")) or 0,
                    "artwork": "",
                }
                imgs = node.get("images")
                if isinstance(imgs, dict):
                    meta["artwork"] = (imgs.get("largestImage") or {}).get("source") or ""
                elif isinstance(imgs, list) and imgs:
                    meta["artwork"] = best_art(imgs)
                tracks_node = (node.get("content") or {}).get("items") or []
                if not meta["artwork"]:
                    t0 = ((tracks_node[0].get("itemV2") or {}).get("data") or {})
                    meta["artwork"] = norm_track(t0)["artwork"] if t0 else ""
                featured.append(meta)
                if pid == FEATURED[0][0]:
                    for it in tracks_node:
                        t = (it.get("itemV2") or {}).get("data") or {}
                        if t.get("__typename") == "Track":
                            trending.append(norm_track(t))
            except Exception:
                continue  # playlist indisponible : on passe
        return {"featured": featured, "trending": trending[:24]}

    try:
        return jsonify(cached("home", build))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.route("/api/genres")
def api_genres():
    return jsonify([{"name": n, "playlistId": p} for n, p in GENRES])


# ---------- UI : sert l'app pour le téléphone en LAN ----------
@app.route("/")
def serve_index():
    return send_from_directory(APP_DIR, "index.html")

@app.route("/<path:filename>")
def serve_files(filename):
    return send_from_directory(APP_DIR, filename)


@app.route("/health")
def health():
    return jsonify({"ok": True, "spotapi": True, "version": "2.0.0"})


if __name__ == "__main__":
    print("Passerelle SpotAPI v2 : http://localhost:%s" % PORT, flush=True)
    app.run(host="0.0.0.0", port=PORT, threaded=True, use_reloader=False)
