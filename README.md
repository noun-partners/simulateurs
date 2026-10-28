# Simulateurs Noun Partners

Code des simulateurs intégrés aux pages `/simulateurs/…` du site. Le HTML de chaque simulateur est collé dans Webflow ; le CSS et le JS sont chargés depuis ce dépôt, à une version figée.

## Contenu

| Fichier | Rôle |
|---|---|
| `np-sim.css` | Styles communs à tous les simulateurs. |
| `np-sim.js` | Script unique : le noyau (formatage, bornes de saisie, suivi, CTA) et un moteur de calcul par simulateur. |
| `<simulateur>/embed.html` | Le HTML à coller dans le bloc code de l'item CMS. Les choix exclusifs (situation familiale, forme de société) sont des boutons radio `.np-sim__choice`. Un bouton radio `data-remplit="<champ>"` recopie sa valeur dans ce champ, et une saisie dans le champ le décoche. |
| `gabarit/` | Structure et styles de la page (en-tête, texte, FAQ), pour le gabarit Webflow. Ne concerne pas le simulateur lui-même. |

## Simulateurs

| `data-sim` | Dossier | Calcul |
|---|---|---|
| `droits-succession` | `droits-succession/` | Droits de succession en ligne directe : abattement de 100 000 € par enfant, barème de 5 à 45 %. |
| `revenu-exceptionnel` | `revenu-exceptionnel/` | Impôt sur un revenu exceptionnel, avec et sans le système du quotient (CGI, art. 163-0 A) : barème de l'IR 2026, plafonnement du quotient familial, décote. CEHR avec son lissage (art. 223 sexies II) et CDHR avec le revenu exceptionnel compté pour un quart (art. 224), en supposant les revenus des années précédentes égaux au revenu habituel. |
| `salaire-dirigeant` | `salaire-dirigeant/` | Répartition rémunération et dividendes qui maximise le revenu net, en SAS ou en SARL : taux moyens de cotisations, IS, PFU de 31,4 % (en SARL, coefficient net de 0,692 sur les dividendes au-delà de 10 % du capital), IR, CEHR et CDHR. Recherche à l'euro près. |
| `placement-tresorerie` | `placement-tresorerie/` | Gain net après IS d'un placement imposé chaque année, d'un compte-titres imposé à la cession et d'un contrat de capitalisation (CGI, art. 238 septies E : forfait de 105 % du TME saisi ou choisi parmi des dates de souscription, figé à la souscription, excédent déduit au rachat au taux d'IS de l'année du rachat, 0 % si la société est en déficit). Le coût de l'IS avancé sur le forfait est compté au rendement net du placement imposé chaque année. |
| `ifi-residence-principale` | `ifi-residence-principale/` | IFI 2026 (CGI, art. 977 : seuil de 1,3 M€, barème de 0,5 à 1,5 %, décote entre 1,3 et 1,4 M€) avec l'abattement de 30 % sur la résidence principale détenue en direct (art. 973 I), refusé aux parts de SCI. Dettes de la résidence principale déductibles dans la limite de sa valeur imposable (BOI-PAT-IFI-20-40-10 § 160), plafonnement des dettes au-delà de 5 M€ (art. 974 IV). IFI évité grâce à l'abattement, ou perdu via une SCI. Sans plafonnement à 75 % des revenus ni réduction pour dons. |
| `retraite-avocat` | `retraite-avocat/` | Retraite d'un avocat à la CNBF, barème 2026 : base forfaitaire de 19 154 € au prorata des trimestres CNBF sur la durée requise (167 à 172), complémentaire en points (cotisation par tranches de 42 507 € selon la classe C1, C2 ou C2 majorée, coût du point 12,5229 €, valeur 1,0262 €). Âge légal et durée de la loi du 30/12/2025 (tableau à partir du 1er septembre 2026, Service-Public A18825 : 170 trimestres pour 1963 et 1964, 171 pour 1965, 172 à partir de 1966 ; le mois de naissance n'est pas saisi, 1965 compte donc 171 trimestres, ceux des nés à partir du 1er avril), taux plein à 67 ans, décote de 1,25 % par trimestre manquant (base et complémentaire, 20 au plus), surcote de 1,25 % sur la base, majoration de 10 % pour trois enfants. Revenu constant en euros 2026 ; points acquis saisis ou années passées estimées au barème 2026 ; rendement du point réduit du minimum du règlement (coût d'achat + 2,4 points par an) jusqu'à 7,5 %. CTA : gain d'un départ à 67 ans (fin de la décote et trimestres cotisés en plus) et plafond de déduction PER des indépendants (CGI, art. 154 bis, PASS 2026 de 48 060 €). |
| `cehr` | `cehr/` | Contribution exceptionnelle sur les hauts revenus (CGI, art. 223 sexies) sur le revenu fiscal de référence, revenus au quotient comptés en entier : 3 % puis 4 % au-delà de 250 000 et 500 000 € (seul) ou 500 000 et 1 000 000 € (couple), sans quotient familial. Lissage (II ; BOI-IR-CHR § 140 à 230) si les revenus fiscaux de référence des deux années précédentes sont saisis, chacun sous le seuil, et que celui de l'année atteint 1,5 fois leur moyenne : double de la contribution sur la moyenne plus la moitié de l'écart. Même fonction (`cehrLissee`) que `revenu-exceptionnel`. Sans CDHR. |
| `cession` | `cession/` | Impôt sur la plus-value d'une cession de titres détenus en direct, en 2026 : flat tax de 31,4 % (12,8 % et 18,6 % de prélèvements sociaux) ou barème de l'IR 2026 avec, pour les titres acquis avant 2018, l'abattement pour durée de détention de droit commun (50 % à 2 ans, 65 % à 8 ans) ou renforcé (50 %, 65 % à 4 ans, 85 % à 8 ans) (art. 150-0 D), et 6,8 % de CSG déductible l'année suivante. Abattement fixe de 500 000 € du dirigeant qui part à la retraite (art. 150-0 D ter), au PFU comme au barème, sans cumul. Le moteur calcule chaque régime ouvert et retient le moins imposé. CEHR (lissée si c'est plus favorable) et CDHR sur le revenu fiscal de référence, plus-value avant abattements, revenus des années précédentes égaux aux autres revenus. Bloc donation (enfants et plus-value) : impôt en moins si des titres sont donnés aux enfants avant la vente, dans la limite des abattements de 100 000 € par parent et par enfant (deux parents pour un couple), prix d'acquisition et frais au prorata ; droits de succession évités au barème actuel, sur le patrimoine hors entreprise et le prix conservé, sans revalorisation, décès plus de 15 ans après la donation, chaque parent transmettant la moitié ; barres du prix net de frais (famille, prélèvements sociaux, impôt et contributions) sans et avec donation. Sans apport-cession. |
| `dividendes-holding` | `dividendes-holding/` | Dividendes perçus en direct ou remontés dans une holding au régime mère-fille (CGI, art. 145 et 216), sur une durée choisie. Quote-part de frais et charges de 5 % imposée à l'IS à 25 %, soit 1,25 % (valeur retenue par Malek). Dividendes personnels, en direct ou reversés par la holding pour le revenu net demandé (même revenu des deux côtés, recherche par dichotomie) : flat tax de 31,4 % ou barème avec abattement de 40 % et CSG déductible de 6,8 %, le moins imposé, CEHR (lissée si c'est plus favorable) et CDHR. Placement au même rendement des deux côtés, imposé chaque année : flat tax en direct, IS à 25 % dans la holding ; frais de la holding fixés à 2 500 € par an (repère de Malek : 2 000 à 3 000 €), non déduits. Au choix, le capital reste dans la holding (impôt de sortie affiché sans être déduit) ou la holding distribue tout la dernière année. Schéma « ce que deviennent vos dividendes » sur toute la durée, sous le bloc résultat, dans le style des schémas Noun (`.np-sim__droite`, `.np-sim__schema`, boîtes et flèches placées par `grid-area` dans l'embed) : dividendes, impôts, frais et revenu pour vivre, montants placés, gains nets, capital de la holding, impôt si elle verse tout, montant final pour le dirigeant. Hors frais de création, taux réduit d'IS et intégration fiscale. |
| `bnc-selarl` | `bnc-selarl/` | Comparaison, pour un même bénéfice, de l'exercice en BNC et en SELARL à l'IS, en 2026. Cotisations du travailleur non salarié au même taux moyen des deux côtés que `salaire-dirigeant` (1,40 € de coût et 1,028 € d'imposable par euro net), rémunération de l'associé de SEL imposée en BNC sans abattement de 10 %. SELARL : rémunération nette et dividendes saisis, plafonnés au bénéfice disponible, IS à 15 % puis 25 % après les frais propres à la société, PFU de 31,4 % sur les dividendes jusqu'à 10 % du capital, primes et comptes courants, coefficient net de 0,692 au-delà ; le reste du bénéfice après IS reste dans la société. IR, CEHR et CDHR du foyer. Écart en titre : revenu disponible plus trésorerie de la société, comparé au revenu disponible en BNC. Hors coût du passage, retraite et prévoyance. |

## Intégration dans Webflow

Dans le gabarit, une seule fois (remplacer `v1.0.0` par le tag activé) :

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/noun-partners/simulateurs@v1.0.0/np-sim.css">
<script defer src="https://cdn.jsdelivr.net/gh/noun-partners/simulateurs@v1.0.0/np-sim.js"></script>
```

Dans l'item CMS : le contenu de `<simulateur>/embed.html`. Chaque embed fait entre 3 500 et 6 500 caractères.

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

## Mise à jour mensuelle du TME

Le simulateur `placement-tresorerie` propose par défaut le dernier TME publié. La Banque de France publie le TME d'un mois le dernier jour ouvré de ce mois ([série FM.M.FR.EUR.FR2.MM.TME.HSTA](https://webstat.banque-france.fr/fr/catalogue/fm/FM.M.FR.EUR.FR2.MM.TME.HSTA)) : il vaut pour les contrats ouverts le mois suivant. En début de mois, dans `placement-tresorerie/embed.html` :

1. `value` du champ `np-sim-pt-tme` : le TME arrondi à deux décimales (`4.49`).
2. Texte d'aide du même champ : « 4,49 % (septembre 2026) pour un contrat ouvert en octobre 2026 ».
3. Valeurs écrites en dur du bloc résultat et du texte du CTA : les reprendre du moteur, en saisissant le nouveau TME dans un aperçu. Si le support qui rapporte le plus change, déplacer aussi l'attribut `hidden` des blocs `data-si`.
4. Recoller le HTML dans l'item CMS de la page, puis publier l'item.

Pas de tag : `np-sim.js` ne change pas et le HTML du simulateur ne vit que dans l'item CMS. Si un article exporté par StickHub intègre un jour ce simulateur, il gardera l'ancien TME jusqu'au tag suivant. L'exemple du texte de la page est daté (contrat ouvert en octobre 2026) et ne change pas. En janvier, mettre aussi à jour l'année de l'avertissement (« fiscalité AAAA »).

Côté Holly&Stick, `contenu/simulateurs/tme.ts` fait les étapes 1 à 3 avec le moteur de ce dépôt et met à jour l'item CMS, sans le publier : `bun --env-file=.env clients/noun-partners/contenu/simulateurs/tme.ts --tme 4.488 --mois 2026-09`, d'abord à sec, puis avec `--apply`.

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
2. Ajouter le moteur dans `MOTEURS` de `np-sim.js`. Il reçoit le formulaire et renvoie `out` (les textes des éléments `data-out`), `si` (les blocs `data-si` à afficher) et, s'il affiche des barres, `largeurs` (la largeur en pourcentage des éléments `data-largeur`, écrite aussi en `style` dans l'embed pour la page sans JavaScript). Chaque nom `data-out` n'apparaît qu'une fois dans l'embed.
3. Poser un nouveau tag.
