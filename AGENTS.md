# Règles du dépôt

À lire avant toute modification. Ce code s'exécute dans les pages du site noun-partners.com (Webflow), à côté du CSS et des scripts du site : une erreur ici peut casser le site entier, pas seulement un simulateur.

Le [README](README.md) décrit les fichiers, l'intégration dans Webflow et les événements de suivi.

## Ce qu'est un simulateur ici

- **Il répond d'abord à la question posée.** Quelqu'un qui cherche « simulateur droit de succession » veut le montant qu'il va payer. Le bloc résultat donne ce calcul, sur le barème officiel, sans rien demander en échange (ni e-mail, ni inscription).
- **Le CTA vient après, dans un bloc séparé** (`.np-sim__next`). Il peut s'adapter au résultat et chiffrer un levier, à condition que ce chiffre sorte du même barème officiel et soit vérifiable.
- **Ce n'est pas un lead magnet.** Pas d'estimation d'économies en titre, pas de logo, d'en-tête, de pied de page ni de preuves sociales dans le simulateur : la page Webflow s'en charge.
- **Aucun multiple d'honoraires** (« 7x les honoraires », « remboursé en 51 jours ») ni montant d'honoraires supposé. Malek les a fait retirer.
- **Un seul CTA par simulateur**, et la garantie n'y est pas répétée : elle figure déjà dans le bloc de rendez-vous de la page.

## Calculs

- **Barèmes officiels uniquement**, avec l'année dans l'avertissement. Tout barème ou hypothèse nouvelle est validé par Malek avant de poser un tag.
- **Les valeurs par défaut sont écrites en dur dans `embed.html`** et doivent correspondre exactement à ce que le moteur calcule pour ces mêmes saisies. Si le moteur ou les valeurs par défaut changent, mettre à jour les deux.
- **Aucune saisie ne doit produire `NaN`, un montant négatif ou une exception** : champ vide, 0, négatif, texte, valeur énorme. Passer par `nombre(champ, min, max)`.
- **Pas d'optimisation par recherche à pas grossier** : si un moteur cherche un optimum, le chiffre en titre et le détail affiché doivent venir du même calcul.
- **Avertissement sous le résultat**, dans le simulateur (`.np-sim__disclaimer`) : « Estimation indicative, fiscalité AAAA : […] Ne constitue pas un conseil personnalisé ni un conseil financier. » Pour un simulateur qui porte sur un placement, ajouter le risque de perte en capital.

## JavaScript

- **Un seul script, `np-sim.js`**, en IIFE. Aucune variable ni fonction globale. Surtout pas de `$` : il masque le jQuery du site et casse le lien « Cookies » du footer.
- **Un moteur par simulateur dans `MOTEURS`**, choisi par `data-sim`. Le moteur reçoit le formulaire et renvoie `{ out, si }` ; il ne touche pas au DOM.
- **Tout élément est cherché dans son conteneur `.np-sim`**, jamais dans `document`. Le script ne dépend d'aucun élément extérieur au conteneur.
- **Le double chargement doit rester sans effet** (garde `data-sim-pret`).
- **Pas de `window.addEventListener('error')`** ni d'autre écoute globale : elle attraperait les erreurs du reste du site.
- **Aucune dépendance** : pas de librairie, pas de framework, pas d'étape de build. Les fichiers du dépôt sont servis tels quels.
- **Suivi : `dataLayer.push` avec le seul nom du simulateur.** Jamais de nom, d'e-mail ni de montant saisi.

## HTML

- **L'embed ne contient que du HTML** : ni `<style>`, ni `<script>`. Il doit rester très en dessous de la limite Webflow de 50 000 caractères (viser moins de 8 000).
- **Balises limitées à `div`, `span`, `p`, `h2`, `strong`, `form`, `label`, `input`, `button`.** Le Rich Text de Webflow retire `dl`, `dt`, `dd` et les attributs `on…` : le libellé et la valeur se retrouvent collés et la valeur ne se met plus à jour.
- **Lisible sans JavaScript** : les résultats du cas par défaut sont dans le HTML servi. Pas d'iframe.
- **CTA en `<button type="button" data-cta="/chemin">`**. Pas de `<a href>` vers la prise de rendez-vous ni vers calendly.com, pas de `mailto:` : le footer du site fige ces liens au chargement.
- **Chaque champ a un `<label for>`** et un texte d'aide ; les `id` sont préfixés `np-sim-` et uniques dans la page.

## CSS

- **Tout sélecteur commence par `.np-sim`.** Aucun sélecteur global : `:root`, `html`, `body`, `*`, `h1`, `label`, `input`, `select`, `footer`, `:focus-visible`, `[hidden]`.
- **Aucune police chargée.** Le site sert Figtree (400, 500, 600, 700) et Playfair Display en 600 seulement : ne pas utiliser d'autre graisse de Playfair.
- **Pas de mode sombre** (`prefers-color-scheme`) : le site n'en a pas.
- **Couleurs de la charte uniquement** : `#121426` (texte, bloc résultat), `#272A4A`, `#CF9804` (or, actions), `#C3A583`, `#EBE4DC`, `#F8F4F0` (fond crème), `#FFF9EB` (bloc CTA), `#9698AE`, `#CFD1DE`, `#E7E8F1`, blanc.
- **Reprendre les formes du site** : bloc de saisie crème à 12 px de rayon, bloc résultat sombre à 16 px, champs en capsule à bordure sombre, bouton avec les classes du site `button w-button`. Pas de nouvelles ombres, dégradés ou rayons.
- **`np-sim.css` ne style que le simulateur.** Ce qui concerne la page (en-tête, texte, FAQ) va dans `gabarit/`.

## Versions

- **Le site charge un tag précis.** Rien de ce qui est poussé sur `main` n'est en ligne tant qu'Arthur n'a pas activé un nouveau tag dans Webflow, après recette en préprod.
- **Ne jamais déplacer ni supprimer un tag existant** : poser le suivant (`v1.0.1`, `v1.1.0`…).
- **Un tag par changement qui touche `np-sim.css`, `np-sim.js` ou un `embed.html`.** Si `embed.html` change, le signaler : il faut aussi recoller le HTML dans l'item CMS.
- **Mettre à jour le README** (tableau des simulateurs, événements) dans le même commit.

## Avant de poser un tag

1. Tester chaque simulateur modifié dans une page qui charge le CSS et le jQuery du site, en 1440 px et en 375 px.
2. Essayer : valeurs par défaut, champ vide, 0, négatif, valeur très grande.
3. Vérifier qu'il n'y a ni erreur console ni débordement horizontal, et que `typeof window.$` vaut toujours `function`.
4. Charger le script deux fois : un seul événement `simulateur_utilise` doit partir.
5. Comparer les valeurs en dur de `embed.html` avec la sortie du moteur.

## Langue

Code, commentaires, commits et textes en français.
