# ============================================================
#  install-spicetify.ps1 — SpotifyGratuit
#  Installe Spicetify CLI (doc : https://spicetify.app/docs/getting-started)
#  puis applique le thème « MusicPlayerWeb » fourni dans ./spicetify/
#  NOTE : personnalisation visuelle uniquement (pas de blocage de pubs).
# ============================================================
$ErrorActionPreference = 'Stop'
Write-Host "== 1/3 Installation de Spicetify CLI ==" -ForegroundColor Green
Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" | iex

# Rendre 'spicetify' disponible immédiatement
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "== 2/3 Sauvegarde + application de base ==" -ForegroundColor Green
spicetify backup apply

Write-Host "== 3/3 Thème MusicPlayerWeb ==" -ForegroundColor Green
$themes = Join-Path $env:APPDATA "spicetify\Themes"
New-Item -ItemType Directory -Force -Path $themes | Out-Null
Copy-Item -Recurse -Force (Join-Path $PSScriptRoot "spicetify\MusicPlayerWeb") (Join-Path $themes "MusicPlayerWeb")
spicetify config current_theme MusicPlayerWeb
spicetify config color_scheme Dark
spicetify apply

Write-Host ""
Write-Host "Terminé ! Spotify Desktop utilise maintenant le thème MusicPlayerWeb." -ForegroundColor Yellow
Write-Host "Palette claire :  spicetify config color_scheme Light; spicetify apply"
Write-Host "Revenir à l'original : spicetify config current_theme `"`"; spicetify apply"
