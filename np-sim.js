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
    }
  }

  function init(sim) {
    var moteur = MOTEURS[sim.getAttribute('data-sim')]
    var form = sim.querySelector('form')
    // Garde contre le double chargement du script
    if (!moteur || !form || sim.hasAttribute('data-sim-pret')) return
    sim.setAttribute('data-sim-pret', '')

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
