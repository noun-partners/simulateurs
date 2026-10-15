/* Simulateurs Noun Partners : un seul script pour tous les simulateurs.
   Chaque conteneur .np-sim choisit son moteur avec data-sim. Aucune variable globale. */
(function () {
  var eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  var pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })

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

  // Contribution différentielle sur les hauts revenus, reconduite par la loi de finances 2026 :
  // 20 % du revenu fiscal de référence moins l'impôt déjà payé, avec décote entre le seuil et 1,32 fois le seuil
  function cdhr(rfr, deja, f) {
    var seuil = f.couple ? 500000 : 250000
    if (rfr <= seuil) return 0
    var minimum = rfr < 1.32 * seuil ? Math.min(.2 * rfr, .825 * (rfr - seuil)) : .2 * rfr
    return Math.max(0, minimum - deja - (f.couple ? 12500 : 0) - 1500 * f.enfants)
  }

  // Impôt sur les sociétés : 15 % jusqu'à 42 500 €, 25 % au-delà
  function impotSocietes(benefice) { return .15 * Math.min(benefice, 42500) + .25 * Math.max(0, benefice - 42500) }

  var MOTEURS = {
    'droits-succession': function (form) {
      var ABATTEMENT = 100000
      // Barème en ligne directe : [plafond de la tranche, taux]
      var TRANCHES = [[8072, .05], [12109, .10], [15932, .15], [552324, .20], [902838, .30], [1805677, .40], [Infinity, .45]]
      function droits(taxable) {
        var total = 0, bas = 0
        TRANCHES.forEach(function (t) {
          if (taxable > bas) total += (Math.min(taxable, t[0]) - bas) * t[1]
          bas = t[0]
        })
        return Math.round(total)
      }

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
      var total = Math.min(quotient, direct)
      return {
        out: {
          supplement: eur.format(total - sans),
          part: pct.format(exceptionnel ? (total - sans) / exceptionnel : 0),
          sans: eur.format(sans),
          quotient: eur.format(quotient),
          direct: eur.format(direct),
          economie: eur.format(direct - total),
          tmi: pct.format(tmi(revenu, f))
        },
        si: revenu + exceptionnel > (f.couple ? 500000 : 250000) ? 'hauts' : 'normal'
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
        // supportent les cotisations sociales (taux moyen de 40 %, hypothèse) en plus des 12,8 % d'impôt
        var franchise = forme === 'sarl' ? Math.min(dividendes, .1 * capital) : dividendes
        var prelevements = .314 * franchise + .528 * (dividendes - franchise)
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
      var annuel = nombre(form.annuel, 0, 20) / 100
      var contrat = nombre(form.contrat, 0, 20) / 100
      // Contrat de capitalisation détenu par une société à l'IS (CGI, art. 238 septies E) : un revenu forfaitaire
      // de 105 % du TME connu à la souscription est imposé chaque année ; au rachat, l'IS porte sur le gain réel
      // moins les forfaits déjà imposés (hypothèse : un excédent de forfaits est déduit)
      var TME = .0449
      var forfait = 1.05 * TME
      // Placement imposé chaque année (compte à terme, compte rémunéré, fonds monétaire)
      var gainAnnuel = montant * (Math.pow(1 + annuel * (1 - is), duree) - 1)
      var gainContrat = montant * (Math.pow(1 + contrat, duree) - 1) * (1 - is)
      // IS payé pendant la vie du contrat : la base de chaque forfait comprend les forfaits précédents
      var avance = is * montant * (Math.pow(1 + forfait, duree) - 1)
      var meilleur = Math.max(gainAnnuel, gainContrat)
      return {
        out: {
          meilleur: eur.format(meilleur),
          support: gainContrat > gainAnnuel ? 'avec le contrat de capitalisation' : 'avec le placement imposé chaque année',
          duree: duree + ' an' + (duree > 1 ? 's' : ''),
          dureeCta: duree + ' an' + (duree > 1 ? 's' : ''),
          annuel: eur.format(gainAnnuel),
          contrat: eur.format(gainContrat),
          forfait: pct.format(forfait),
          avance: eur.format(avance),
          avanceCta: eur.format(avance),
          ecart: eur.format(Math.abs(gainContrat - gainAnnuel))
        },
        si: gainContrat > gainAnnuel ? 'contrat' : 'annuel'
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
    form.addEventListener('input', function () {
      var r = moteur(form)
      Object.keys(r.out).forEach(function (nom) {
        var el = sim.querySelector('[data-out="' + nom + '"]')
        if (el) el.textContent = r.out[nom]
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
