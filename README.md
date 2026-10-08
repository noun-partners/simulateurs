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
