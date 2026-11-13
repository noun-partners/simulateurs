/* Assistants IA de Noun Partners : « audit patrimonial gratuit », page « consultation offerte », assistants transmission et dirigeant.
   Envoie la conversation à l'API (data-api), qui détient la clé du modèle et le prompt, et affiche la réponse en flux.
   Avec data-calendly (page consultation), la conclusion du modèle ouvre le Calendly de Malek, prérempli avec les réponses.
   Assistants transmission et dirigeant : l'API calcule (jamais le modèle) et ajoute le résultat au flux en [[CALCUL: {json}]], affiché en carte.
   Mêmes règles que np-sim.js : IIFE, aucune variable globale, pas de $, tout est cherché dans le conteneur .np-chat. */
(function () {
  'use strict'

  var MAX_MESSAGES = 12 // messages utilisateur par conversation, au plus (l'API fixe la limite de chaque assistant)
  var MAX_CARACTERES = 500
  var DELAI_MIN_ECRITURE = 700 // ms d'indicateur « en train d'écrire » avant le premier mot
  // Textes de l'indicateur quand la réponse tarde (le diagnostic prend 15 à 20 s)
  var ATTENTE = [[4000, 'L\'assistant relit vos réponses…'], [9000, 'L\'assistant prépare sa réponse…']]
  var PREUVE = '4,8/5 sur 102 avis Trustpilot · plus de 300 clients depuis 2020'
  // Écran tactile : pas de focus automatique, sinon le clavier s'ouvre et cache la réponse
  var TACTILE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches

  // Paramètres de suivi transmis à Calendly, comme le script de la page
  var PARAMS_SUIVI = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'msclkid', 'fbclid', 'li_fat_id']
  var TYPES_LECTURE = ['Étude de cas', 'Simulateur', 'Offre', 'Guide']
  // Fiche de conclusion du modèle : libellé de chaque champ dans le rappel affiché au-dessus du calendrier
  var FICHE = { profession: 'Profil', objectif: 'Sujet', en_place: 'Structure', revenu: 'Revenu', patrimoine: 'Ordre de grandeur', echeance: 'Échéance' }

  function suivi(evenement, chat, details) {
    // Aucune donnée saisie : le nom de l'outil, et au plus le parcours (A, B, C) ou le type de lecture
    window.dataLayer = window.dataLayer || []
    var e = { event: evenement, simulateur: chat.getAttribute('data-chat') }
    for (var k in details || {}) e[k] = details[k]
    window.dataLayer.push(e)
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

  function morceaux(texte) {
    return texte.split('|').map(function (c) { return c.trim() }).filter(Boolean)
  }

  // Sépare le texte affiché des marqueurs de fin, même incomplets pendant le flux :
  // [[CHOIX: a | b]], [[RDV]], [[RDV: proposition]] (audit) ; [[LIRE: type | titre | lien]] et [[RDV: route=A | clé=valeur…]] (consultation)
  function decouper(brut) {
    // Résultat du calcul écrit par l'API (transmission), au milieu du flux : retiré du texte, lu à part
    var calcul = null
    brut = brut.replace(/\[\[CALCUL:\s*(\{[\s\S]*?\})\]\]/g, function (_, json) {
      try { calcul = JSON.parse(json) } catch (e) {}
      return ''
    })
    var reste = brut.indexOf('[[CALCUL:') // pas encore reçu en entier
    if (reste >= 0) brut = brut.slice(0, reste)
    var i = brut.indexOf('[[')
    var texte = (i < 0 ? brut : brut.slice(0, i)).replace(/\s+$/, '')
    var fin = i < 0 ? '' : brut.slice(i)
    var choix = /\[\[CHOIX:([^\]]*)/.exec(fin)
    var lectures = []
    fin.replace(/\[\[LIRE:([^\]]*)\]\]/g, function (_, l) {
      var p = morceaux(l)
      if (p.length >= 3) lectures.push({ type: p[0], titre: p[1], lien: p[2], raison: p[3] || '' })
    })
    var pourquoi = /\[\[POURQUOI:([^\]]*)\]\]/.exec(fin) // assistants transmission et dirigeant : ce que Malek regardera
    var route = /\[\[RDV:\s*route=([ABC])([^\]]*)\]\]/.exec(fin)
    var fiche = {}
    if (route) morceaux(route[2]).forEach(function (c) {
      var j = c.indexOf('=')
      if (j > 0) fiche[c.slice(0, j).trim()] = c.slice(j + 1).trim()
    })
    return {
      texte: texte,
      choix: choix ? morceaux(choix[1]).slice(0, 6) : [],
      rdv: /\[\[RDV/.test(fin),
      proposition: /\[\[RDV:\s*proposition/i.test(fin),
      lectures: lectures.slice(0, 3),
      pourquoi: pourquoi ? morceaux(pourquoi[1]).slice(0, 3) : [],
      route: route ? route[1] : '',
      fiche: fiche,
      calcul: calcul,
    }
  }

  // « a:1, b:2 » → { a: '1', b: '2' }, ajouté à `objet`
  function paires(texte, objet) {
    morceaux((texte || '').replace(/,/g, '|')).forEach(function (c) {
      var j = c.indexOf(':')
      if (j > 0) objet[c.slice(0, j).trim()] = c.slice(j + 1).trim()
    })
    return objet
  }

  function initialiser(chat) {
    if (chat.getAttribute('data-chat-pret')) return
    chat.setAttribute('data-chat-pret', '1')

    var api = chat.getAttribute('data-api')
    var cta = chat.getAttribute('data-cta') || '/consultation-offerte'
    // Page consultation : événement Calendly de Malek, et correspondance entre la fiche du modèle et ses questions (a1, a2…)
    var calendly = chat.getAttribute('data-calendly')
    var champsCalendly = paires(chat.getAttribute('data-calendly-champs'), {})
    // Libellés du rappel au-dessus du calendrier, ajustables par assistant (data-fiche-libelles="en_place:Donations passées")
    var libelles = paires(chat.getAttribute('data-fiche-libelles'), Object.assign({}, FICHE))
    var newsletter = chat.getAttribute('data-newsletter') // action du formulaire Kit de la lettre
    var source = chat.getAttribute('data-source') || 'Site, page consultation offerte' // origine du rendez-vous, transmise à Malek
    // np-chat--questionnaire (page consultation, assistants transmission et dirigeant) : la question en cours passe en titre, le message s'affiche d'un bloc,
    // le calendrier reprend les réponses et les couleurs du site. Exception : une réponse qui commence par un calcul s'affiche en flux sous sa carte.
    var questionnaire = chat.classList.contains('np-chat--questionnaire')
    var texteEcrit = chat.getAttribute('data-ecrit') // indicateur d'écriture sans mention d'assistant (page consultation) : pas de textes d'attente
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
      // Questionnaire : la question répondue se replie avec son amorce ; une explication donnée avant elle reste lisible
      Array.prototype.forEach.call(log.querySelectorAll('.np-chat__msg--ask'), function (m) {
        m.classList.remove('np-chat__msg--ask')
        m.classList.add(m.querySelector('p:not(.np-chat__amorce):not(.np-chat__question), ul') ? 'np-chat__msg--done' : 'np-chat__msg--pli')
      })
    }

    // Questionnaire : la dernière phrase du dernier message, si c'est une question, passe en titre.
    // Une amorce courte (« Noté. ») est mise à part : elle se replie avec la question.
    function titrerQuestion() {
      var messages = log.querySelectorAll('.np-chat__msg--bot')
      var message = messages[messages.length - 1]
      var p = message && message.lastElementChild
      if (!p || p.tagName !== 'P' || !/[?:]\s*$/.test(p.textContent)) return
      var coupe = p.children.length ? null : /^([\s\S]*[.!…»])\s+([^.!…]+[?:])\s*$/.exec(p.textContent)
      if (coupe) {
        var avant = document.createElement('p')
        if (coupe[1].length <= 24) avant.className = 'np-chat__amorce'
        avant.textContent = coupe[1]
        message.insertBefore(avant, p)
        p.textContent = coupe[2]
      }
      p.className = 'np-chat__question'
      message.classList.add('np-chat__msg--ask')
    }

    function afficherChoix(choix) {
      if (!choix.length) return
      if (questionnaire) titrerQuestion()
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

    // Carte des calculs (outil simuler des assistants) : les chiffres viennent de l'API, pas du modèle
    function euros(n) { return Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/\s/g, '\u00a0') + '\u00a0€' }
    function signe(n) { return n < 0 ? '−' + euros(-n) : euros(n) }

    // Carte générique de l'outil simuler : blocs chiffre clé, barres, cascade et tableau décrits par l'API
    var BLOCS = {
      chiffre: function (b) {
        return '<div class="np-chat__calc-key"><p class="np-chat__calc-key-label">' + echapper(b.libelle) + '</p><p class="np-chat__calc-key-value">' + euros(b.valeur) + '</p>' +
          (b.detail ? '<p class="np-chat__calc-key-detail">' + echapper(b.detail) + '</p>' : '') + '</div>'
      },
      barres: function (b) {
        var max = Math.max.apply(null, b.barres.map(function (x) { return x.valeur }).concat(1))
        return '<div class="np-chat__calc-chart" role="list" aria-label="' + echapper(b.titre) + '"><p class="np-chat__calc-label">' + echapper(b.titre) + '</p>' +
          b.barres.map(function (x) {
            return '<div class="np-chat__calc-bar' + (x.accent ? ' np-chat__calc-bar--accent' : '') + '" role="listitem"><span class="np-chat__calc-bar-text"><span>' + echapper(x.libelle) + '</span><strong>' + euros(x.valeur) + '</strong></span>' +
              '<span class="np-chat__calc-track"><span class="np-chat__calc-fill" style="width:' + Math.max(1, x.valeur / max * 100).toFixed(1) + '%"></span></span></div>'
          }).join('') + '</div>'
      },
      // Cascade : du montant de départ au montant taxé, chaque étape retire sa part de la barre
      cascade: function (b) {
        var base = Math.max(1, b.depart.valeur), courant = b.depart.valeur
        function ligne(libelle, valeur, de, a, type) {
          var gauche = Math.max(0, Math.min(de, a)) / base * 100, largeur = Math.max(.5, Math.abs(a - de) / base * 100)
          return '<div class="np-chat__calc-bar np-chat__calc-bar--' + type + '" role="listitem"><span class="np-chat__calc-bar-text"><span>' + echapper(libelle) + '</span><strong>' + signe(valeur) + '</strong></span>' +
            '<span class="np-chat__calc-track"><span class="np-chat__calc-fill" style="margin-left:' + gauche.toFixed(1) + '%;width:' + Math.min(100 - gauche, largeur).toFixed(1) + '%"></span></span></div>'
        }
        var html = '<div class="np-chat__calc-chart" role="list" aria-label="' + echapper(b.titre) + '"><p class="np-chat__calc-label">' + echapper(b.titre) + '</p>' + ligne(b.depart.libelle, b.depart.valeur, 0, b.depart.valeur, 'depart')
        b.etapes.forEach(function (e) { html += ligne(e.libelle, e.valeur, courant, courant + e.valeur, 'moins'); courant += e.valeur })
        html += ligne(b.arrivee.libelle, b.arrivee.valeur, 0, b.arrivee.valeur, 'accent') + '</div>'
        return html + (b.apres ? '<p class="np-chat__calc-note">' + echapper(b.apres) + '</p>' : '')
      },
      note: function (b) { return '<p class="np-chat__calc-note">' + echapper(b.texte) + '</p>' },
      // Tableau replié : le détail reste à un clic, la carte reste courte sur mobile
      tableau: function (b) {
        var colonnes = 'grid-template-columns:minmax(0,1.2fr)' + new Array(b.colonnes.length + 1).join(' minmax(0,1fr)')
        return '<details class="np-chat__calc-more"><summary>' + echapper(b.titre) + '</summary><div class="np-chat__calc-grid" role="table" aria-label="' + echapper(b.titre) + '">' +
          '<div class="np-chat__calc-row np-chat__calc-row--head" role="row" style="' + colonnes + '"><span role="columnheader"></span>' + b.colonnes.map(function (c) { return '<span role="columnheader">' + echapper(c) + '</span>' }).join('') + '</div>' +
          b.lignes.map(function (l) {
            return '<div class="np-chat__calc-row' + (l.total ? ' np-chat__calc-row--total' : '') + '" role="row" style="' + colonnes + '"><span role="rowheader">' + echapper(l.libelle) + '</span>' +
              l.valeurs.map(function (v) { return '<span role="cell">' + euros(v) + '</span>' }).join('') + '</div>'
          }).join('') + '</div></details>'
      }
    }
    function carteSimulation(r) {
      if (!r.blocs || !r.blocs.length) return ''
      return '<p class="np-chat__calc-title">' + echapper(r.titre) + '</p><p class="np-chat__calc-sub">' + echapper(r.sousTitre) + '</p>' +
        r.blocs.map(function (b) { return BLOCS[b.type] ? BLOCS[b.type](b) : '' }).join('') +
        '<p class="np-chat__calc-disclaimer">Estimation indicative. ' + echapper((r.hypotheses || []).join('. ')) + '. ' + echapper(r.sources || '') + '. Ne constitue pas un conseil personnalisé.</p>'
    }

    // Un même calcul (même moteur, mêmes saisies) n'est affiché qu'une fois, même si le modèle le relance
    var calculsAffiches = {}
    function afficherCalcul(r) {
      if (!r || !r.saisie) return null
      var cle = r.moteur + JSON.stringify(r.saisie)
      if (calculsAffiches[cle]) return null
      var html = r.outil === 'simulation' ? carteSimulation(r) : ''
      if (!html) return null
      calculsAffiches[cle] = true
      var bloc = ajouter('np-chat__calc', html)
      suivi('assistant_calcul', chat)
      return bloc
    }

    // Lectures proposées par le modèle : liens du site seulement, ouverts dans un nouvel onglet pour garder la conversation
    function afficherLectures(lectures, intro) {
      if (!lectures.length) return
      var bloc = ajouter('np-chat__reads', '')
      if (intro) {
        var titre = document.createElement('p')
        titre.className = 'np-chat__reads-title'
        titre.textContent = intro
        bloc.appendChild(titre)
      }
      lectures.forEach(function (l) {
        if (/newsletter/i.test(l.lien)) {
          // Un seul formulaire de lettre par conversation (id unique dans la page)
          if (newsletter && !log.querySelector('.np-chat__letter')) bloc.appendChild(formulaireLettre(l.titre))
          return
        }
        if (!/^https:\/\/www\.noun-partners\.com\/[^\s"<>]*$/.test(l.lien)) return
        var a = document.createElement('a')
        a.className = 'np-chat__read'
        a.href = l.lien
        a.target = '_blank'
        a.rel = 'noopener'
        var type = TYPES_LECTURE.indexOf(l.type) >= 0 ? l.type : /\/etudes-de-cas/.test(l.lien) ? 'Étude de cas' : /\/simulateurs\//.test(l.lien) ? 'Simulateur' : 'À lire'
        a.innerHTML = '<span class="np-chat__read-type">' + echapper(type) + '</span><span class="np-chat__read-title">' + echapper(l.titre) + '</span>' +
          (l.raison ? '<span class="np-chat__read-why">' + echapper(l.raison) + '</span>' : '')
        a.addEventListener('click', function () { suivi('consultation_lecture', chat, { lecture: l.type }) })
        bloc.appendChild(a)
      })
      if (!bloc.querySelector('.np-chat__read')) bloc.parentNode.removeChild(bloc)
      else montrer(bloc)
    }

    // Inscription à la lettre : même formulaire Kit que le pied de page du site
    function formulaireLettre(titre) {
      var f = document.createElement('form')
      f.className = 'np-chat__read np-chat__letter'
      f.innerHTML = '<span class="np-chat__read-type">Newsletter</span><span class="np-chat__read-title">' + echapper(titre) + '</span>' +
        '<span class="np-chat__letter-row"><label class="np-chat__label" for="np-chat-lettre">Votre e-mail</label>' +
        '<input id="np-chat-lettre" class="np-chat__input" name="email_address" type="email" required autocomplete="email" placeholder="Votre e-mail">' +
        '<button type="submit" class="button w-button">S\'inscrire</button></span>' +
        '<span class="np-chat__letter-note">Chaque mois, avec 8 000 abonnés. Désinscription en un clic.</span>'
      f.addEventListener('submit', function (e) {
        e.preventDefault()
        var champ = f.querySelector('input')
        if (!champ.checkValidity()) return champ.reportValidity()
        var donnees = new FormData()
        donnees.append('email_address', champ.value.trim())
        fetch(newsletter, { method: 'POST', mode: 'no-cors', body: donnees }).then(function () {
          f.innerHTML = '<span class="np-chat__read-type">Newsletter</span><span class="np-chat__read-title">C\'est noté. Si c\'est votre première inscription, confirmez-la depuis l\'e-mail que vous allez recevoir.</span>'
          suivi('consultation_newsletter', chat)
        }).catch(function () {
          erreur('L\'inscription n\'a pas abouti. Réessayez dans un instant.')
        })
      })
      return f
    }

    // Page du site d'où vient la personne
    function pagePrecedente() {
      try { if (document.referrer && new URL(document.referrer).hostname === window.location.hostname) return new URL(document.referrer).pathname } catch (e) {}
      return ''
    }

    // Lien Calendly : événement de la page, réponses préremplies (a1, a2…), paramètres de suivi de l'URL courante
    function urlCalendly(route, fiche) {
      var url = new URL(calendly)
      var ici = new URLSearchParams(window.location.search)
      url.searchParams.set('hide_event_type_details', '1')
      url.searchParams.set('hide_gdpr_banner', '1')
      url.searchParams.set('embed_type', 'Inline')
      url.searchParams.set('embed_domain', window.location.hostname)
      if (questionnaire) { url.searchParams.set('primary_color', '121426'); url.searchParams.set('text_color', '121426') } // couleurs du site (selon l'offre Calendly)
      PARAMS_SUIVI.forEach(function (p) { if (ici.get(p)) url.searchParams.set(p, ici.get(p)) })
      var precedente = pagePrecedente()
      var valeurs = Object.assign({}, fiche, {
        source: source + ' (parcours ' + route + ')' + (precedente ? ', page précédente : ' + precedente : ''),
      })
      for (var cle in champsCalendly) if (valeurs[cle]) url.searchParams.set(champsCalendly[cle], valeurs[cle].slice(0, 250))
      return url.toString()
    }

    // Le calendrier s'ouvre sous la conversation, qui se resserre (desktop) ; la saisie reste disponible
    function ouvrirCalendly(route, fiche, auto) {
      var src = urlCalendly(route, fiche)
      var bloc = chat.querySelector('.np-chat__booking')
      if (!bloc) {
        bloc = document.createElement('div')
        bloc.className = 'np-chat__booking np-chat__new'
        // Questionnaire : la fiche transmise à Malek est rappelée au-dessus du calendrier
        var rappel = !questionnaire ? [] : Object.keys(libelles).filter(function (c) { return fiche[c] && !/^non\b/i.test(fiche[c]) })
        bloc.innerHTML = '<div class="np-chat__next-who"><span class="np-chat__avatar np-chat__avatar--small" aria-hidden="true"></span>' +
          '<div><p class="np-chat__next-title">Votre créneau avec Malek</p>' +
          '<p class="np-chat__next-text">30 minutes offertes, sans engagement.' + (rappel.length ? '' : ' Vos réponses lui sont transmises pour préparer l\'échange.') + '</p></div></div>' +
          (rappel.length ? '<div class="np-chat__recap"><p class="np-chat__recap-title">Transmis à Malek pour préparer l\'échange</p>' +
            rappel.map(function (c) { return '<p class="np-chat__recap-row"><span class="np-chat__recap-label">' + echapper(libelles[c]) + '</span><span>' + echapper(fiche[c]) + '</span></p>' }).join('') + '</div>' : '') +
          '<iframe class="np-chat__calendly" title="Choisir un créneau avec Malek Ziane"></iframe>' +
          '<p class="np-chat__next-proof">' + PREUVE + '</p>'
        chat.insertBefore(bloc, form)
        chat.classList.add('np-chat--rdv')
        log.style.minHeight = ''
        log.scrollTop = log.scrollHeight
        suivi('consultation_calendly', chat, { route: route })
        // Réservation confirmée dans ce calendrier : message de l'iframe Calendly (les autres messages de la page sont ignorés)
        var iframe = bloc.querySelector('iframe')
        window.addEventListener('message', function (e) {
          if (e.origin !== 'https://calendly.com' || e.source !== iframe.contentWindow || !e.data || e.data.event !== 'calendly.event_scheduled') return
          suivi('consultation_reservation', chat, { route: route })
        })
      }
      var cadre = bloc.querySelector('iframe')
      if (cadre.getAttribute('src') !== src) cadre.setAttribute('src', src)
      // Questionnaire, calendrier ouvert d'office (parcours A) : la page s'arrête au début de la conclusion, le calendrier se voit dessous
      if (auto && questionnaire && bulleBot) {
        var sommet = bulleBot.getBoundingClientRect().top - 112
        if (sommet > 0) window.scrollBy({ top: sommet, behavior: 'instant' })
        return
      }
      var haut = bloc.getBoundingClientRect().top - 96 // 96 : barre de navigation du site
      if (haut > window.innerHeight * 0.4 || haut < 0) window.scrollBy({ top: haut, behavior: 'instant' })
    }

    // Conclusion de la page consultation : A ouvre le calendrier, B le propose, C le laisse en lien discret
    // Assistants transmission et dirigeant : l'encadré dit ce que Malek regardera (points du modèle), avant les lectures.
    // Une seule fois par conversation ; ensuite, le bouton seul.
    var rdvPersonnalise = false
    function afficherRdvPersonnalise(d) {
      rdvPersonnalise = true
      // Sans calcul affiché (cas hors calcul), l'encadré ne parle pas de « votre calcul »
      var calcul = !!log.querySelector('.np-chat__calc')
      var titre = (calcul && chat.getAttribute('data-rdv-titre')) || 'En parler avec Malek'
      var bloc = ajouter('np-chat__next np-chat__next--rdv',
        '<div class="np-chat__next-who"><span class="np-chat__avatar np-chat__avatar--small" aria-hidden="true"></span>' +
        '<div><p class="np-chat__next-title">' + echapper(titre) + '</p><p class="np-chat__next-sub">30 minutes offertes avec Malek Ziane, sans engagement</p></div></div>' +
        '<p class="np-chat__next-text">' + (calcul ? 'Malek reprend votre calcul avec vous :' : 'Malek regarde avec vous :') + '</p>' +
        '<ul class="np-chat__next-list">' + d.pourquoi.map(function (p) { return '<li>' + echapper(p) + '</li>' }).join('') + '</ul>' +
        '<div class="np-chat__next-actions"><button type="button" class="button w-button np-chat__book">Choisir mon créneau</button>' +
        '<p class="np-chat__next-note">Vos réponses lui sont transmises : vous n\'aurez rien à réexpliquer.</p></div>' +
        '<p class="np-chat__next-proof">' + PREUVE + '</p>')
      bloc.querySelector('.np-chat__book').addEventListener('click', function () {
        var actions = bloc.querySelector('.np-chat__next-actions')
        actions.parentNode.removeChild(actions)
        ouvrirCalendly(d.route, d.fiche)
      })
    }

    function afficherSuite(d) {
      if (calendly && d.pourquoi.length && !rdvPersonnalise && !chat.querySelector('.np-chat__booking')) {
        suivi('consultation_route', chat, { route: d.route })
        afficherRdvPersonnalise(d)
        return afficherLectures(d.lectures, 'Pour approfondir d\'ici là')
      }
      afficherLectures(d.lectures)
      suivi('consultation_route', chat, { route: d.route })
      if (!calendly) return afficherRdv()
      if (d.route === 'A' || chat.querySelector('.np-chat__booking')) return ouvrirCalendly(d.route, d.fiche, true)
      var html = d.route === 'B'
        ? '<div class="np-chat__next-actions"><button type="button" class="button w-button np-chat__book">Choisir un créneau avec Malek</button></div>'
        : '<button type="button" class="np-chat__later np-chat__book">Échanger quand même avec Malek</button>'
      var bloc = ajouter('np-chat__next np-chat__next--compact', html)
      bloc.querySelector('.np-chat__book').addEventListener('click', function () {
        bloc.parentNode.removeChild(bloc)
        ouvrirCalendly(d.route, d.fiche)
      })
    }

    function bloquer(etat) {
      enCours = etat
      champ.disabled = etat
      envoyer.disabled = etat
      if (!etat) log.style.minHeight = ''
      if (etat || TACTILE) return
      // Questionnaire : le focus va au premier choix (anneau visible au clavier seulement), pas à la saisie, qui est secondaire
      if (!questionnaire) champ.focus({ preventScroll: true })
      else if (log.querySelector('.np-chat__choice')) log.querySelector('.np-chat__choice').focus({ preventScroll: true })
    }

    function nbUtilisateur() {
      return historique.filter(function (m) { return m.role === 'user' }).length
    }

    function fermer(message) {
      champ.disabled = true
      envoyer.disabled = true
      champ.placeholder = message
      if (calendly) ouvrirCalendly('B', {})
      else afficherRdv()
    }

    function erreur(message) {
      ajouter('np-chat__msg np-chat__msg--error', '<p>' + echapper(message) + '</p>')
    }

    function questionner(texte) {
      texte = texte.trim().slice(0, MAX_CARACTERES)
      if (!texte || enCours) return
      if (!demarre) { demarre = true; suivi('simulateur_utilise', chat) }
      if (questionnaire) log.style.minHeight = log.offsetHeight + 'px' // la carte garde sa hauteur pendant l'attente, sans se replier puis se rouvrir
      retirerChoix()
      bulleBot = null
      ajouter('np-chat__msg np-chat__msg--user', echapper(texte))
      historique.push({ role: 'user', content: texte })
      // Chats qui mènent à Calendly : étape atteinte (nombre de messages du visiteur), pour suivre les abandons dans GA4. Aucun texte saisi.
      if (calendly) suivi('consultation_etape', chat, { etape: nbUtilisateur() })
      champ.value = ''
      bloquer(true)

      var ecrit = ajouter('np-chat__typing', '<span class="np-chat__dots" aria-hidden="true"><span></span><span></span><span></span></span><span>' + echapper(texteEcrit || 'L\'assistant écrit…') + '</span>' +
        // Questionnaire : trois lignes en attente, à la place des prochains choix
        (questionnaire ? '<span class="np-chat__ghost"></span><span class="np-chat__ghost"></span><span class="np-chat__ghost"></span>' : ''))
      var minuteries = (texteEcrit ? [] : ATTENTE).map(function (a) {
        return setTimeout(function () { ecrit.children[1].textContent = a[1] }, a[0])
      })
      function retirerIndicateur() {
        minuteries.forEach(clearTimeout)
        ecrit.parentNode && ecrit.parentNode.removeChild(ecrit)
      }
      var debut = Date.now()
      var brut = ''
      var bulle = null
      var carte = null
      var affiche = 0
      var fini = false
      var annule = false // échec : la boucle d'affichage s'arrête

      // Le texte reçu s'affiche progressivement, à un rythme de lecture, pour éviter les sauts
      function rendre() {
        if (annule) return
        if (Date.now() - debut < DELAI_MIN_ECRITURE) return setTimeout(rendre, 24)
        var partiel = decouper(brut)
        var texte = partiel.texte
        if (partiel.calcul && !carte) {
          carte = afficherCalcul(partiel.calcul)
          if (carte && !bulle) bulleBot = carte
          if (!bulle && ecrit.parentNode) { log.appendChild(ecrit); montrer(ecrit) } // l'indicateur passe sous la carte
        }
        // Questionnaire : le message court s'affiche d'un bloc, avec ses choix. Après une carte de calcul, le commentaire (long) arrive en flux.
        if (questionnaire && !fini && !carte) return setTimeout(rendre, 24)
        if (texte && !bulle) {
          retirerIndicateur()
          bulle = ajouter('np-chat__msg np-chat__msg--bot', '')
          if (!carte) bulleBot = bulle // sinon la carte reste le début de la réponse à garder à l'écran
          bulle.setAttribute('aria-busy', 'true')
        }
        if (bulle && affiche < texte.length) {
          affiche = questionnaire && !carte ? texte.length : Math.min(texte.length, affiche + Math.max(2, Math.ceil((texte.length - affiche) / 10)))
          bulle.innerHTML = enHtml(texte.slice(0, affiche))
          montrer(bulle)
        }
        if (!fini || !bulle || affiche < texte.length) return setTimeout(rendre, 24)
        var d = decouper(brut)
        bulle.removeAttribute('aria-busy')
        historique.push({ role: 'assistant', content: brut.trim() })
        if (d.route) afficherSuite(d)
        else if (d.rdv) afficherRdv(d.proposition)
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
