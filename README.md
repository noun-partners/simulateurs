# Simulateurs Noun Partners

Code des simulateurs intégrés aux pages `/simulateurs/…` du site. Le HTML de chaque simulateur est collé dans Webflow ; le CSS et le JS sont chargés depuis ce dépôt, à une version figée.

## Contenu

| Fichier | Rôle |
|---|---|
| `np-sim.css` | Styles communs à tous les simulateurs. |
| `np-sim.js` | Script unique : le noyau (formatage, bornes de saisie, suivi, CTA) et un moteur de calcul par simulateur. |
| `<simulateur>/embed.html` | Le HTML à coller dans le bloc code de l'item CMS. |
| `gabarit/` | Structure et styles de la page (en-tête, texte, FAQ), pour le gabarit Webflow. Ne concerne pas le simulateur lui-même. |

## Simulateurs

| `data-sim` | Dossier | Calcul |
|---|---|---|
| `droits-succession` | `droits-succession/` | Droits de succession en ligne directe : abattement de 100 000 € par enfant, barème de 5 à 45 %. |

## Intégration dans Webflow

Dans le gabarit, une seule fois (remplacer `v1.0.0` par le tag activé) :

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/noun-partners/simulateurs@v1.0.0/np-sim.css">
<script defer src="https://cdn.jsdelivr.net/gh/noun-partners/simulateurs@v1.0.0/np-sim.js"></script>
```

Dans l'item CMS : le contenu de `<simulateur>/embed.html`. Le simulateur de droits de succession fait environ 3 500 caractères.

### Dans un article exporté par StickHub

Dans l'éditeur StickHub du client Noun Partners, choisir le composant `Simulateur` et renseigner `nom` avec `droits-succession`. Le markdown contient `<Simulateur nom="droits-succession" />`. L'aperçu reste statique, avec les valeurs par défaut ; l'export remplace la balise par le HTML du dépôt, sans commentaires, dans un bloc `<div data-rt-embed-type="true">` du champ Rich Text `post-body` de la collection `analyses`. Un nom inconnu bloque l'export.

Arthur doit charger `np-sim.css` et `np-sim.js` une seule fois sur le gabarit des articles, avec les mêmes URLs figées que sur les pages simulateur. Le script initialise chaque `.np-sim[data-sim]`. Aucun CSS ni JS n'est ajouté au champ Rich Text.

StickHub conserve un fichier JSON généré depuis un tag du clone Git : le tag, son commit, le CSS et tous les `<nom>/embed.html`. Les noms disponibles viennent de ces fichiers. Après publication d'un nouveau tag, récupérer les tags dans le clone puis lancer depuis la racine de StickHub :

```sh
bun packages/customer-data/scripts/sync-noun-simulateurs.ts ../clients/noun-partners/simulateurs v1.0.0
```

Remplacer `v1.0.0` par le tag activé par Arthur. Commiter le JSON généré dans StickHub et déployer cette mise à jour avec l'activation du même tag sur Webflow. Ne pas éditer le JSON à la main. La commande lit uniquement le commit du tag et ne crée aucun tag.

La mise en page dépend de la largeur de `.np-sim`, par container query : les blocs de saisie et de résultat s'empilent jusqu'à 911 px, et le CTA passe en colonne. Le même HTML convient à la page large et à la colonne d'article de 660 px. Les espacements et tailles du gabarit mobile restent inchangés, avec leur breakpoint à 767 px. Aucun attribut ni classe supplémentaire n'est nécessaire. Cette modification CSS doit sortir dans le prochain tag après recette ; `embed.html` et `np-sim.js` restent identiques.

Avant le premier export réel, vérifier en préproduction que l'API conserve l'embed complet dans `post-body`, puis que le formulaire fonctionne sur l'article publié. La limite de taille des Code Embeds ne garantit pas à elle seule la prise en charge du HTML par l'API Rich Text.

## Versions

Un tag par version (`v1.0.0`, `v1.0.1`…). Le site charge un tag précis : une modification du dépôt ne change rien en ligne tant que le tag n'est pas mis à jour dans le gabarit, après recette.

## Règles

Les règles de code, de calcul et de version sont dans [AGENTS.md](AGENTS.md). À lire avant toute modification, par une personne comme par un agent.

## Suivi

Deux événements poussés dans `dataLayer`, sans donnée personnelle ni montant saisi :

| Événement | Quand | Paramètre |
|---|---|---|
| `simulateur_utilise` | Première modification d'un champ | `simulateur` : la valeur de `data-sim` |
| `simulateur_cta` | Clic sur le bouton | `simulateur` : la valeur de `data-sim` |

## Ajouter un simulateur

1. Créer `<nom>/embed.html` avec un conteneur `<div class="np-sim" data-sim="<nom>">`.
2. Ajouter le moteur dans `MOTEURS` de `np-sim.js`. Il reçoit le formulaire et renvoie `out` (les textes des éléments `data-out`) et `si` (le bloc `data-si` à afficher).
3. Poser un nouveau tag.
