/* Simulateurs Noun Partners : un seul script pour tous les simulateurs.
   Chaque conteneur .np-sim choisit son moteur avec data-sim. Aucune variable globale. */
(function () {
  var eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  var pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })
  var pct2 = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  var cent = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Saisie bornée : vide, négative ou hors limites, jamais NaN
  function nombre(champ, min, max) {
    var n = Number(champ && champ.value)
    return Math.min(max, Math.max(min, isFinite(n) ? n : min))
  }

  function suivi(evenement, sim) {
    // Aucune donnée personnelle ni montant saisi : seulement le nom du simulateur
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event: evenement, simulateur: sim.getAttribute('data-sim') })
  }


  // Impôt sur le revenu, barème 2026 (revenus 2025) : [plafond de la tranche, taux]
  var IR = [[11600, 0], [29579, .11], [84577, .30], [181917, .41], [Infinity, .45]]
  var DEMI_PART = 1807 // plafonnement du quotient familial, par demi-part

  function bareme(base, tranches) {
    var total = 0, bas = 0
    tranches.forEach(function (t) {
      if (base > bas) total += (Math.min(base, t[0]) - bas) * t[1]
      bas = t[0]
    })
    return total
  }

  // Foyer fiscal : boutons « situation » et champ « enfants » (pas de cas du parent isolé)
  function foyer(form) {
    var couple = form.situation.value === 'couple'
    var enfants = Math.round(nombre(form.enfants, 0, 10))
    return { couple: couple, enfants: enfants, adultes: couple ? 2 : 1, parts: (couple ? 2 : 1) + Math.min(enfants, 2) / 2 + Math.max(0, enfants - 2) }
  }

  // Impôt avant décote, avec plafonnement du quotient familial
  function impotBrut(revenu, f) {
    var plafond = bareme(revenu / f.adultes, IR) * f.adultes - (f.parts - f.adultes) * 2 * DEMI_PART
    return Math.max(bareme(revenu / f.parts, IR) * f.parts, plafond)
  }

  function decote(impot, f) {
    var seuil = f.couple ? 3277 : 1982, forfait = f.couple ? 1483 : 897
    return impot < seuil ? Math.max(0, impot - Math.max(0, forfait - .4525 * impot)) : impot
  }

  function impot(revenu, f) { return Math.round(decote(impotBrut(revenu, f), f)) }

  // Tranche marginale : celle du quotient, ou du revenu sans enfant si le plafonnement joue
  function tmi(revenu, f) {
    var base = bareme(revenu / f.parts, IR) * f.parts < impotBrut(revenu, f) ? revenu / f.adultes : revenu / f.parts
    for (var i = 0; i < IR.length; i++) if (base <= IR[i][0]) return IR[i][1]
  }

  // Contribution exceptionnelle sur les hauts revenus (sans lissage)
  function cehr(rfr, f) {
    var seuil = f.couple ? 500000 : 250000
    return .03 * Math.max(0, Math.min(rfr, 2 * seuil) - seuil) + .04 * Math.max(0, rfr - 2 * seuil)
  }

  // CEHR lissée (CGI, art. 223 sexies II ; BOI-IR-CHR § 140 à 230) : revenus fiscaux de référence des deux années
  // précédentes chacun sous le seuil et revenu de l'année d'au moins une fois et demie leur moyenne. Double de la
  // contribution sur la moyenne plus la moitié de l'écart. null si les conditions ne sont pas remplies
  function cehrLissee(rfr, n1, n2, f) {
    var seuil = f.couple ? 500000 : 250000, moyenne = (n1 + n2) / 2
    if (n1 > seuil || n2 > seuil || rfr < 1.5 * moyenne) return null
    return 2 * cehr(moyenne + (rfr - moyenne) / 2, f)
  }

  // Contribution différentielle sur les hauts revenus, reconduite par la loi de finances 2026 :
  // 20 % du revenu fiscal de référence moins l'impôt déjà payé, avec décote entre le seuil et 1,32 fois le seuil
  function cdhr(rfr, deja, f) {
    var seuil = f.couple ? 500000 : 250000
    if (rfr <= seuil) return 0
    var minimum = rfr < 1.32 * seuil ? Math.min(.2 * rfr, .825 * (rfr - seuil)) : .2 * rfr
    return Math.max(0, minimum - deja - (f.couple ? 12500 : 0) - 1500 * f.enfants)
  }

  // Droits de donation et de succession en ligne directe, après l'abattement de 100 000 € : [plafond de la tranche, taux]
  var LIGNE_DIRECTE = [[8072, .05], [12109, .10], [15932, .15], [552324, .20], [902838, .30], [1805677, .40], [Infinity, .45]]
  function droits(taxable) { return Math.round(bareme(taxable, LIGNE_DIRECTE)) }

  // Impôt sur les sociétés : 15 % jusqu'à 42 500 €, 25 % au-delà
  function impotSocietes(benefice) { return .15 * Math.min(benefice, 42500) + .25 * Math.max(0, benefice - 42500) }

  var MOTEURS = {
    'droits-succession': function (form) {
      var ABATTEMENT = 100000
      var patrimoine = nombre(form.patrimoine, 0, 1e9)
      var enfants = Math.round(nombre(form.enfants, 1, 10))
      var part = patrimoine / enfants
      var taxable = Math.max(0, part - ABATTEMENT)
      var d = droits(taxable)
      // Donation de 100 000 € par enfant faite plus de 15 ans avant : l'abattement s'applique une seconde fois
      var gain = (d - droits(Math.max(0, part - 2 * ABATTEMENT))) * enfants
      return {
        out: {
          total: eur.format(d * enfants),
          taux: pct.format(patrimoine ? d * enfants / patrimoine : 0),
          part: eur.format(part),
          abattement: eur.format(Math.min(part, ABATTEMENT)),
          taxable: eur.format(taxable),
          droits: eur.format(d),
          net: eur.format(part - d),
          gain: eur.format(gain)
        },
        si: gain > 0 ? 'gain' : 'aucun'
      }
    },

    'revenu-exceptionnel': function (form) {
      var f = foyer(form)
      var revenu = nombre(form.revenu, 0, 1e8)
      var exceptionnel = nombre(form.exceptionnel, 0, 1e8)
      var sans = impot(revenu, f)
      // Système du quotient (CGI, art. 163-0 A) : un quart du revenu exceptionnel est ajouté au revenu,
      // le supplément d'impôt est multiplié par 4. La décote s'applique ensuite au total.
      var base = impotBrut(revenu, f)
      var quotient = Math.round(decote(base + 4 * (impotBrut(revenu + exceptionnel / 4, f) - base), f))
      var direct = impot(revenu + exceptionnel, f)
      // Le quotient est une option : on retient le montant le plus bas
      var ir = Math.min(quotient, direct)

      // Contributions sur les hauts revenus, en supposant les revenus des années précédentes égaux au revenu habituel
      var rfr = revenu + exceptionnel
      var avant = cehr(revenu, f) + cdhr(revenu, impotBrut(revenu, f) + cehr(revenu, f), f)
      // CEHR lissée, les deux années précédentes au revenu habituel (même calcul que le simulateur cehr)
      var ce = cehr(rfr, f)
      var lissee = cehrLissee(rfr, revenu, revenu, f)
      if (lissee !== null) ce = Math.min(ce, lissee)
      // CDHR (CGI, art. 224) : un revenu exceptionnel par son montant (au-delà de la moyenne des trois années
      // précédentes) compte pour un quart, et l'impôt sur le revenu et la CEHR qui s'y rapportent aussi
      // (droits simples sans quotient, CEHR sans lissage, au prorata)
      var quart = exceptionnel > revenu ? .25 : 1
      var retenu = rfr ? (revenu + quart * exceptionnel) / rfr : 0
      var cd = cdhr(revenu + quart * exceptionnel, (impotBrut(rfr, f) + cehr(rfr, f)) * retenu, f)
      var contributions = Math.round(ce + cd - avant)
      var total = ir + contributions
      return {
        out: {
          supplement: eur.format(total - sans),
          part: pct.format(exceptionnel ? (total - sans) / exceptionnel : 0),
          sans: eur.format(sans),
          quotient: eur.format(quotient),
          direct: eur.format(direct),
          economie: eur.format(direct - ir),
          contributions: eur.format(contributions),
          contributionsCta: eur.format(contributions),
          tmi: pct.format(tmi(revenu, f))
        },
        si: contributions > 0 ? 'hauts' : 'normal'
      }
    },

    'salaire-dirigeant': function (form) {
      var f = foyer(form)
      var budget = nombre(form.resultat, 0, 1e7)
      var autres = nombre(form.autres, 0, 1e7)
      var capital = nombre(form.capital, 0, 1e8)
      var forme = form.forme.value === 'sarl' ? 'sarl' : 'sas'
      // Taux moyens par euro de rémunération : coût pour la société, net versé, net imposable.
      // SAS : salaire brut ; SARL, gérant majoritaire : rémunération nette de cotisations.
      var COEF = { sas: { cout: 1.42, verse: .79, imposable: .82 }, sarl: { cout: 1.40, verse: 1, imposable: 1.028 } }

      function impotsFoyer(imposable, dividendes) {
        var ir = impot(imposable, f), rfr = imposable + dividendes
        var c = cehr(rfr, f)
        return ir + c + cdhr(rfr, ir + c + .128 * dividendes, f)
      }
      var avant = impotsFoyer(autres, 0)

      // Une répartition : la part du résultat consacrée à la rémunération (cotisations comprises)
      function scenario(forme, cout) {
        var k = COEF[forme], remu = cout / k.cout
        var salaire = remu * k.imposable
        var abattement = Math.min(salaire, Math.max(509, Math.min(14555, .1 * salaire)))
        var impotSoc = impotSocietes(budget - cout)
        var dividendes = budget - cout - impotSoc
        // SARL : au-delà de 10 % du capital, primes et comptes courants, les dividendes du gérant majoritaire
        // supportent les cotisations sociales en plus des 12,8 % d'impôt. Coefficient net de 0,692 retenu par Malek :
        // le taux de cotisations baisse quand rémunération et dividendes augmentent
        var franchise = forme === 'sarl' ? Math.min(dividendes, .1 * capital) : dividendes
        var prelevements = .314 * franchise + (1 - .692) * (dividendes - franchise)
        var ir = impotsFoyer(salaire - abattement + autres, dividendes) - avant
        return {
          cout: cout, verse: remu * k.verse, dividendes: dividendes, cotisations: cout - remu * k.verse,
          impotSoc: impotSoc, prelevements: prelevements, ir: ir,
          net: remu * k.verse + dividendes - prelevements - ir
        }
      }

      // Recherche fine : grille de 2 000 pas, puis affinage autour du meilleur point jusqu'à moins d'un euro
      function optimum(forme) {
        var meilleur = scenario(forme, budget), bas = 0, haut = budget, pas = budget / 2000
        while (pas >= .5) {
          for (var x = bas; x <= haut; x += pas) {
            var s = scenario(forme, x)
            if (s.net > meilleur.net) meilleur = s
          }
          bas = Math.max(0, meilleur.cout - pas)
          haut = Math.min(budget, meilleur.cout + pas)
          pas = pas / 100
        }
        return meilleur
      }

      var m = optimum(forme)
      var autre = optimum(forme === 'sas' ? 'sarl' : 'sas')
      var ecart = autre.net - m.net
      return {
        out: {
          net: eur.format(m.net),
          verse: eur.format(m.verse),
          dividendes: eur.format(m.dividendes),
          cotisations: eur.format(m.cotisations),
          impotSoc: eur.format(m.impotSoc),
          prelevements: eur.format(m.prelevements),
          ir: eur.format(m.ir),
          toutRemu: eur.format(scenario(forme, budget).net),
          toutDiv: eur.format(scenario(forme, 0).net),
          autreForme: forme === 'sas' ? 'SARL ou EURL' : 'SAS ou SASU',
          ecart: eur.format(Math.max(0, ecart))
        },
        si: ecart >= 1 ? 'autre' : 'meme'
      }
    },

    'placement-tresorerie': function (form) {
      var montant = nombre(form.montant, 0, 1e9)
      var duree = Math.round(nombre(form.duree, 1, 30))
      var is = form.taux.value === '15' ? .15 : .25
      // Taux d'IS l'année du rachat du contrat : 0 % si la société est en déficit (l'excédent de forfaits grossit le déficit)
      var isRachat = { '25': .25, '15': .15, '0': 0 }[form.rachat.value]
      if (isRachat === undefined) isRachat = is
      var annuel = nombre(form.annuel, 0, 20) / 100
      var titres = nombre(form.titres, 0, 20) / 100
      var contrat = nombre(form.contrat, 0, 20) / 100
      // Placement imposé chaque année (compte à terme, compte rémunéré, fonds monétaire, la plupart des ETF) :
      // seul le rendement net d'IS continue de travailler
      var net = annuel * (1 - is)
      var gainAnnuel = montant * (Math.pow(1 + net, duree) - 1)
      // Compte-titres d'actions détenues en direct : l'IS porte sur la plus-value, à la cession
      var gainTitres = montant * (Math.pow(1 + titres, duree) - 1) * (1 - is)
      // Contrat de capitalisation (CGI, art. 238 septies E) : chaque année, IS sur un revenu forfaitaire de 105 % du
      // TME connu à la souscription, figé pour la vie du contrat, appliqué aux primes et aux forfaits déjà imposés.
      // Au rachat, l'IS porte sur le gain réel moins les forfaits imposés : un excédent est déduit (BOI-BIC-PDSTK-10-20-60-20
      // § 310), au taux d'IS de l'année du rachat. Les forfaits sont imposés au taux de chaque année ; cet IS avancé
      // aurait rapporté le taux net du placement imposé chaque année jusqu'au rachat
      var forfait = 1.05 * nombre(form.tme, 0, 10) / 100
      var avance = 0, cout = 0
      for (var annee = 1; annee <= duree; annee++) {
        var impotAnnee = is * forfait * montant * Math.pow(1 + forfait, annee - 1)
        avance += impotAnnee
        cout += impotAnnee * (Math.pow(1 + net, duree - annee) - 1)
      }
      var gainBrut = montant * (Math.pow(1 + contrat, duree) - 1)
      var forfaits = montant * (Math.pow(1 + forfait, duree) - 1)
      // Un contrat qui rapporte moins que le coût de l'avance n'affiche pas de gain négatif
      var gainContrat = Math.max(0, gainBrut - avance - isRachat * (gainBrut - forfaits) - cout)
      var gains = { annuel: gainAnnuel, titres: gainTitres, contrat: gainContrat }
      var meilleur = Object.keys(gains).reduce(function (a, b) { return gains[b] > gains[a] ? b : a })
      var dureeTexte = duree + ' an' + (duree > 1 ? 's' : '')
      return {
        out: {
          meilleur: eur.format(gains[meilleur]),
          support: { annuel: 'avec le placement imposé chaque année', titres: 'avec le compte-titres', contrat: 'avec le contrat de capitalisation' }[meilleur],
          duree: dureeTexte,
          dureeCta: dureeTexte,
          annuel: eur.format(gainAnnuel),
          titres: eur.format(gainTitres),
          contrat: eur.format(gainContrat),
          forfait: pct2.format(forfait),
          avance: eur.format(avance),
          avanceCta: eur.format(avance),
          cout: eur.format(cout),
          coutCta: eur.format(cout)
        },
        si: meilleur
      }
    },

    'retraite-avocat': function (form) {
      // Barème CNBF 2026 (assemblée générale, barème du 19/01/2026) et règlement du régime complémentaire
      var BASE = 19154 // retraite de base forfaitaire entière, par an
      var POINT = 1.0262 // valeur de service du point de retraite complémentaire
      var ACHAT = 12.5229 // coût d'acquisition du point en 2026
      var TRANCHE = 42507 // largeur des cinq tranches de revenu du régime complémentaire
      // Taux de cotisation du régime complémentaire par tranche : la classe 1 rejoint la classe unique en 2029,
      // la majoration de 2,5 points de la dernière tranche (C2+) n'existe que pendant la période transitoire
      var UNIQUE = [.07, .116, .137, .158, .179]
      var CLASSES = {
        c1: { 2026: [.07, .104, .122, .14, .158], 2027: [.07, .108, .127, .146, .165], 2028: [.07, .112, .132, .152, .172] },
        c2: {},
        c2p: { 2026: [.07, .116, .137, .158, .204], 2027: [.07, .116, .137, .158, .204], 2028: [.07, .116, .137, .158, .204] }
      }
      var PASS = 48060 // plafond annuel de la sécurité sociale 2026

      var naissance = Math.round(nombre(form.naissance, 1960, 2004))
      var debut = Math.round(nombre(form.debut, naissance + 18, 2026))
      var autres = Math.round(nombre(form.autres, 0, 172))
      var revenu = nombre(form.revenu, 0, 1e7)
      var classe = CLASSES[form.classe.value] ? form.classe.value : 'c1'
      var enfants = form.enfants.value === 'oui' ? 1.1 : 1
      var acquis = nombre(form.points, 0, 3e5)

      // Âge légal (en mois) et durée d'assurance pour le taux plein, selon l'année de naissance (loi du 30/12/2025,
      // tableau à partir du 1er septembre 2026 : service-public.gouv.fr/particuliers/actualites/A18825).
      // Le mois de naissance n'est pas saisi : 1965 compte 171 trimestres (nés à partir du 1er avril, 63 ans),
      // les nés avant le 1er avril 1965 (170 trimestres, 62 ans et 9 mois) ne sont pas distingués
      var legal = naissance <= 1961 ? 744 : { 1962: 750, 1963: 753, 1964: 753, 1965: 756, 1966: 759, 1967: 762, 1968: 765 }[naissance] || 768
      var requis = naissance <= 1960 ? 167 : naissance === 1961 ? 168 : naissance === 1962 ? 169 : naissance <= 1964 ? 170 : naissance === 1965 ? 171 : 172
      var PLEIN = 804 // 67 ans : taux plein quelle que soit la durée d'assurance

      function pension(ageMois) {
        // Carrière comptée en trimestres, de janvier de l'année de début au départ (naissance supposée au 1er janvier)
        var fin = naissance * 12 + ageMois
        var cnbf = Math.max(0, Math.floor((fin - debut * 12) / 3))
        var total = cnbf + autres
        // Décote : 1,25 % par trimestre manquant, au plus favorable entre durée et âge du taux plein, 20 au plus
        var manque = Math.min(20, Math.max(0, requis - total), Math.max(0, Math.ceil((PLEIN - ageMois) / 3)))
        // Surcote de la retraite de base : 1,25 % par trimestre cotisé au-delà de l'âge légal et de la durée requise
        var surcote = Math.max(0, Math.min(total - requis, Math.floor((ageMois - legal) / 3)))
        var base = BASE * Math.min(1, cnbf / requis) * (1 - .0125 * manque + .0125 * surcote) * enfants

        // Complémentaire : points = cotisation / coût du point. Rendement du point (valeur de service / coût d'achat)
        // de 8,19 % en 2026, baissé chaque année du minimum du règlement (2,4 points de plus sur le coût d'achat)
        // jusqu'au plafond de 7,5 %. Revenu et barème 2026 appliqués aux années passées, sauf points saisis
        var euros = 0
        for (var annee = debut; annee * 12 < fin; annee++) {
          var part = Math.min(1, (fin - annee * 12) / 12)
          if (annee < 2026 && acquis > 0) continue
          var taux = annee <= 2028 && CLASSES[classe][Math.max(2026, annee)] || UNIQUE
          var cotisation = 0
          for (var t = 0; t < 5; t++) cotisation += Math.max(0, Math.min(revenu, (t + 1) * TRANCHE) - t * TRANCHE) * taux[t]
          var rendement = Math.max(.075, POINT / ACHAT / Math.pow(1.024, Math.max(0, annee - 2026)))
          euros += cotisation * part * rendement
        }
        var complementaire = (acquis > 0 ? acquis * POINT : 0) + euros
        complementaire *= (1 - .0125 * manque) * enfants
        return { base: base, complementaire: complementaire, total: base + complementaire, cnbf: cnbf, trimestres: total, manque: manque, surcote: surcote }
      }

      var age = Math.max(legal, Math.round(nombre(form.age, 62, 75)) * 12)
      var p = pension(age)
      var plein = pension(Math.max(age, PLEIN))
      // Plafond de déduction des versements PER d'un travailleur non salarié (CGI, art. 154 bis), revenus 2026
      var bnc = Math.min(revenu, 8 * PASS)
      var plafondPer = Math.max(.1 * PASS, .1 * bnc + .15 * Math.max(0, bnc - PASS))
      function ans(mois) { return Math.floor(mois / 12) + ' ans' + (mois % 12 ? ' et ' + mois % 12 + ' mois' : '') }
      return {
        out: {
          mensuel: eur.format(p.total / 12),
          annuel: eur.format(p.total),
          base: eur.format(p.base),
          complementaire: eur.format(p.complementaire),
          age: ans(age),
          trimestres: p.trimestres + ' sur ' + requis,
          taux: p.manque ? 'décote de ' + pct2.format(.0125 * p.manque) : p.surcote ? 'surcote de ' + pct2.format(.0125 * p.surcote) + ' sur la base' : 'taux plein',
          remplacement: pct.format(revenu ? p.total / revenu : 0),
          ecart: eur.format(Math.max(0, revenu - p.total)),
          plein: eur.format(Math.max(0, plein.total - p.total) / 12),
          ageCta: ans(Math.max(age, PLEIN)),
          per: eur.format(plafondPer)
        },
        si: p.manque ? 'decote' : 'plein'
      }
    },

    'ifi-residence-principale': function (form) {
      // Barème de l'IFI (CGI, art. 977) : [plafond de la tranche, taux]
      var TRANCHES = [[800000, 0], [1300000, .005], [2570000, .007], [5000000, .01], [10000000, .0125], [Infinity, .015]]
      var rp = nombre(form.rp, 0, 1e9)
      var autres = nombre(form.autres, 0, 1e9)
      var emprunt = nombre(form.emprunt, 0, 1e9)
      var dettes = nombre(form.dettes, 0, 1e9)
      var sci = form.detention.value === 'sci'

      function calcul(abattement) {
        // Abattement de 30 % sur la résidence principale détenue en direct (CGI, art. 973 I). Les dettes de la
        // résidence principale restent déductibles en totalité, dans la limite de sa valeur imposable (BOI-PAT-IFI-20-40-10 § 160)
        var rpImposable = rp * (abattement ? .7 : 1)
        var brut = rpImposable + autres
        var deduites = Math.min(emprunt, rpImposable) + dettes
        // Au-delà de 5 M€ de patrimoine imposable, les dettes qui dépassent 60 % de sa valeur ne comptent que pour moitié (art. 974 IV)
        if (brut > 5000000 && deduites > .6 * brut) deduites = .6 * brut + .5 * (deduites - .6 * brut)
        deduites = Math.min(deduites, brut)
        var net = brut - deduites
        var impot = 0, decote = 0
        // Imposable au-delà de 1,3 M€ net ; décote de 17 500 € - 1,25 % du patrimoine net jusqu'à 1,4 M€
        if (net > 1300000) {
          impot = bareme(net, TRANCHES)
          if (net < 1400000) decote = Math.min(impot, 17500 - .0125 * net)
          impot -= decote
        }
        return { rpImposable: rpImposable, deduites: deduites, net: net, decote: Math.round(decote), impot: Math.round(impot) }
      }

      var r = calcul(!sci)
      // Ce que change l'abattement : gagné en direct, perdu via une SCI
      var gain = calcul(false).impot - calcul(true).impot
      return {
        out: {
          ifi: eur.format(r.impot),
          net: eur.format(r.net),
          rpLabel: sci ? 'Résidence principale, sans abattement (SCI)' : 'Résidence principale, après abattement de 30 %',
          rp: eur.format(r.rpImposable),
          autres: eur.format(autres),
          dettes: eur.format(r.deduites),
          decote: eur.format(r.decote),
          gainLabel: sci ? 'IFI en moins si elle était détenue en direct' : 'IFI évité grâce à l\'abattement de 30 %',
          gain: eur.format(gain),
          gainCta: eur.format(gain),
          gainSci: eur.format(gain)
        },
        si: gain > 0 ? (sci ? 'sci' : 'direct') : r.impot > 0 ? 'autre' : 'aucun'
      }
    },

    'cehr': function (form) {
      // Contribution exceptionnelle sur les hauts revenus (CGI, art. 223 sexies) sur le revenu fiscal de référence,
      // revenus au quotient comptés en entier. Lissage seulement si les deux années précédentes sont renseignées
      var f = { couple: form.situation.value === 'couple' }
      var seuil = f.couple ? 500000 : 250000
      var rfr = nombre(form.rfr, 0, 1e10)
      var connus = form.rfr1.value !== '' && form.rfr2.value !== ''
      var sans = Math.round(cehr(rfr, f))
      var lissee = connus ? cehrLissee(rfr, nombre(form.rfr1, 0, 1e10), nombre(form.rfr2, 0, 1e10), f) : null
      var avec = lissee === null ? sans : Math.min(sans, Math.round(lissee))
      return {
        out: {
          cehr: eur.format(avec),
          taux: pct2.format(rfr ? avec / rfr : 0),
          depassement: eur.format(Math.max(0, rfr - seuil)),
          sans: eur.format(sans),
          avec: lissee === null ? 'Non applicable' : eur.format(avec),
          economie: eur.format(sans - avec),
          sansCta: eur.format(sans),
          avecCta: eur.format(avec),
          seuil: eur.format(seuil)
        },
        si: sans === 0 ? 'aucun' : avec < sans ? 'lissage' : 'normal'
      }
    },

    'bnc-selarl': function (form) {
      var f = foyer(form)
      var benefice = nombre(form.benefice, 0, 1e7)
      var frais = Math.min(benefice, nombre(form.frais, 0, 1e6))
      var capital = nombre(form.capital, 0, 1e8)
      var autres = nombre(form.autres, 0, 1e7)
      // Cotisations du travailleur non salarié, au même taux moyen en BNC et pour le gérant majoritaire de SELARL que
      // le simulateur salaire-dirigeant : 1,40 € de coût par euro net, net imposable de 1,028 € (CSG et CRDS non
      // déductibles). Depuis 2025, la rémunération technique de l'associé de SEL est imposée en BNC : pas d'abattement de 10 %
      var COUT = 1.40, IMPOSABLE = 1.028

      // Impôts du foyer : impôt sur le revenu, CEHR et CDHR, dividendes à la flat tax comptés dans le revenu de référence
      function impotsFoyer(imposable, dividendes) {
        var ir = impot(imposable, f), rfr = imposable + dividendes
        var c = cehr(rfr, f)
        return ir + c + cdhr(rfr, ir + c + .128 * dividendes, f)
      }
      var avant = impotsFoyer(autres, 0)

      // BNC : tout le bénéfice supporte les cotisations et l'impôt sur le revenu l'année où il est réalisé
      var bncNet = benefice / COUT
      var bncIr = impotsFoyer(bncNet * IMPOSABLE + autres, 0) - avant
      var bnc = { cotisations: benefice - bncNet, ir: bncIr, poche: bncNet - bncIr, societe: 0 }

      // SELARL : rémunération choisie (cotisations comprises, dans la limite du bénéfice après frais), impôt sur les
      // sociétés sur le reste, dividendes prélevés sur le bénéfice après impôt, le solde reste dans la société
      var remu = Math.min(nombre(form.remuneration, 0, 1e7), (benefice - frais) / COUT)
      var impotSoc = impotSocietes(benefice - frais - remu * COUT)
      var apresIs = benefice - frais - remu * COUT - impotSoc
      var dividendes = Math.min(nombre(form.dividendes, 0, 1e7), apresIs)
      // Au-delà de 10 % du capital, primes et comptes courants : cotisations sociales en plus des 12,8 % d'impôt,
      // coefficient net de 0,692 retenu par Malek pour salaire-dirigeant
      var franchise = Math.min(dividendes, .1 * capital)
      var prelevements = .314 * franchise + (1 - .692) * (dividendes - franchise)
      var selIr = impotsFoyer(remu * IMPOSABLE + autres, dividendes) - avant
      var sel = {
        cotisations: remu * (COUT - 1), impotSoc: impotSoc, prelevements: prelevements, ir: selIr, frais: frais,
        poche: remu + dividendes - prelevements - selIr, societe: apresIs - dividendes
      }

      var ecart = sel.poche + sel.societe - bnc.poche
      // Barres : part du bénéfice dans votre poche, laissée dans la société, et partie en cotisations, impôts et frais
      function barre(x) {
        var p = function (v) { return (benefice ? Math.max(0, v) / benefice * 100 : 0).toFixed(1) + '%' }
        return [p(x.poche), p(x.societe), p(benefice - x.poche - x.societe)]
      }
      var b = barre(bnc), s = barre(sel)
      return {
        out: {
          sens: Math.abs(ecart) < 1 ? 'Écart entre la SELARL et le BNC' : ecart > 0 ? 'La SELARL vous laisse de plus chaque année' : 'Le BNC vous laisse de plus chaque année',
          ecart: eur.format(Math.abs(ecart)),
          bncTotal: eur.format(bnc.poche),
          selTotal: eur.format(sel.poche + sel.societe),
          bncCotisations: eur.format(bnc.cotisations),
          bncIr: eur.format(bnc.ir),
          bncPoche: eur.format(bnc.poche),
          selRemu: eur.format(remu),
          selDividendes: eur.format(dividendes),
          selCotisations: eur.format(sel.cotisations),
          selIs: eur.format(sel.impotSoc),
          selPrelevements: eur.format(sel.prelevements),
          selIr: eur.format(sel.ir),
          selFrais: eur.format(sel.frais),
          selPoche: eur.format(sel.poche),
          selSociete: eur.format(sel.societe),
          ecartCta: eur.format(Math.abs(ecart))
        },
        largeurs: { bncPoche: b[0], bncSociete: b[1], bncPrel: b[2], selPoche: s[0], selSociete: s[1], selPrel: s[2] },
        si: benefice === 0 ? 'aucun' : ecart >= 1 ? 'selarl' : 'bnc'
      }
    },

    'cession': function (form) {
      // Cession de titres par une personne physique, en 2026. Enfants supposés majeurs et hors du foyer fiscal :
      // ils ne comptent que pour la donation. Revenus des années précédentes supposés égaux aux autres revenus
      var f = { couple: form.situation.value === 'couple', enfants: 0 }
      f.adultes = f.parts = f.couple ? 2 : 1
      var prix = nombre(form.prix, 0, 1e10)
      var achat = nombre(form.achat, 0, 1e10)
      var frais = nombre(form.frais, 0, 1e10)
      var avant2018 = form.avant2018.value === 'oui'
      var renforce = form.renforce.value === 'oui'
      var retraite = form.retraite.value === 'oui'
      var autres = nombre(form.autres, 0, 1e8)
      var enfants = Math.round(nombre(form.enfants, 0, 10))
      var patrimoine = nombre(form.patrimoine, 0, 1e10)

      // Abattement pour durée de détention (CGI, art. 150-0 D, 1 ter et 1 quater) : titres acquis avant 2018, au barème
      // seulement. Cédés en 2026, ils sont tous détenus depuis plus de 8 ans : 65 %, ou 85 % pour l'abattement renforcé
      var taux = avant2018 ? (renforce ? .85 : .65) : 0

      // Impôts du foyer sans la cession : impôt sur le revenu, CEHR et CDHR
      var avant = impot(autres, f) + cehr(autres, f) + cdhr(autres, impotBrut(autres, f) + cehr(autres, f), f)

      // Impôts dus du fait de la cession, pour un régime donné
      function regime(pv, bar, ret) {
        // Abattement fixe de 500 000 € du dirigeant qui part à la retraite (art. 150-0 D ter) : impôt sur le revenu
        // seulement, au PFU comme au barème, non cumulable avec l'abattement pour durée de détention
        var abattement = ret ? Math.min(500000, pv) : bar ? pv * taux : 0
        var imposable = pv - abattement
        // Plus-value exceptionnelle par son montant : au-delà des revenus des trois années précédentes (art. 163-0 A et 224)
        var exceptionnel = imposable > autres
        // Droits simples, sans quotient : barème sur le revenu global, ou barème sur les autres revenus et 12,8 %
        var simples = bar ? impotBrut(autres + imposable, f) : impotBrut(autres, f) + .128 * imposable
        var ir = bar ? impot(autres + imposable, f) : impot(autres, f) + Math.round(.128 * imposable)
        // Au barème, système du quotient sur demande pour une plus-value exceptionnelle (diviseur 4)
        if (bar && exceptionnel) {
          var b = impotBrut(autres, f)
          ir = Math.min(ir, Math.round(decote(b + 4 * (impotBrut(autres + imposable / 4, f) - b), f)))
        }
        ir -= impot(autres, f)
        // Au barème, 6,8 % de CSG déductible du revenu de l'année suivante, supposé égal aux autres revenus (art. 154 quinquies II) :
        // sur la plus-value entière avec l'abattement de droit commun, sur la plus-value imposée avec l'abattement renforcé ou retraite
        var csg = bar ? .068 * (ret || renforce ? imposable : pv) : 0
        var deductible = csg ? impot(autres, f) - impot(Math.max(0, autres - csg), f) : 0
        var ps = Math.round(.186 * pv)
        // CEHR sur le revenu fiscal de référence, plus-value avant abattements, lissée si c'est plus favorable
        var rfr = autres + pv
        var ce = cehr(rfr, f)
        var lissee = cehrLissee(rfr, autres, autres, f)
        if (lissee !== null) ce = Math.min(ce, lissee)
        // CDHR (art. 224 ; BOI-IR-CDHR-10 § 160, BOI-IR-CDHR-20 § 150 et 180). Revenu de référence : sans l'abattement retraite,
        // abattements pour durée de détention compris. Une plus-value exceptionnelle y compte pour le quart de son montant avant
        // abattements, et l'impôt et la CEHR qui s'y rapportent pour le quart aussi
        var irPv = bar ? simples * (imposable ? imposable / (autres + imposable) : 0) : .128 * imposable
        var cePv = rfr ? ce * pv / rfr : 0
        var quart = exceptionnel ? .25 : 1
        var reference = autres + (exceptionnel ? pv / 4 : pv - (ret ? abattement : 0))
        var cd = cdhr(reference, simples - irPv + ce - cePv + quart * (irPv + cePv), f)
        var contributions = Math.max(0, Math.round(ce + cd + impot(autres, f) - avant))
        return { bar: bar, ret: ret, ir: ir - deductible, ps: ps, contributions: contributions, total: ir - deductible + ps + contributions }
      }

      // Le régime le moins imposé parmi ceux auxquels vous avez droit
      function impots(prix, achat, frais) {
        var pv = Math.max(0, prix - achat - frais)
        var liste = [regime(pv, false, false), regime(pv, true, false)]
        if (retraite) liste.push(regime(pv, false, true), regime(pv, true, true))
        var r = liste.reduce(function (a, b) { return b.total < a.total ? b : a })
        r.pv = pv
        r.flat = liste[0].total
        return r
      }

      var r = impots(prix, achat, frais)
      // Donation avant la cession, dans la limite de 100 000 € par parent et par enfant (deux parents pour un couple) :
      // pas de droits si rien n'a été donné depuis 15 ans, et une plus-value nulle pour les enfants qui revendent à ce prix.
      // Prix d'acquisition et frais répartis au prorata des titres vendus par chacun
      var parents = f.couple ? 2 : 1
      var donne = Math.min(prix, 100000 * enfants * parents)
      var reste = prix ? (prix - donne) / prix : 0
      var d = impots(prix - donne, achat * reste, frais * reste)
      var gain = r.total - d.total
      var net = Math.max(0, prix - frais)
      // Succession au barème actuel, sans revalorisation : chaque parent transmet sa part à parts égales, décès plus de 15 ans
      // après la donation (abattements reconstitués). Le prix des titres donnés n'est plus dans le patrimoine des parents
      function succession(conserve) {
        return enfants ? parents * enfants * droits(Math.max(0, (patrimoine + conserve) / parents / enfants - 100000)) : 0
      }
      var evites = succession(net - r.total) - succession(Math.max(0, prix - donne - frais * reste - d.total))
      // Barres : part du prix net de frais qui reste à la famille, prélèvements sociaux, impôt sur le revenu et contributions
      function barre(x) {
        var p = function (v) { return (net ? Math.max(0, v) / net * 100 : 0).toFixed(1) + '%' }
        return [p(net - x.total), p(x.ps), p(x.ir + x.contributions)]
      }
      var sans = barre(r), avec = barre(d)
      var abattement = r.ret ? 'l\'abattement retraite' : r.bar && taux ? 'l\'abattement de ' + pct.format(taux) : ''
      return {
        out: {
          impot: eur.format(r.total),
          taux: pct.format(r.pv ? r.total / r.pv : 0),
          net: eur.format(Math.max(0, prix - frais - r.total)),
          pv: eur.format(r.pv),
          regime: (r.bar ? 'au barème' : 'avec la flat tax') + (abattement && (r.bar ? ' avec ' : ' et ') + abattement),
          ir: eur.format(r.ir),
          ps: eur.format(r.ps),
          contributions: eur.format(r.contributions),
          flat: eur.format(r.flat),
          donne: eur.format(donne),
          gain: eur.format(gain),
          enfants: enfants > 1 ? 'vos ' + enfants + ' enfants' : 'votre enfant',
          evites: eur.format(evites),
          familleSans: eur.format(net - r.total),
          familleAvec: eur.format(net - d.total)
        },
        largeurs: { sansNet: sans[0], sansPs: sans[1], sansIr: sans[2], avecNet: avec[0], avecPs: avec[1], avecIr: avec[2] },
        si: r.pv === 0 ? 'aucun' : gain >= 1 ? 'donation' : 'autre'
      }
    },

    'dividendes-holding': function (form) {
      var f = foyer(form)
      var dividende = nombre(form.dividende, 0, 1e8)
      var besoin = nombre(form.besoin, 0, 1e8)
      var frais = nombre(form.frais, 0, 1e6)
      var annees = Math.round(nombre(form.annees, 1, 40))
      var rendement = nombre(form.rendement, 0, 15) / 100
      var autres = nombre(form.autres, 0, 1e8)
      var sortie = form.sortie.value === 'tout' ? 'tout' : 'garder'
      // Régime mère-fille (CGI, art. 145 et 216) : quote-part de frais et charges de 5 % imposée à l'IS à 25 %, soit 1,25 %
      var QUOTE_PART = .05 * .25, IS = .25, PFU = .314

      // Impôts du foyer sans dividendes : impôt sur le revenu, CEHR et CDHR
      var avant = impot(autres, f) + cehr(autres, f) + cdhr(autres, impotBrut(autres, f) + cehr(autres, f), f)
      // Impôts dus sur des dividendes perçus dans l'année : flat tax ou, sur option globale, barème avec l'abattement de 40 %
      // et 6,8 % de CSG déductible l'année suivante (revenus supposés égaux). CEHR, lissée si c'est plus favorable, et CDHR.
      // precedent : revenu fiscal de référence des deux années précédentes, pour le lissage
      function impots(d, precedent) {
        var rfr = autres + d
        var ce = cehr(rfr, f)
        var lissee = cehrLissee(rfr, precedent, precedent, f)
        if (lissee !== null) ce = Math.min(ce, lissee)
        var flat = impot(autres, f) + Math.round(.128 * d) + ce + cdhr(rfr, impotBrut(autres, f) + .128 * d + ce, f)
        var deductible = impot(autres, f) - impot(Math.max(0, autres - .068 * d), f)
        var bar = impot(autres + .6 * d, f) - deductible + ce + cdhr(rfr, impotBrut(autres + .6 * d, f) + ce, f)
        return Math.max(0, Math.round(Math.min(flat, bar) + .186 * d - avant))
      }
      function net(d) { return d - impots(d, autres + d) }

      // Montant à distribuer pour toucher un net donné (le net croît avec le montant distribué)
      function brutPour(n) {
        var bas = 0, haut = 2 * n + 1
        while (net(haut) < n) haut *= 2
        for (var i = 0; i < 60; i++) {
          var milieu = (bas + haut) / 2
          if (net(milieu) < n) bas = milieu
          else haut = milieu
        }
        return haut
      }

      // Ce que la holding encaisse chaque année, après la quote-part et ses frais
      var encaisse = dividende * (1 - QUOTE_PART) - frais
      var netDirect = net(dividende)
      // Le même revenu pour vivre des deux côtés, dans la limite de ce que chacun permet
      var vivre = Math.min(besoin, netDirect, encaisse > 0 ? net(encaisse) : 0)
      var verse = vivre ? Math.min(Math.max(0, encaisse), brutPour(vivre)) : 0

      // Impôt dû si la holding distribue tout son capital dans l'année, en plus du revenu pour vivre
      function sortieHolding(capital) {
        return capital > 0 ? impots(verse + capital, autres + verse) - impots(verse, autres + verse) : 0
      }

      // Placement identique des deux côtés, imposé chaque année : flat tax en direct, IS à 25 % dans la holding
      var direct = 0, holding = 0
      for (var a = 0; a < annees; a++) {
        direct += direct * rendement * (1 - PFU) + netDirect - vivre
        holding += Math.max(0, holding) * rendement * (1 - IS) + encaisse - verse
      }
      // Sortie : la holding distribue tout son capital la dernière année
      var latent = sortieHolding(holding)
      var finHolding = holding - (sortie === 'tout' ? latent : 0)
      var ecart = finHolding - direct
      var duree = annees > 1 ? annees + ' ans' : '1 an'

      var out = {
        titre: (sortie === 'tout' ? 'Ce qui vous reste au bout de ' : 'Capital dans la holding au bout de ') + duree,
        capital: eur.format(Math.max(0, finHolding)),
        direct: eur.format(direct),
        placeDirect: eur.format(netDirect - vivre),
        placeHolding: eur.format(Math.max(0, encaisse - verse)),
        fraisTotal: eur.format(frais * annees),
        latent: eur.format(latent),
        ecartGarder: eur.format(Math.max(0, ecart)),
        ecartTout: eur.format(Math.max(0, ecart)),
        perte: eur.format(Math.max(0, -ecart))
      }

      // Trajet de 100 € de dividendes. En direct : l'impôt de l'année. Holding : quote-part et frais, puis, le jour où elle
      // vous les verse, le même taux d'impôt que vos dividendes actuels
      var taux = dividende ? (dividende - netDirect) / dividende : 0
      var fraisCent = dividende ? Math.min(100 - 100 * QUOTE_PART, frais / dividende * 100) : 0
      var dansHolding = 100 - 100 * QUOTE_PART - fraisCent
      var trajet = { pourVous: 100 - 100 * taux, impot: 100 * taux, quotePart: 100 * QUOTE_PART, frais: fraisCent, dansHolding: dansHolding, sortie: dansHolding * taux, recupere: dansHolding * (1 - taux) }
      Object.keys(trajet).forEach(function (k) { out['t' + k.charAt(0).toUpperCase() + k.slice(1)] = cent.format(trajet[k]) })
      out.tPlaceHolding = cent.format(dansHolding)
      out.tRetenue = cent.format(100 * QUOTE_PART + fraisCent)
      out.tPlaceDirect = cent.format(trajet.pourVous)
      return {
        out: out,
        // Laissé dans la holding, le capital n'est pas encore à vous : le texte le dit, même quand il dépasse le direct
        si: ecart < 1 ? 'perdante' : sortie
      }
    }
  }

  function init(sim) {
    var moteur = MOTEURS[sim.getAttribute('data-sim')]
    var form = sim.querySelector('form')
    // Garde contre le double chargement du script
    if (!moteur || !form || sim.hasAttribute('data-sim-pret')) return
    sim.setAttribute('data-sim-pret', '')

    // Entrée dans un champ ne doit pas recharger la page
    form.addEventListener('submit', function (e) { e.preventDefault() })

    var utilise = false
    form.addEventListener('input', function (e) {
      // Boutons qui remplissent un champ (data-remplit) ; une saisie dans ce champ les décoche
      var champ = e && e.target
      var cible = champ && champ.getAttribute && champ.getAttribute('data-remplit')
      if (cible && form[cible]) form[cible].value = champ.value
      else if (champ && champ.name) sim.querySelectorAll('[data-remplit="' + champ.name + '"]').forEach(function (b) { b.checked = false })
      var r = moteur(form)
      Object.keys(r.out).forEach(function (nom) {
        var el = sim.querySelector('[data-out="' + nom + '"]')
        if (el) el.textContent = r.out[nom]
      })
      // Barres : largeur en pourcentage des éléments data-largeur
      Object.keys(r.largeurs || {}).forEach(function (nom) {
        var el = sim.querySelector('[data-largeur="' + nom + '"]')
        if (el) el.style.width = r.largeurs[nom]
      })
      sim.querySelectorAll('[data-si]').forEach(function (el) {
        el.hidden = el.getAttribute('data-si') !== r.si
      })
      if (!utilise) { utilise = true; suivi('simulateur_utilise', sim) }
    })

    // CTA en <button> : le footer du site fige les <a href> vers la prise de rendez-vous
    sim.querySelectorAll('[data-cta]').forEach(function (bouton) {
      bouton.addEventListener('click', function () {
        suivi('simulateur_cta', sim)
        window.location.assign(bouton.getAttribute('data-cta'))
      })
    })
  }

  function demarrer() { document.querySelectorAll('.np-sim[data-sim]').forEach(init) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer)
  else demarrer()
})()
