#!/usr/bin/env python3
# ============================================================
#  SpotifyGratuit — Passerelle SpotAPI locale
#  ------------------------------------------------------------
#  Role : exposer SpotAPI (https://github.com/Aran404/SpotAPI)
#  en HTTP avec CORS, pour que la PWA (github.io ou LAN) puisse
#  faire des recherches via l'API Spotify emulee par SpotAPI.
#  Aucune donnee sensible n'est stockee. Aucun contournement de
#  droits : metadata/publique + liaisons vers le lecteur embed.
#
#  Installation :
#      pip install spotapi flask flask-cors
#  Lancement :
#      python spotapi_gateway.py
#  -> http://localhost:8800  (et IP LAN pour le telephone)
# ============================================================
import os
import socket
import sys

try:
    from flask import Flask, jsonify, request, send_from_directory
    from flask_cors import CORS
except ImportError:
    sys.exit("Librairies manquantes :  pip install spotapi flask flask-cors")

try:
    from spotapi import Song
except ImportError:
    sys.exit("SpotAPI manquant :  pip install spotapi")

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # racine SpotifyGratuit
PORT = int(os.environ.get("SG_PORT", "8800"))

app = Flask(__name__, static_folder=None)
CORS(app)  # tout autoriser : la PWA est statique et publique


# ---------- UI : sert l'app node pour le telephone en LAN ----------
@app.route("/")
def serve_index():
    return send_from_directory(APP_DIR, "index.html")

@app.route("/<path:filename>")
def serve_files(filename):
    return send_from_directory(APP_DIR, filename)


# ---------- Sante ----------
@app.route("/health")
def health():
    return jsonify({"ok": True, "spotapi": True, "version": "1.0.0"})


# ---------- Recherche via SpotAPI ----------
def _norm_track(data: dict) -> dict:
    """Extrait les metadonnees utiles d'un resultat searchV2 de SpotAPI."""
    uri = data.get("uri", "") or ""
    sid = uri.split(":")[-1] if ":" in uri else data.get("id", "")
    cover = ""
    try:
        sources = data["albumOfTrack"]["coverArt"]["sources"]
        cover = max(sources, key=lambda s: s.get("width", 0))["url"]
    except Exception:
        pass
    artist = ""
    try:
        artists = data["artists"]["items"]
        artist = ", ".join(a["profile"]["name"] for a in artists)
    except Exception:
        pass
    album = ""
    try:
        album = data["albumOfTrack"]["name"]
    except Exception:
        pass
    return {
        "kind": "spotify",
        "spotifyType": "track",
        "spotifyId": sid,
        "title": data.get("name", "Titre Spotify"),
        "artist": artist or "Spotify",
        "album": album,
        "artwork": cover,
    }


@app.route("/api/search")
def api_search():
    q = (request.args.get("q") or "").strip()
    limit = min(int(request.args.get("limit", "20")), 50)
    if not q:
        return jsonify([])
    try:
        song = Song()
        result = song.query_songs(q, limit=limit)
        items = result.get("data", {}).get("searchV2", {}).get("tracksV2", {}).get("items", [])
        tracks = [_norm_track(i["item"]["data"]) for i in items if "item" in i and "data" in i["item"]]
        return jsonify(tracks)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


def lan_ip():
    """Devine l'IP locale pour afficher l'URL du telephone."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "0.0.0.0"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, threaded=True, use_reloader=False)
