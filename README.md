# Navigation 3D — Bâtiments A·B·C

Visualisation 3D interactive pour naviguer d'un bureau à un autre à travers les étages (RDC et 1er).

## 🚀 Accès

👉 **[Ouvrir l'application](https://[votre-username].github.io/[repo-name]/)**

## 📁 Structure des fichiers

```
├── index.html        # Application principale (Three.js + interface)
├── routing.js        # Moteur de routage (graphe + Dijkstra)
├── data.js           # Données GeoJSON embarquées (bâtiments + chemins)
└── README.md
```

## 🗺️ Données géographiques

| Fichier source | Contenu |
|---|---|
| `rdc_A/B/C.geojson` | Surfaces RDC (bâtiments A, B, C) |
| `1er_A/B/C.geojson` | Surfaces 1er étage |
| `rdc_chemin.geojson` | Réseau de chemins RDC |
| `1er_chemin.geojson` | Réseau de chemins 1er étage |
| `point_salles.geojson` | Points de destination (bureaux) |

Le champ `apres` dans les fichiers chemin indique les segments de transition inter-étages (`apres = '1ER'`).

## 🛠️ Fonctionnalités

- **Navigation 3D** avec rotation/zoom à la souris ou au touch
- **Calcul d'itinéraire** entre n'importe quels deux bureaux (algorithme Dijkstra)
- **Traversée d'étages** automatique via les escaliers
- **Animation** du parcours avec une sphère mobile
- **Clic sur le bâtiment** pour sélectionner un bureau
- **Minimap** en temps réel
- **Filtrage par étage** (RDC seul, 1er seul, ou les deux)

## 🔧 Hébergement GitHub Pages

1. Créer un repository GitHub public
2. Pousser tous les fichiers à la racine
3. Activer GitHub Pages : `Settings → Pages → Source: main / root`
4. L'application sera disponible à `https://[username].github.io/[repo]/`

## 🔄 Mise à jour des données

Pour modifier les données géo (nouveaux bureaux, chemins modifiés), régénérer `data.js` avec :

```python
import json

files = ['rdc_A','rdc_B','rdc_C','1er_A','1er_B','1er_C','rdc_chemin','1er_chemin','point_salles']
out = "const GEO_DATA = {\n"
for fname in files:
    with open(f'{fname}.geojson') as f:
        d = json.load(f)
    out += f'  "{fname}": {json.dumps(d, separators=(",",":"))},\n'
out += "};\n"

with open('data.js', 'w') as f:
    f.write(out)
```

## 📐 Coordonnées

Système de projection : WGS84 (EPSG:4326), centré automatiquement sur l'emprise des bâtiments.
