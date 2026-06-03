# 🏢 Bâtiment Nav – 3D Building Wayfinding

Visualisation interactive 2D/3D d'un bâtiment multi-étages (Bât. A, B, C) avec navigation d'un bureau à un autre.

## Fonctionnalités

- **Vue 2D** (Rez-de-chaussée / 1er étage) : plan en couleur par bâtiment, noms des bureaux, cliquer sur un bureau pour le sélectionner
- **Vue 3D** : extrusion 3D de chaque bureau avec éclairage, orbite libre à la souris
- **Navigation** : sélectionner un bureau de départ et une destination → tracé du chemin animé (2D ou 3D), instructions pas à pas
- **Multi-étages** : les trajets inter-étages passent par la cage d'escalier avec animation verticale

## Usage

1. Ouvrir `index.html` (ou via GitHub Pages)
2. Choisir **Départ** et **Destination** dans les menus déroulants
3. Cliquer **Tracer le chemin**
4. Basculer entre **Rdc**, **1er étage** et **Vue 3D** via les onglets

Ou cliquer directement sur les bureaux dans la vue 2D pour les sélectionner.

## Structure

```
├── index.html
├── css/style.css
├── js/
│   ├── data.js      – chargement GeoJSON + catalogue de bureaux
│   ├── map2d.js     – vue Leaflet 2D
│   ├── view3d.js    – vue Three.js 3D
│   ├── router.js    – calcul d'itinéraires
│   └── app.js       – contrôleur principal
└── data/
    ├── rdc_bat_A.geojson
    ├── rdc_bat_B.geojson
    ├── rdc_bat_C.geojson
    ├── 1er_bat_A.geojson
    ├── 1er_bat_B.geojson
    └── 1er_bat_C.geojson
```

## Données

- CRS : WGS84 (Lambert 93 converti)
- 3 bâtiments × 2 étages = 6 couches GeoJSON
- ~80 bureaux/salles numérotés

## Déploiement GitHub Pages

1. Pousser le dépôt sur GitHub
2. Settings → Pages → Source : `main` / `root`
3. Le site sera disponible sur `https://<user>.github.io/<repo>/`
