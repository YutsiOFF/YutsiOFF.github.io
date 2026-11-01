# ============================================================
#  start-gateway.ps1 — SpotifyGratuit
#  Démarre la passerelle SpotAPI locale + affiche les URLs
# ============================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

Write-Host "== Vérification des dépendances ==" -ForegroundColor Green
python -m pip install --quiet --disable-pip-version-check spotapi flask flask-cors pymongo redis

Write-Host "== Lancement de la passerelle SpotAPI ==" -ForegroundColor Green
Write-Host ""
Write-Host "  App (PC)          : http://localhost:8800/" -ForegroundColor Yellow
Write-Host "  App (téléphone)   : http://<ip-du-PC>:8800/  (même Wi-Fi)" -ForegroundColor Yellow
Write-Host "  App installée     : https://yutsioff.github.io/music/" -ForegroundColor Yellow
Write-Host ""
Write-Host "CTRL+C pour arrêter." -ForegroundColor Gray
python "$PSScriptRoot\spotapi_gateway.py"
