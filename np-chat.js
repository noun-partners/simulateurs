/* Assistant « audit patrimonial gratuit » de Noun Partners.
   Envoie la conversation à l'API (data-api), qui détient la clé du modèle et le prompt, et affiche la réponse en flux.
   Mêmes règles que np-sim.js : IIFE, aucune variable globale, pas de $, tout est cherché dans le conteneur .np-chat. */
(function () {
  'use strict'

  var MAX_MESSAGES = 12 // messages utilisateur par conversation, comme l'API
  var MAX_CARACTERES = 500
  var DELAI_MIN_ECRITURE = 700 // ms d'indicateur « en train d'écrire » avant le premier mot
  // Textes de l'indicateur quand la réponse tarde (le diagnostic prend 15 à 20 s)
  var ATTENTE = [[4000, 'L\'assistant relit vos réponses…'], [9000, 'L\'assistant prépare sa réponse…']]
  var PREUVE = '4,8/5 sur 102 avis Trustpilot · plus de 300 clients depuis 2020'
  // Écran tactile : pas de focus automatique, sinon le clavier s'ouvre et cache la réponse
  var TACTILE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches

  function suivi(evenement, chat) {
    // Aucune donnée saisie : seulement le nom de l'outil
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event: evenement, simulateur: chat.getAttribute('data-chat') })
  }

  function echapper(texte) {
    return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  // Markdown réduit : paragraphes, listes à tirets, gras, liens vers noun-partners.com seulement
  function enLigne(texte) {
    return echapper(texte)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https:\/\/www\.noun-partners\.com\/[^)\s]*)\)/g, '<a href="$2">$1</a>')
  }
  function enHtml(texte) {
    return texte.split(/\n{2,}/).map(function (bloc) {
      var lignes = bloc.split('\n').filter(function (l) { return l.trim() })
      if (!lignes.length) return ''
      if (lignes.every(function (l) { return /^\s*[-•]\s+/.test(l) }))
        return '<ul>' + lignes.map(function (l) { return '<li>' + enLigne(l.replace(/^\s*[-•]\s+/, '')) + '</li>' }).join('') + '</ul>'
      return '<p>' + lignes.map(enLigne).join('<br>') + '</p>'
    }).join('')
  }

  // Sépare le texte affiché des marqueurs de fin [[CHOIX: a | b]] et [[RDV]], même incomplets pendant le flux
  function decouper(brut) {
    var i = brut.indexOf('[[')
    var texte = (i < 0 ? brut : brut.slice(0, i)).replace(/\s+$/, '')
    var fin = i < 0 ? '' : brut.slice(i)
    var choix = /\[\[CHOIX:([^\]]*)/.exec(fin)
    return {
      texte: texte,
      choix: choix ? choix[1].split('|').map(function (c) { return c.trim() }).filter(Boolean).slice(0, 5) : [],
      rdv: /\[\[RDV/.test(fin),
      proposition: /\[\[RDV:\s*proposition/i.test(fin),
    }
  }

  function initialiser(chat) {
    if (chat.getAttribute('data-chat-pret')) return
    chat.setAttribute('data-chat-pret', '1')

    var api = chat.getAttribute('data-api')
    var cta = chat.getAttribute('data-cta') || '/consultation-offerte'
    var log = chat.querySelector('.np-chat__log')
    var form = chat.querySelector('.np-chat__form')
    var champ = chat.querySelector('.np-chat__input')
    var piege = chat.querySelector('.np-chat__trap')
    var envoyer = chat.querySelector('.np-chat__send')
    var accueil = chat.querySelector('.np-chat__msg--bot')

    // L'accueil écrit dans l'embed ouvre l'historique envoyé au modèle
    var historique = [{ role: 'assistant', content: Array.prototype.map.call(accueil.querySelectorAll('p'), function (p) { return p.textContent }).join('\n\n') }]
    var enCours = false
    var demarre = false
    var propositionAffichee = false
    var diagnosticAffiche = false

    var bulleBot = null // dernière réponse : son début reste à l'écran tant que l'utilisateur n'a pas répondu

    // Montre le bas de l'élément sans faire sortir de l'écran le début de la dernière réponse (un diagnostic se lit depuis le début).
    // Desktop : le fil défile dans son cadre. Mobile : le fil n'a pas de hauteur fixe et c'est la page qui défile.
    function montrer(el) {
      var haut = bulleBot || el
      if (getComputedStyle(log).overflowY !== 'visible') {
        var cible = Math.min(el.offsetTop + el.offsetHeight - log.clientHeight + 16, haut.offsetTop - 16)
        if (cible > log.scrollTop) log.scrollTo({ top: cible, behavior: 'instant' }) // instantané : un défilement doux relancé à chaque mot n'arrive jamais au bout
        return
      }
      var decalage = Math.min(el.getBoundingClientRect().bottom - (window.innerHeight - form.offsetHeight - 12), haut.getBoundingClientRect().top - 96) // 96 : barre de navigation du site
      if (decalage > 0) window.scrollBy({ top: decalage, behavior: 'instant' })
    }

    function ajouter(classe, html) {
      var el = document.createElement('div')
      el.className = classe + ' np-chat__new'
      el.innerHTML = html
      log.appendChild(el)
      montrer(el)
      return el
    }

    function retirerChoix() {
      Array.prototype.forEach.call(log.querySelectorAll('.np-chat__choices'), function (c) { c.parentNode.removeChild(c) })
    }

    function afficherChoix(choix) {
      if (!choix.length) return
      var bloc = ajouter('np-chat__choices', '')
      choix.forEach(function (c) {
        var b = document.createElement('button')
        b.type = 'button'
        b.className = 'np-chat__choice'
        b.textContent = c
        bloc.appendChild(b)
      })
      montrer(bloc)
    }

    // Proposition de consultation. En cours d'audit (proposition) : l'utilisateur peut continuer.
    // Après le diagnostic : le bloc complet une fois, puis seulement le bouton.
    function afficherRdv(proposition) {
      if (proposition && (propositionAffichee || diagnosticAffiche)) return
      var complet = proposition || !diagnosticAffiche
      var html = complet
        ? '<div class="np-chat__next-who"><span class="np-chat__avatar np-chat__avatar--small" aria-hidden="true"></span>' +
          '<p class="np-chat__next-title">' + (proposition ? 'En parler avec Malek' : 'Aller plus loin avec Malek') + '</p></div>' +
          '<p class="np-chat__next-text">Consultation offerte de 30 minutes, sans engagement : Malek reprend ' + (proposition ? 'ce point' : 'ces pistes') + ' avec vos chiffres réels.</p>' +
          '<p class="np-chat__next-proof">' + PREUVE + '</p>'
        : ''
      html += '<div class="np-chat__next-actions"><button type="button" class="button w-button np-chat__book">Réserver mes 30 minutes avec Malek</button>' +
        (proposition ? '<button type="button" class="np-chat__later">Continuer l\'audit d\'abord</button>' : '') + '</div>'
      var bloc = ajouter('np-chat__next' + (complet ? '' : ' np-chat__next--compact'), html)
      bloc.querySelector('.np-chat__book').addEventListener('click', function () {
        suivi('simulateur_cta', chat)
        window.location.assign(cta)
      })
      if (proposition) {
        propositionAffichee = true
        bloc.querySelector('.np-chat__later').addEventListener('click', function () {
          if (enCours) return
          this.parentNode.removeChild(this)
          questionner('Continuons l\'audit.')
        })
      } else if (!diagnosticAffiche) {
        diagnosticAffiche = true
        suivi('audit_chat_diagnostic', chat)
      }
    }

    function bloquer(etat) {
      enCours = etat
      champ.disabled = etat
      envoyer.disabled = etat
      if (!etat && !TACTILE) champ.focus({ preventScroll: true })
    }

    function nbUtilisateur() {
      return historique.filter(function (m) { return m.role === 'user' }).length
    }

    function fermer(message) {
      champ.disabled = true
      envoyer.disabled = true
      champ.placeholder = message
      afficherRdv()
    }

    function erreur(message) {
      ajouter('np-chat__msg np-chat__msg--error', '<p>' + echapper(message) + '</p>')
    }

    function questionner(texte) {
      texte = texte.trim().slice(0, MAX_CARACTERES)
      if (!texte || enCours) return
      if (!demarre) { demarre = true; suivi('simulateur_utilise', chat) }
      retirerChoix()
      bulleBot = null
      ajouter('np-chat__msg np-chat__msg--user', echapper(texte))
      historique.push({ role: 'user', content: texte })
      champ.value = ''
      bloquer(true)

      var ecrit = ajouter('np-chat__typing', '<span class="np-chat__dots" aria-hidden="true"><span></span><span></span><span></span></span><span>L\'assistant écrit…</span>')
      var minuteries = ATTENTE.map(function (a) {
        return setTimeout(function () { ecrit.lastChild.textContent = a[1] }, a[0])
      })
      function retirerIndicateur() {
        minuteries.forEach(clearTimeout)
        ecrit.parentNode && ecrit.parentNode.removeChild(ecrit)
      }
      var debut = Date.now()
      var brut = ''
      var bulle = null
      var affiche = 0
      var fini = false
      var annule = false // échec : la boucle d'affichage s'arrête

      // Le texte reçu s'affiche progressivement, à un rythme de lecture, pour éviter les sauts
      function rendre() {
        if (annule) return
        if (Date.now() - debut < DELAI_MIN_ECRITURE) return setTimeout(rendre, 24)
        var texte = decouper(brut).texte
        if (texte && !bulle) {
          retirerIndicateur()
          bulle = bulleBot = ajouter('np-chat__msg np-chat__msg--bot', '')
          bulle.setAttribute('aria-busy', 'true')
        }
        if (bulle && affiche < texte.length) {
          affiche = Math.min(texte.length, affiche + Math.max(2, Math.ceil((texte.length - affiche) / 10)))
          bulle.innerHTML = enHtml(texte.slice(0, affiche))
          montrer(bulle)
        }
        if (!fini || !bulle || affiche < texte.length) return setTimeout(rendre, 24)
        var d = decouper(brut)
        bulle.removeAttribute('aria-busy')
        historique.push({ role: 'assistant', content: brut.trim() })
        if (d.rdv) afficherRdv(d.proposition)
        afficherChoix(d.choix)
        if (nbUtilisateur() >= MAX_MESSAGES) fermer('Limite de la conversation atteinte')
        else bloquer(false)
      }
      setTimeout(rendre, 24)

      function echec(message) {
        annule = true
        retirerIndicateur()
        historique.pop()
        erreur(message)
        bloquer(false)
      }

      fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historique, site: piege ? piege.value : '' }),
      }).then(function (rep) {
        if (!rep.ok) {
          return rep.json().catch(function () { return {} }).then(function (d) {
            if (rep.status === 429 && nbUtilisateur() >= MAX_MESSAGES) { annule = true; retirerIndicateur(); erreur(d.erreur); return fermer('Limite de la conversation atteinte') }
            echec(d.erreur || 'Le service ne répond pas. Réessayez dans un instant.')
          })
        }
        var lecteur = rep.body.getReader()
        var decodeur = new TextDecoder()
        function lire() {
          return lecteur.read().then(function (r) {
            if (r.done) {
              if (!decouper(brut).texte) return echec('Le service ne répond pas. Réessayez dans un instant.')
              fini = true
              return
            }
            brut += decodeur.decode(r.value, { stream: true })
            return lire()
          })
        }
        return lire()
      }).catch(function () {
        echec('La connexion a été interrompue. Réessayez dans un instant.')
      })
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault()
      if (TACTILE) champ.blur() // ferme le clavier : la réponse s'affiche en entier
      questionner(champ.value)
    })
    log.addEventListener('click', function (e) {
      var bouton = e.target.closest && e.target.closest('.np-chat__choice')
      if (bouton && log.contains(bouton)) questionner(bouton.textContent)
    })
  }

  function demarrer() {
    Array.prototype.forEach.call(document.querySelectorAll('.np-chat[data-chat]'), initialiser)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer)
  else demarrer()
})()
