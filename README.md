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

- **JS sans global** : tout est dans une IIFE, sans variable ni fonction globale (en particulier pas de `$`, qui masquerait le jQuery du site).
- **Un init par conteneur** `.np-sim`, les éléments sont cherchés dans le conteneur. Un conteneur déjà initialisé est ignoré (`data-sim-pret`), donc un double chargement du script est sans effet.
- **Pas d'écoute globale des erreurs**, pas de mode sombre, aucune police chargée.
- **CSS sous `.np-sim`** : toutes les classes commencent par `np-sim`, aucun sélecteur global.
- **Lisible sans JavaScript** : les résultats du cas par défaut sont écrits dans le HTML. Le script ne fait que recalculer.
- **Saisies bornées** : une valeur vide, négative ou hors limites ne produit jamais de `NaN` ni de montant négatif.
- **Avertissement sous le résultat**, dans le bloc du simulateur.
- **CTA en `<button data-cta="/chemin">`**, sans `<a href>` : le footer du site fige les liens vers la prise de rendez-vous.

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
