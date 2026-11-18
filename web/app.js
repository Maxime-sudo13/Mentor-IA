/* Mentor IA — interface ludique : chemin de leçons, une étape par écran, XP et série.
   Aucune dépendance externe : fonctionne hors ligne. */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const vue = $("#vue");
const etat = {
  profil: null, ia: false, modele: "", xp: null,
  derniereInteraction: Date.now(), debutSession: Date.now(), dernierTest: Date.now(), echecsDeSuite: 0,
};

// ================================================================== outils
async function api(chemin, corps) {
  const opts = corps === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) };
  const r = await fetch(chemin, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.erreur || "Erreur");
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const melanger = t => { const a = [...t]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const auHasard = t => t[Math.floor(Math.random() * t.length)];

/* Découpe un texte Markdown en blocs (paragraphe, code, liste, tableau). */
function blocs(texte) {
  const lignes = texte.split("\n"), out = [];
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (l.trim() === "") { i++; continue; }
    if (l.startsWith("```")) {
      const b = [l]; i++;
      while (i < lignes.length && !lignes[i].startsWith("```")) b.push(lignes[i++]);
      b.push("```"); i++; out.push({ type: "code", texte: b.join("\n") }); continue;
    }
    const type = l.startsWith("|") ? "table" : /^([-*] |\d+\. )/.test(l) ? "liste" : "texte";
    const b = [];
    while (i < lignes.length && lignes[i].trim() !== "" && !lignes[i].startsWith("```")) {
      const t2 = lignes[i].startsWith("|") ? "table" : /^([-*] |\d+\. )/.test(lignes[i]) ? "liste" : "texte";
      if (t2 !== type && b.length) break;
      b.push(lignes[i++]);
    }
    out.push({ type, texte: b.join("\n") });
  }
  return out;
}

/* Regroupe les blocs en « notions » d'un écran : un texte + ce qui l'illustre. */
function notions(texte) {
  const cartes = [];
  let carte = [];
  for (const b of blocs(texte)) {
    const illustre = carte.some(x => x.type !== "texte");
    const tropDeTexte = carte.filter(x => x.type === "texte").length >= 2;
    if (b.type === "texte" && carte.length && (illustre || tropDeTexte)) { cartes.push(carte); carte = []; }
    carte.push(b);
  }
  if (carte.length) cartes.push(carte);
  // Une carte d'une seule petite phrase est rattachée à la suivante
  for (let k = cartes.length - 2; k >= 0; k--) {
    if (cartes[k].length === 1 && cartes[k][0].type === "texte" && cartes[k][0].texte.length < 60) {
      cartes[k + 1] = [...cartes[k], ...cartes[k + 1]]; cartes.splice(k, 1);
    }
  }
  return cartes.map(c => c.map(b => b.texte).join("\n\n"));
}

/* Mini-rendu Markdown : paragraphes, listes, tableaux, code, gras. */
function md(texte) {
  const lignes = esc(texte).split("\n");
  let html = "", i = 0;
  const inline = s => s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  while (i < lignes.length) {
    const l = lignes[i];
    if (l.startsWith("```")) {
      const bloc = []; i++;
      while (i < lignes.length && !lignes[i].startsWith("```")) bloc.push(lignes[i++]);
      i++; html += `<pre><code>${bloc.join("\n")}</code></pre>`; continue;
    }
    if (l.startsWith("|")) {
      const rangs = [];
      while (i < lignes.length && lignes[i].startsWith("|")) rangs.push(lignes[i++]);
      const cellules = r => r.split("|").slice(1, -1).map(c => inline(c.trim()));
      html += "<table><thead><tr>" + cellules(rangs[0]).map(c => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
      rangs.slice(2).forEach(r => html += "<tr>" + cellules(r).map(c => `<td>${c}</td>`).join("") + "</tr>");
      html += "</tbody></table>"; continue;
    }
    if (/^[-*] /.test(l)) {
      html += "<ul>";
      while (i < lignes.length && /^[-*] /.test(lignes[i])) html += `<li>${inline(lignes[i++].slice(2))}</li>`;
      html += "</ul>"; continue;
    }
    if (/^\d+\. /.test(l)) {
      html += "<ol>";
      while (i < lignes.length && /^\d+\. /.test(lignes[i])) html += `<li>${inline(lignes[i++].replace(/^\d+\. /, ""))}</li>`;
      html += "</ol>"; continue;
    }
    if (l.trim() === "") { i++; continue; }
    const para = [];
    while (i < lignes.length && lignes[i].trim() !== "" && !/^(```|\||[-*] |\d+\. )/.test(lignes[i])) para.push(lignes[i++]);
    html += `<p>${inline(para.join(" "))}</p>`;
  }
  return html;
}

/* Mascotte originale : « Bit », un petit robot. humeur : content | fete | triste | pense */
function mascotte(taille = 64, humeur = "content") {
  const yeux = {
    content: `<rect x="21" y="27" width="6" height="9" rx="3" fill="#fff"/><rect x="37" y="27" width="6" height="9" rx="3" fill="#fff"/>`,
    fete: `<path d="M20 33 q4 -6 8 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M36 33 q4 -6 8 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    triste: `<rect x="21" y="29" width="6" height="6" rx="3" fill="#fff"/><rect x="37" y="29" width="6" height="6" rx="3" fill="#fff"/><path d="M19 26 l8 2 M45 26 l-8 2" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`,
    pense: `<rect x="21" y="28" width="6" height="7" rx="3" fill="#fff"/><rect x="37" y="26" width="6" height="7" rx="3" fill="#fff"/>`,
  }[humeur];
  const bouche = {
    content: `<path d="M26 40 q6 5 12 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    fete: `<path d="M25 39 q7 9 14 0 z" fill="#fff"/>`,
    triste: `<path d="M27 43 q5 -4 10 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    pense: `<path d="M28 41 h8" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
  }[humeur];
  return `<svg class="mascotte" width="${taille}" height="${taille}" viewBox="0 0 64 64" aria-hidden="true">
    <line x1="32" y1="5" x2="32" y2="13" stroke="#232a3b" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32" cy="5" r="4" fill="${humeur === "fete" ? "#ffb800" : "#ff7a1a"}"/>
    <rect x="6" y="12" width="52" height="46" rx="16" fill="#ff7a1a"/>
    <rect x="6" y="50" width="52" height="8" rx="4" fill="#d95f05"/>
    <rect x="12" y="18" width="40" height="32" rx="11" fill="#232a3b"/>
    ${yeux}${bouche}
    <circle cx="15" cy="45" r="0" fill="none"/>
    <rect x="1" y="28" width="6" height="12" rx="3" fill="#d95f05"/><rect x="57" y="28" width="6" height="12" rx="3" fill="#d95f05"/>
  </svg>`;
}

// ================================================================== sons (WebAudio, sans fichier)
let audio;
function jouer(type) {
  if (etat.profil && !etat.profil.sons) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { bon: [[660, 0], [880, .09]], faux: [[220, 0], [180, .12]], fin: [[523, 0], [659, .12], [784, .24], [1047, .36]], clic: [[440, 0]] }[type];
    notes.forEach(([f, t]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type === "faux" ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(type === "clic" ? 0.05 : 0.18, audio.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.22);
      o.connect(g).connect(audio.destination); o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.25);
    });
  } catch { /* son indisponible : on continue sans */ }
}

function confettis() {
  const c = document.createElement("div");
  c.className = "confettis";
  const couleurs = ["#ff7a1a", "#ffb800", "#2fb56b", "#2d8cf0", "#ee4e4e"];
  for (let k = 0; k < 70; k++) {
    const i = document.createElement("i");
    i.style.left = Math.random() * 100 + "%";
    i.style.background = auHasard(couleurs);
    i.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
    i.style.animationDelay = Math.random() * .5 + "s";
    c.appendChild(i);
  }
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 4200);
}

function toast(html, actions = [], duree = 0) {
  const t = $("#toast");
  t.innerHTML = html + (actions.length ? `<div class="actions">${actions.map((a, k) => `<button class="btn ${k ? "btn-sec" : ""}" data-k="${k}">${esc(a.label)}</button>`).join("")}</div>` : "");
  t.hidden = false;
  $$("button", t).forEach(b => b.onclick = () => { t.hidden = true; actions[b.dataset.k].action?.(); });
  clearTimeout(t._timer);
  if (duree) t._timer = setTimeout(() => t.hidden = true, duree);
}

// ================================================================== barre et navigation
function majCompteurs(xp) {
  if (!xp) return;
  etat.xp = xp;
  $("#c-serie").textContent = xp.serie;
  $(".c-serie").classList.toggle("eteinte", xp.jour === 0);
  $("#c-xp").textContent = xp.total;
  const a = $("#c-objectif");
  const p = Math.min(100, Math.round((xp.jour / xp.objectif) * 100));
  a.style.setProperty("--p", p);
  a.dataset.txt = p >= 100 ? "✓" : "🎯";
  a.title = `Objectif du jour : ${xp.jour} / ${xp.objectif} XP`;
}

function nav(nom) {
  document.body.classList.toggle("mode-lecon", nom === null);
  $$("[data-nav]").forEach(a => a.classList.toggle("actif", a.dataset.nav === nom));
}

async function chargerAccueil() {
  const d = await api("/api/accueil");
  etat.profil = d.profil; etat.ia = d.ia; etat.modele = d.modele;
  majCompteurs(d.xp);
  return d;
}

// ================================================================== page : le chemin
const DECALAGES = [0, 46, 70, 46, 0, -46, -70, -46];
const COULEURS = [["#ff7a1a", "#d95f05"], ["#2d8cf0", "#1d6fc4"], ["#8b5cf6", "#6d3fd6"], ["#2fb56b", "#1f8f51"]];

async function pageChemin() {
  nav("apprendre");
  const d = await chargerAccueil();
  const { questions } = await api("/api/revisions");
  const nbNotions = new Set(questions.map(q => q.lecon_id)).size;
  let index = 0;

  const unites = d.parcours.map((m, im) => {
    const faites = m.lecons.filter(l => l.reussie).length;
    const actuelle = m.lecons.find(l => l.debloquee && !l.reussie);
    const noeuds = m.lecons.map((l, k) => {
      const dec = DECALAGES[index++ % DECALAGES.length];
      const statut = l.reussie ? "fait" : l.debloquee ? "actuel" : "verrou";
      const trophee = k === m.lecons.length - 1;
      const icone = statut === "verrou" ? "🔒" : trophee ? "🏆" : statut === "fait" ? "✓" : "★";
      return `<div class="noeud-wrap ${l === actuelle && k ? "avec-etiquette" : ""}" style="transform:translateX(${dec}px)">
        ${l === actuelle ? `<div class="etiquette-commencer">${faites ? "Continuer" : "Commencer"}</div>` : ""}
        <button class="noeud ${statut} ${trophee ? "trophee" : ""}" data-id="${l.id}" data-statut="${statut}" data-titre="${esc(l.titre)}" data-n="${k + 1}" data-total="${m.lecons.length}" aria-label="${esc(l.titre)}">${icone}</button>
        ${l.reussie ? `<div class="etoiles" title="Mémorisation ${l.maitrise}/5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= l.maitrise ? "on" : ""}"></i>`).join("")}</div>` : ""}
      </div>`;
    }).join("");
    const [c, cf] = COULEURS[im % COULEURS.length];
    return `<section style="--c:${c};--c-fonce:${cf}">
      <div class="unite"><div><small>Module ${im + 1} · ${faites}/${m.lecons.length}</small><h2>${esc(m.titre)}</h2>
        <div class="jauge-unite"><div style="width:${(faites / m.lecons.length) * 100}%"></div></div></div>
        <span style="font-size:2rem">${esc(m.icone || "📘")}</span></div>
      <div class="chemin">${noeuds}</div></section>`;
  }).join("");

  const x = d.xp;
  const pctObjectif = Math.min(100, (x.jour / x.objectif) * 100);
  const jours = ["D", "L", "M", "M", "J", "V", "S"];
  const semaine = x.semaine.map(j => {
    const max = Math.max(x.objectif, ...x.semaine.map(s => s.xp));
    return `<div><span class="${j.xp ? "" : "zero"}" style="height:${Math.max(4, (j.xp / max) * 52)}px" title="${j.xp} XP"></span>${jours[new Date(j.jour + "T12:00").getDay()]}</div>`;
  }).join("");

  vue.innerHTML = `
    <div class="accueil">
      <div class="colonne-chemin">
        <div class="bulle-mascotte">${mascotte(58)}<div class="bulle">${esc(d.plan.message)}</div></div>
        ${nbNotions ? `<a class="carte revision-due" href="#/revisions" style="text-decoration:none">
          <span class="ico">🔁</span><div><b>${nbNotions} notion${nbNotions > 1 ? "s" : ""} à réviser</b><div class="sous">2 minutes pour ne pas oublier · +${5 * nbNotions} XP</div></div><span class="btn btn-bleu" style="padding:.55rem .9rem">Go</span></a>` : ""}
        ${unites}
      </div>
      <aside class="colonne-cote">
        <div class="carte"><h3>Objectif du jour</h3>
          <div class="objectif-ligne"><span style="font-size:1.6rem">${pctObjectif >= 100 ? "🏅" : "🎯"}</span>
            <div class="barre-prog"><div style="width:${pctObjectif}%"></div></div><b>${x.jour}/${x.objectif}</b></div>
          <p class="sous" style="margin:.6rem 0 0">${pctObjectif >= 100 ? "Objectif atteint, bravo !" : `Encore ${x.objectif - x.jour} XP aujourd'hui.`}</p></div>
        <div class="carte"><h3>Cette semaine</h3><div class="semaine">${semaine}</div></div>
        <div class="carte"><h3>Ton tuteur</h3><p class="sous" style="margin:0">${d.ia ? `IA locale active (${esc(d.modele)}). Pose-lui tes questions pendant les défis de code.` : "IA locale non détectée : le tuteur répond avec des indices écrits à l'avance. Lance Ollama pour l'activer."}</p></div>
      </aside>
    </div>`;

  $$(".noeud").forEach(b => b.onclick = e => { e.stopPropagation(); ouvrirPopover(b); });
  document.onclick = () => $(".popover")?.remove();
  const actuel = $(".noeud.actuel");
  if (actuel) setTimeout(() => actuel.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
  if (!d.profil.prenom) ouvrirProfil();
}

function ouvrirPopover(b) {
  const deja = $(".popover");
  deja?.remove();
  $$(".noeud-wrap.ouvert").forEach(w => w.classList.remove("ouvert"));
  if (deja && deja.dataset.id === b.dataset.id) return;
  jouer("clic");
  const s = b.dataset.statut;
  const p = document.createElement("div");
  p.className = "popover " + (s === "verrou" ? "verrouille" : s === "fait" ? "faite" : "");
  p.dataset.id = b.dataset.id;
  p.innerHTML = `<h3>${b.dataset.titre}</h3><p>Leçon ${b.dataset.n} sur ${b.dataset.total}</p>` + (
    s === "verrou" ? `<button class="btn" disabled>Verrouillée</button><p style="margin:.7rem 0 0">Termine les leçons précédentes pour la débloquer.</p>`
      : `<a class="btn" href="#/lecon/${b.dataset.id}">${s === "fait" ? "Rejouer · +5 XP" : "Commencer · +25 XP"}</a>`);
  p.onclick = e => e.stopPropagation();
  b.parentElement.appendChild(p);
  b.parentElement.classList.add("ouvert");
}

// ================================================================== lecteur commun (leçon / révision)
/* Squelette plein écran : ✕, barre de progression, corps, bouton principal. */
function lecteur(S) {
  nav(null);
  vue.innerHTML = `<div class="lecteur">
      <div class="lecteur-haut"><button class="fermer" id="fermer" aria-label="Quitter">✕</button>
        <div class="progression"><div id="prog" style="width:0%"></div></div><span class="combo" id="combo"></span></div>
      <div class="lecteur-corps" id="corps"></div>
      <div class="lecteur-pied" id="pied"><div class="contenu"><button class="btn" id="principal">Continuer</button></div></div>
    </div>`;
  $("#fermer").onclick = () => S.fini ? (location.hash = "#/") : feuille({
    type: "neutre", titre: `${mascotte(44, "triste")} Attends, ne pars pas !`,
    texte: "Si tu quittes maintenant, tu perds ta progression dans cette session.",
    actions: [{ label: "Continuer", classe: "btn-bleu", action: fermerFeuille }, { label: "Quitter", classe: "btn-sec", action: () => location.hash = "#/" }],
  });
  document.onkeydown = e => {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
    if (e.key === "Enter") { const b = $(".retour .btn") || $("#principal"); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
    if (/^[1-4]$/.test(e.key)) $$(".choix button")[+e.key - 1]?.click();
  };
}

function principal(label, action, actif = true, classe = "") {
  const b = $("#principal");
  b.textContent = label; b.disabled = !actif; b.className = "btn " + classe; b.onclick = action;
  $("#pied").hidden = !!$("#feuille");
}

function feuille({ type, titre, texte = "", actions = [], liens = [] }) {
  fermerFeuille();
  $("#pied").hidden = true;
  const f = document.createElement("div");
  f.className = "retour " + type; f.id = "feuille";
  f.innerHTML = `<div class="contenu"><div class="texte"><h3>${titre}</h3>${texte}
      ${liens.length ? `<div class="liens">${liens.map((l, k) => `<button class="btn-texte" data-l="${k}" ${l.desactive ? "disabled" : ""}>${esc(l.label)}</button>`).join("")}</div>` : ""}</div>
    <div class="actions">${actions.map((a, k) => `<button class="btn ${a.classe || ""}" data-a="${k}">${esc(a.label)}</button>`).join("")}</div></div>`;
  $$("[data-a]", f).forEach(b => b.onclick = () => actions[b.dataset.a].action());
  $$("[data-l]", f).forEach(b => b.onclick = () => liens[b.dataset.l].action());
  document.body.appendChild(f);
  $("[data-a]", f)?.focus({ preventScroll: true });
}
function fermerFeuille() { $("#feuille")?.remove(); const p = $("#pied"); if (p) p.hidden = false; }

function majProgression(S) {
  $("#prog").style.width = (S.i / S.etapes.length) * 100 + "%";
  $("#combo").textContent = S.combo >= 3 ? `🔥 ×${S.combo}` : "";
}

function corps(html, large = false) {
  const c = $("#corps");
  c.className = "lecteur-corps" + (large ? " large" : "");
  c.innerHTML = html;
  c.style.animation = "none"; void c.offsetWidth; c.style.animation = "";
  scrollTo(0, 0);
}

const BRAVOS = ["Bien joué !", "Excellent !", "Parfait !", "Bravo !", "Super !", "Tu gères !"];

/* Étape « quiz » à choix multiple, partagée par les leçons et les révisions. */
function etapeQuiz(S, e, suivante) {
  const q = e.q;
  corps(`${e.rattrapage ? `<div class="etiquette-rattrapage">↺ On revoit ça</div>` : e.lecon ? `<div class="etiquette-rattrapage" style="color:var(--bleu)">🔁 ${esc(e.lecon)}</div>` : ""}
    <div class="consigne-titre">${md(q.q)}</div>
    <div class="choix">${q.choix.map((c, n) => `<button data-n="${n}"><span class="num">${n + 1}</span><span>${md(c)}</span></button>`).join("")}</div>`);
  let choisi = null;
  principal("Vérifier", null, false);
  $$(".choix button").forEach(b => b.onclick = () => {
    $$(".choix button").forEach(x => x.classList.remove("choisi"));
    b.classList.add("choisi"); choisi = +b.dataset.n; jouer("clic");
    principal("Vérifier", verifier, true, "btn-vert");
  });
  function verifier() {
    const juste = choisi === q.bonne;
    $$(".choix button").forEach(b => { b.disabled = true; if (+b.dataset.n === q.bonne) b.classList.add("bon"); });
    if (!juste) $(`.choix button[data-n="${choisi}"]`).classList.add("faux");
    S.repondre(e, juste);
    jouer(juste ? "bon" : "faux");
    feuille(juste
      ? { type: "ok", titre: `<span class="pastille">✓</span>${auHasard(BRAVOS)}`, texte: `<p class="petit">${esc(q.explication)}</p>`, actions: [{ label: "Continuer", classe: "btn-vert", action: suivante }] }
      : { type: "ko", titre: `<span class="pastille">✕</span>Pas tout à fait`, texte: `<p>Bonne réponse : ${md(q.choix[q.bonne]).replace(/<\/?p>/g, "")}</p><p class="petit">${esc(q.explication)}</p>`, actions: [{ label: "Compris", classe: "btn-rouge", action: suivante }] });
  }
}

/* Session générique : suit les étapes, gère combo, rattrapage et score. */
function nouvelleSession(etapes) {
  const S = { etapes, i: 0, combo: 0, bons: 0, totalQuiz: 0, debut: Date.now(), fini: false };
  S.repondre = (e, juste) => {
    S.combo = juste ? S.combo + 1 : 0;
    if (!e.rattrapage) { S.totalQuiz++; if (juste) S.bons++; }
    if (!juste && !e.rattrapage) {
      // Comme dans les applis de langues : la question ratée revient plus loin dans la session
      const pos = S.etapes.findIndex(x => x.type === "defi");
      S.etapes.splice(pos === -1 ? S.etapes.length : pos, 0, { ...e, rattrapage: true });
    }
  };
  return S;
}

const duree = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/* Écrans de fin : résultat, puis série du jour, puis objectif atteint. */
async function celebrer(S, r, titre, tuiles) {
  S.fini = true;
  fermerFeuille();
  $("#prog").style.width = "100%";
  majCompteurs({ ...etat.xp, total: r.xp_total, jour: r.xp_jour, objectif: r.objectif_xp, serie: r.serie });
  const ecrans = [];
  ecrans.push(() => {
    jouer("fin"); confettis();
    corps(`<div class="fin">${mascotte(120, "fete")}<h1>${titre}</h1>
      <div class="tuiles">${tuiles.map(t => `<div class="tuile ${t.c}"><small>${t.l}</small><div>${t.v}</div></div>`).join("")}</div></div>`);
  });
  if (r.premier_du_jour) ecrans.push(async () => {
    const x = await chargerAccueil().then(d => d.xp).catch(() => null);
    const jours = ["D", "L", "M", "M", "J", "V", "S"];
    corps(`<div class="fin"><div class="grosse-flamme">🔥</div><div class="grand-nombre">${r.serie}</div>
      <h2>jour${r.serie > 1 ? "s" : ""} de série !</h2>
      ${x ? `<div class="jours-semaine">${x.semaine.map(j => `<div><span class="${j.xp ? "on" : ""}">${j.xp ? "✓" : ""}</span>${jours[new Date(j.jour + "T12:00").getDay()]}</div>`).join("")}</div>` : ""}
      <p class="sous">Reviens demain pour garder ta série. La régularité compte plus que la durée.</p></div>`);
    jouer("bon");
  });
  if (r.objectif_atteint) ecrans.push(() => {
    confettis(); jouer("fin");
    corps(`<div class="fin">${mascotte(110, "fete")}<h1 style="color:var(--vert)">Objectif du jour atteint !</h1>
      <p class="sous">${r.xp_jour} XP gagnés aujourd'hui sur ${r.objectif_xp}. Tu peux continuer ou t'arrêter là : bravo.</p></div>`);
  });
  let k = 0;
  const suivant = async () => {
    if (k >= ecrans.length) { location.hash = "#/"; return; }
    await ecrans[k++]();
    principal("Continuer", suivant, true, k === 1 ? "btn-vert" : "");
  };
  suivant();
}

// ================================================================== leçon
async function lecteurLecon(id) {
  let l;
  try { l = await api(`/api/lecon/${id}`); }
  catch (e) { toast(esc(e.message), [], 4000); location.hash = "#/"; return; }
  if (!etat.profil) await chargerAccueil().catch(() => {});
  etat.lecon = l;

  const cartes = notions(l.explication);
  const etapes = [{ type: "intro" }];
  const nq = l.quiz.length;
  cartes.forEach((c, k) => {
    etapes.push({ type: "notion", texte: c });
    // Les questions sont réparties entre les notions (une au milieu, une à la fin…)
    l.quiz.forEach((q, iq) => { if (Math.round(((iq + 1) * cartes.length) / nq) === k + 1) etapes.push({ type: "quiz", q }); });
  });
  etapes.push({ type: "defi" });
  const S = nouvelleSession(etapes);
  lecteur(S);

  const suivante = () => { fermerFeuille(); S.i++; afficher(); };
  function afficher() {
    majProgression(S);
    if (S.i >= S.etapes.length) return terminer();
    const e = S.etapes[S.i];
    if (e.type === "intro") {
      corps(`<div class="intro">${mascotte(110)}<h1>${esc(l.titre)}</h1>
        <p class="sous">Leçon ${l.index + 1} · environ ${l.duree_min} min${l.etat.reussie ? " · déjà réussie" : ""}</p>
        <ul class="objectifs-liste">${l.objectifs.map(o => `<li><span>🎯</span>${esc(o)}</li>`).join("")}</ul></div>`);
      principal("C'est parti", suivante);
    } else if (e.type === "notion") {
      corps(`<div class="notion">${md(e.texte)}</div>
        <button class="btn-texte lien-autrement" id="autrement">🤔 Je n'ai pas compris</button><div id="zone-autrement"></div>`);
      $("#autrement").onclick = expliquerAutrement;
      principal("Continuer", suivante);
    } else if (e.type === "quiz") {
      etapeQuiz(S, e, suivante);
    } else if (e.type === "defi") {
      etapeDefi(l, S, suivante);
    }
  }

  async function terminer() {
    let r;
    try { r = await api("/api/fin_lecon", { lecon_id: l.id, quiz_bons: S.bons }); }
    catch { r = { xp_gagne: 0, xp_total: etat.xp?.total || 0, xp_jour: etat.xp?.jour || 0, objectif_xp: etat.xp?.objectif || 20, serie: etat.xp?.serie || 0 }; }
    const precision = S.totalQuiz ? Math.round((S.bons / S.totalQuiz) * 100) : 100;
    celebrer(S, r, "Leçon terminée !", [
      { c: "xp", l: "XP gagnés", v: `⚡ ${r.xp_gagne}` },
      { c: "precision", l: precision >= 90 ? "Impressionnant" : "Précision", v: `🎯 ${precision}%` },
      { c: "temps", l: "Temps", v: `⏱ ${duree(Date.now() - S.debut)}` },
    ]);
  }
  afficher();
}

async function expliquerAutrement() {
  const b = $("#autrement"), zone = $("#zone-autrement");
  b.disabled = true;
  zone.innerHTML = `<div class="autrement sous">${mascotte(32, "pense")} Je cherche une autre façon de l'expliquer…</div>`;
  try {
    const r = await api("/api/autrement", { lecon_id: etat.lecon.id });
    zone.innerHTML = `<div class="autrement notion">${r.texte ? md(r.texte) : esc(r.info)}</div>`;
  } catch { zone.innerHTML = ""; b.disabled = false; }
}

// ------------------------------------------------------------------ défi de code
function etapeDefi(l, S, suivante) {
  const ex = l.exercice;
  etat.dernierTest = Date.now(); etat.relanceTest = false;
  corps(`<div class="defi">
      <div><span class="etiquette-defi">💻 Défi de code</span>
        <div class="notion" style="margin-top:.4rem">${md(ex.consigne)}</div>
        <div id="indices"></div></div>
      <div class="editeur"><div class="gouttiere" id="gouttiere">1</div><textarea id="code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Ton code"></textarea></div>
      <div class="outils-defi">
        <button class="btn-texte" id="b-indice">💡 Indice</button>
        <button class="btn-texte" id="b-tuteur">🤖 Tuteur</button>
        <button class="btn-texte" id="b-tests">✅ Tests (${ex.tests.length})</button>
        <button class="btn-texte" id="b-solution">👀 Solution</button>
        <button class="btn-texte" id="b-reset" style="margin-left:auto;color:var(--encre-3)">↺ Recommencer</button>
      </div></div>`, true);
  const ta = $("#code");
  ta.value = l.etat.brouillon ?? ex.code_depart;
  installerEditeur(ta);
  afficherIndices(ex.indices, ex.nb_indices - ex.indices.length);
  majSolution(ex.solution_disponible, ex.echecs_avant_solution);
  let dernier = null;

  $("#b-indice").onclick = async () => { const r = await api("/api/indice", { lecon_id: l.id }); ex.indices = r.indices; afficherIndices(r.indices, r.restants); fermerFeuille(); };
  $("#b-tuteur").onclick = () => panneauTuteur(l);
  $("#b-tests").onclick = () => panneauTests(ex.tests, dernier);
  $("#b-solution").onclick = async () => {
    try { const r = await api("/api/solution", { lecon_id: l.id }); panneauSolution(r.solution); }
    catch (e) { toast(esc(e.message), [], 3500); }
  };
  $("#b-reset").onclick = () => feuille({
    type: "neutre", titre: "Recommencer depuis le code de départ ?", texte: "<p class='petit'>Ton code actuel sera remplacé.</p>",
    actions: [{ label: "Oui", classe: "btn-rouge", action: () => { ta.value = ex.code_depart; ta.dispatchEvent(new Event("input")); fermerFeuille(); } }, { label: "Non", classe: "btn-sec", action: fermerFeuille }],
  });

  const tester = async () => {
    principal("Vérification…", null, false);
    etat.dernierTest = Date.now(); etat.relanceTest = false;
    try {
      const r = await api("/api/verifier", { lecon_id: l.id, code: ta.value });
      dernier = r; l.etat = r.etat;
      majSolution(r.etat.echecs_recents >= 5 || r.etat.reussie || r.etat.solution_vue, Math.max(0, 5 - r.etat.echecs_recents));
      if (r.reussi) {
        etat.echecsDeSuite = 0; S.combo++; majProgression(S); jouer("bon");
        feuille({ type: "ok", titre: `<span class="pastille">✓</span>Tous les tests passent !`,
          texte: (r.sortie ? `<div class="sortie">${esc(r.sortie)}</div>` : "") + `<p class="petit">${r.premiere_reussite ? "Défi validé : cette leçon reviendra en révision demain." : "Défi réussi."}</p>`,
          actions: [{ label: "Continuer", classe: "btn-vert", action: suivante }] });
      } else {
        etat.echecsDeSuite++; S.combo = 0; majProgression(S); jouer("faux");
        let titre, texte;
        if (r.erreur) {
          const e = r.erreur;
          titre = `${esc(e.type)}${e.ligne ? ` ligne ${e.ligne}` : ""}`;
          texte = `<p>${esc(r.explication.quoi)}</p><p class="petit"><b>Que faire :</b> ${esc(r.explication.comment)}</p>`;
        } else {
          const ko = r.tests.find(t => !t.ok);
          titre = `${r.nb_ok}/${r.nb_tests} tests réussis`;
          texte = `<p>Pas encore : « ${esc(ko.desc)} »</p>${ko.detail ? `<p class="petit">${esc(ko.detail)}</p>` : ""}`;
        }
        if (r.sortie) texte += `<div class="sortie">${esc(r.sortie)}</div>`;
        if (r.coaching) texte += `<p class="petit">🧭 ${esc(r.coaching.texte)}</p>`;
        feuille({ type: "ko", titre: `<span class="pastille">✕</span>${titre}`, texte,
          liens: [
            { label: `💡 Indice${ex.nb_indices - ex.indices.length ? "" : " (tous vus)"}`, desactive: ex.nb_indices - ex.indices.length === 0, action: () => $("#b-indice").click() },
            { label: "🤖 Demander au tuteur", action: () => { fermerFeuille(); panneauTuteur(l, "Je ne comprends pas pourquoi ça ne marche pas."); } },
            { label: "✅ Voir les tests", action: () => panneauTests(ex.tests, r) },
          ],
          actions: [{ label: "Réessayer", classe: "btn-rouge", action: () => { fermerFeuille(); ta.focus(); } }] });
      }
      surveillerFatigue();
    } catch (e) { toast("Le serveur ne répond pas : " + esc(e.message), [], 4000); }
    finally { principal("Vérifier", tester, true, "btn-vert"); }
  };
  etat.tester = tester;
  principal("Vérifier", tester, true, "btn-vert");
  setTimeout(() => ta.focus({ preventScroll: true }), 300);
}

function afficherIndices(indices, restants) {
  $("#indices").innerHTML = indices.map((t, k) => `<div class="indice"><b>Indice ${k + 1}</b> — ${esc(t)}</div>`).join("");
  const b = $("#b-indice");
  b.textContent = restants ? `💡 Indice (${restants})` : "💡 Indices vus";
  b.disabled = restants === 0;
}

function majSolution(dispo, restants) {
  const b = $("#b-solution");
  if (!b) return;
  b.disabled = !dispo;
  b.title = dispo ? "Voir la solution" : `Disponible après ${restants} essai${restants > 1 ? "s" : ""} de plus`;
}

function installerEditeur(ta) {
  const gouttiere = $("#gouttiere");
  const majLignes = () => { gouttiere.textContent = Array.from({ length: ta.value.split("\n").length }, (_, i) => i + 1).join("\n"); };
  let minuteur;
  ta.addEventListener("input", () => {
    majLignes();
    clearTimeout(minuteur);
    minuteur = setTimeout(() => api("/api/brouillon", { lecon_id: etat.lecon.id, code: ta.value }).catch(() => {}), 1200);
  });
  ta.addEventListener("scroll", () => gouttiere.scrollTop = ta.scrollTop);
  ta.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); etat.tester?.(); return; }
    const { selectionStart: s, selectionEnd: f, value: v } = ta;
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        const debut = v.lastIndexOf("\n", s - 1) + 1;
        if (v.slice(debut, debut + 4) === "    ") { ta.setRangeText("", debut, debut + 4, "end"); ta.selectionStart = ta.selectionEnd = Math.max(debut, s - 4); }
      } else ta.setRangeText("    ", s, f, "end");
      ta.dispatchEvent(new Event("input"));
    }
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
      // Indentation automatique : garde le décalage, et ajoute 4 espaces après « : »
      e.preventDefault();
      const debut = v.lastIndexOf("\n", s - 1) + 1;
      const ligne = v.slice(debut, s);
      let indent = ligne.match(/^ */)[0];
      if (/:\s*$/.test(ligne)) indent += "    ";
      ta.setRangeText("\n" + indent, s, f, "end");
      ta.dispatchEvent(new Event("input"));
    }
    if (e.key === "Backspace" && s === f) {
      const debut = v.lastIndexOf("\n", s - 1) + 1;
      const avant = v.slice(debut, s);
      if (avant.length && /^ +$/.test(avant) && avant.length % 4 === 0) { e.preventDefault(); ta.setRangeText("", s - 4, s, "end"); ta.dispatchEvent(new Event("input")); }
    }
  });
  majLignes();
}

// ------------------------------------------------------------------ panneaux (tuteur, tests, solution)
function panneau(titre, html) {
  $(".voile")?.remove();
  const v = document.createElement("div");
  v.className = "voile";
  v.innerHTML = `<div class="panneau" role="dialog" aria-label="${esc(titre)}"><div class="panneau-tete">${mascotte(36)}<h3>${esc(titre)}</h3><button class="fermer" aria-label="Fermer">✕</button></div>${html}</div>`;
  v.onclick = e => { if (e.target === v) v.remove(); };
  $(".fermer", v).onclick = () => v.remove();
  document.body.appendChild(v);
  return v;
}

function panneauTests(tests, r) {
  const res = r ? r.tests : tests.map(desc => ({ desc, ok: null }));
  panneau("Ce qui est vérifié", `<ul class="tests-liste">${res.map(t => `<li>${t.ok === null ? "◦" : t.ok ? "✅" : "❌"} <span>${esc(t.desc)}${t.detail ? `<br><span class="sous">${esc(t.detail)}</span>` : ""}</span></li>`).join("")}</ul>
    ${r ? "" : `<p class="sous">Appuie sur « Vérifier » pour lancer les tests sur ton code.</p>`}`);
}

function panneauSolution(sol) {
  panneau("Solution", `<p class="sous" style="margin-top:0">Lis-la, ferme ce panneau, puis réécris-la de mémoire : c'est comme ça qu'on retient.</p><pre class="bloc-code">${esc(sol)}</pre>`);
}

function panneauTuteur(l, questionInitiale) {
  const v = panneau("Tuteur", `
    <div class="fil-chat" id="fil-chat"></div>
    <div class="suggestions">
      <button data-q="Je ne comprends pas l'erreur.">Je ne comprends pas l'erreur</button>
      <button data-q="Par où je commence ?">Par où je commence ?</button>
      <button data-q="Un test échoue, pourquoi ?">Un test échoue, pourquoi ?</button>
    </div>
    <form class="saisie" id="form-chat"><input id="question" placeholder="Pose ta question…" autocomplete="off"><button class="btn btn-bleu">➤</button></form>`);
  const fil = $("#fil-chat", v);
  const bulle = (role, texte, source) => {
    const d = document.createElement("div");
    d.className = "msg " + role; d.textContent = texte;
    if (source === "regles") d.innerHTML += `<span class="src">réponse guidée (sans IA)</span>`;
    fil.appendChild(d); fil.scrollTop = fil.scrollHeight; return d;
  };
  if (!l.chat.length) bulle("tuteur", "Je regarde ton code à chaque question. Je ne te donnerai pas la solution, mais je vais t'aider à la trouver.");
  l.chat.forEach(m => bulle(m.role, m.texte));
  const demander = async q => {
    bulle("eleve", q); l.chat.push({ role: "eleve", texte: q });
    const attente = bulle("tuteur attente", etat.ia ? "Je réfléchis…" : "…");
    try {
      const r = await api("/api/tuteur", { lecon_id: l.id, code: $("#code")?.value || "", question: q });
      attente.remove(); bulle("tuteur", r.texte, r.source); l.chat.push({ role: "tuteur", texte: r.texte });
    } catch (e) { attente.textContent = "Le tuteur n'a pas pu répondre : " + e.message; }
  };
  $("#form-chat", v).onsubmit = e => { e.preventDefault(); const q = $("#question", v).value.trim(); if (q) { $("#question", v).value = ""; demander(q); } };
  $$(".suggestions button", v).forEach(b => b.onclick = () => demander(b.dataset.q));
  if (questionInitiale) demander(questionInitiale);
}

// ================================================================== révisions
async function lecteurRevision() {
  if (!etat.profil) await chargerAccueil().catch(() => {});
  const { questions } = await api("/api/revisions");
  if (!questions.length) {
    nav("reviser");
    vue.innerHTML = `<div class="carte vide" style="max-width:560px;margin:2rem auto">${mascotte(100, "fete")}
      <h2>Rien à réviser aujourd'hui</h2>
      <p class="sous">Chaque notion réussie revient au bon moment : 1, 2, 4, 8 puis 16 jours plus tard. C'est ce qui la fait passer en mémoire longue.</p>
      <a class="btn" href="#/">Continuer à apprendre</a></div>`;
    return;
  }
  // On alterne les types d'exercices pour garder la session vivante
  const quiz = melanger(questions.filter(q => q.type === "quiz"));
  const ordres = melanger(questions.filter(q => q.type === "ordre"));
  const etapes = [];
  while (quiz.length || ordres.length) {
    if (quiz.length) etapes.push({ type: "quiz", q: quiz.shift() });
    if (quiz.length) etapes.push({ type: "quiz", q: quiz.shift() });
    if (ordres.length) etapes.push({ type: "ordre", o: ordres.shift() });
  }
  etapes.forEach(e => { if (e.q) { e.lecon_id = e.q.lecon_id; e.lecon = e.q.lecon; } if (e.o) { e.lecon_id = e.o.lecon_id; e.lecon = e.o.lecon; } });

  const S = nouvelleSession(etapes);
  const resultats = {};
  const repondre = S.repondre;
  S.repondre = (e, juste) => { repondre(e, juste); if (!e.rattrapage) resultats[e.lecon_id] = (resultats[e.lecon_id] ?? true) && juste; };
  lecteur(S);

  const suivante = () => { fermerFeuille(); S.i++; afficher(); };
  function afficher() {
    majProgression(S);
    if (S.i >= S.etapes.length) return terminer();
    const e = S.etapes[S.i];
    if (e.type === "quiz") etapeQuiz(S, e, suivante);
    else etapeOrdre(S, e, suivante);
  }
  async function terminer() {
    let r;
    try { r = await api("/api/fin_revision", { resultats }); }
    catch { r = { xp_gagne: 0, xp_total: 0, xp_jour: 0, objectif_xp: 20, serie: 0 }; }
    const parfaites = Object.values(resultats).filter(Boolean).length;
    celebrer(S, r, "Révision terminée !", [
      { c: "xp", l: "XP gagnés", v: `⚡ ${r.xp_gagne}` },
      { c: "precision", l: "Notions sûres", v: `🧠 ${parfaites}/${Object.keys(resultats).length}` },
      { c: "temps", l: "Temps", v: `⏱ ${duree(Date.now() - S.debut)}` },
    ]);
  }
  afficher();
}

/* « Remets le code dans l'ordre » : les lignes de la solution d'une leçon déjà réussie, mélangées. */
function etapeOrdre(S, e, suivante) {
  const o = e.o;
  let banque = melanger(o.lignes.map((t, k) => ({ t, k })));
  if (banque.every((x, k) => x.k === k) && banque.length > 1) banque.reverse();
  const reponse = [];
  corps(`<div class="etiquette-rattrapage" style="color:var(--bleu)">🧩 ${esc(o.lecon)}</div>
    <div class="consigne-titre">Remets le code dans l'ordre</div>
    <p class="sous" style="margin-top:-.6rem">${md(o.consigne).replace(/<\/?p>/g, "")}</p>
    <div class="zone-reponse" id="reponse"></div>
    <div class="banque" id="banque">${banque.map((x, n) => `<button class="ligne-code" data-n="${n}">${esc(x.t)}</button>`).join("")}</div>`);
  principal("Vérifier", null, false);
  const majZone = () => {
    $("#reponse").innerHTML = reponse.map((n, pos) => `<button class="ligne-code" data-pos="${pos}">${esc(banque[n].t)}</button>`).join("");
    $$("#banque .ligne-code").forEach(b => b.classList.toggle("utilisee", reponse.includes(+b.dataset.n)));
    $$("#reponse .ligne-code").forEach(b => b.onclick = () => { reponse.splice(+b.dataset.pos, 1); jouer("clic"); majZone(); });
    principal("Vérifier", verifier, reponse.length === banque.length, reponse.length === banque.length ? "btn-vert" : "");
  };
  $$("#banque .ligne-code").forEach(b => b.onclick = () => { if (!reponse.includes(+b.dataset.n)) { reponse.push(+b.dataset.n); jouer("clic"); majZone(); } });
  function verifier() {
    const propose = reponse.map(n => banque[n].t);
    const juste = propose.every((t, k) => t === o.lignes[k]);
    S.repondre(e, juste);
    jouer(juste ? "bon" : "faux");
    $$("#reponse .ligne-code, #banque .ligne-code").forEach(b => b.disabled = true);
    feuille(juste
      ? { type: "ok", titre: `<span class="pastille">✓</span>${auHasard(BRAVOS)}`, texte: `<p class="petit">Tu te souviens de la structure de ce code.</p>`, actions: [{ label: "Continuer", classe: "btn-vert", action: suivante }] }
      : { type: "ko", titre: `<span class="pastille">✕</span>Pas tout à fait`, texte: `<p class="petit">Le bon ordre :</p><pre class="bloc-code" style="max-height:30vh">${esc(o.lignes.join("\n"))}</pre>`, actions: [{ label: "Compris", classe: "btn-rouge", action: suivante }] });
  }
}

// ================================================================== page : progrès
async function pageProgres() {
  nav("progres");
  const d = await chargerAccueil();
  const j = await api("/api/journal");
  const x = d.xp;
  const lecons = d.parcours.flatMap(m => m.lecons);
  const faites = lecons.filter(l => l.reussie);
  const minutes = j.historique.reduce((s, h) => s + h.minutes, 0);
  const jours = ["D", "L", "M", "M", "J", "V", "S"];
  const max = Math.max(x.objectif, ...x.semaine.map(s => s.xp));
  const erreurs = d.plan.erreurs_frequentes;
  vue.innerHTML = `<div class="page-progres">
    <h1>Tes progrès</h1>
    <div class="stats">
      <div class="stat"><span class="ico">🔥</span><div><b>${x.serie}</b><span>jours de série</span></div></div>
      <div class="stat"><span class="ico">⚡</span><div><b>${x.total}</b><span>XP au total</span></div></div>
      <div class="stat"><span class="ico">📘</span><div><b>${faites.length} / ${lecons.length}</b><span>leçons réussies</span></div></div>
      <div class="stat"><span class="ico">⏱</span><div><b>${minutes} min</b><span>sur 14 jours</span></div></div>
    </div>
    <div class="carte"><h3>XP des 7 derniers jours</h3>
      <div class="semaine" style="height:110px">${x.semaine.map(s => `<div><span class="${s.xp ? "" : "zero"}" style="height:${Math.max(4, (s.xp / max) * 85)}px"></span>${jours[new Date(s.jour + "T12:00").getDay()]}</div>`).join("")}</div>
      <p class="sous" style="margin:.6rem 0 0">Objectif : ${x.objectif} XP par jour · <button class="btn-texte" id="changer-objectif" style="padding:0">changer</button></p></div>
    <div class="carte"><h3>Mémorisation</h3>
      ${faites.length ? `<ul class="memo">${faites.map(l => `<li><span>${esc(l.titre)}</span><span class="niveaux" title="Niveau ${l.maitrise}/5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= l.maitrise ? "on" : ""}"></i>`).join("")}</span></li>`).join("")}</ul>
        <p class="sous" style="margin:.6rem 0 0">Chaque révision réussie fait monter une notion d'un niveau ; une erreur la fait revenir plus tôt.</p>`
      : `<p class="sous" style="margin:0">Réussis ta première leçon pour commencer à mémoriser.</p>`}</div>
    ${erreurs.length ? `<div class="carte"><h3>Tes erreurs fréquentes cette semaine</h3>${erreurs.map(e => `<span class="etiquette">${esc(e.erreur_type)} ×${e.n}</span>`).join("")}
      <p class="sous" style="margin:.6rem 0 0">Normal en apprenant : chacune est expliquée quand elle arrive.</p></div>` : ""}
  </div>`;
  $("#changer-objectif").onclick = ouvrirProfil;
}

// ================================================================== réglages
function ouvrirProfil() {
  const dlg = $("#dlg-profil"), f = $("#form-profil");
  f.prenom.value = etat.profil?.prenom || "";
  const obj = String(etat.profil?.objectif_xp || 20);
  $$("input[name=objectif_xp]", f).forEach(r => r.checked = r.value === obj);
  f.sons.checked = etat.profil ? etat.profil.sons : true;
  dlg.showModal();
}
$("#btn-profil").onclick = ouvrirProfil;
$("#c-objectif").onclick = () => { location.hash = "#/progres"; };
$("#dlg-profil").addEventListener("close", async () => {
  if ($("#dlg-profil").returnValue !== "ok") return;
  const f = $("#form-profil");
  const choix = $("input[name=objectif_xp]:checked", f);
  await api("/api/profil", { prenom: f.prenom.value.trim(), objectif_xp: choix ? +choix.value : 20, sons: f.sons.checked });
  router();
});

// ================================================================== suivi du comportement (sans caméra)
// Signaux : activité clavier/souris, temps sans tester, échecs successifs, durée de session.
["keydown", "mousemove", "mousedown", "scroll", "touchstart"].forEach(ev =>
  addEventListener(ev, () => {
    const absence = Date.now() - etat.derniereInteraction;
    etat.derniereInteraction = Date.now();
    if (absence > 15 * 60e3) { etat.debutSession = Date.now(); toast("Re-bonjour 👋 Relis la dernière étape avant de reprendre : ça aide à se remettre dedans.", [], 6000); }
  }, { passive: true }));

setInterval(async () => {
  const actif = document.visibilityState === "visible" && Date.now() - etat.derniereInteraction < 120e3;
  if (!actif) return;
  try { await api("/api/activite", {}); } catch {}
  const surDefi = !!$("#code") && !$("#feuille");
  if (surDefi && !etat.relanceTest && Date.now() - etat.dernierTest > 8 * 60e3) {
    etat.relanceTest = true;
    toast("Ça fait un moment que tu n'as pas vérifié ton code. Tester souvent, même incomplet, montre vite où ça coince.",
      [{ label: "Vérifier", action: () => etat.tester?.() }, { label: "Plus tard" }]);
  }
  surveillerFatigue();
}, 60e3);

function surveillerFatigue() {
  const session = (Date.now() - etat.debutSession) / 60e3;
  if (etat.pauseProposee && Date.now() - etat.pauseProposee < 30 * 60e3) return;
  if (session > 50 || (session > 30 && etat.echecsDeSuite >= 4)) {
    etat.pauseProposee = Date.now();
    toast(session > 50
      ? "Plus de 50 minutes de travail : une pause de 5 à 10 minutes aide ton cerveau à mémoriser."
      : "Plusieurs essais ratés après une longue session : souvent un signe de fatigue. Une courte pause ?",
      [{ label: "Je fais une pause", action: () => { etat.debutSession = Date.now() + 5 * 60e3; } }, { label: "Je continue" }]);
  }
}

// ================================================================== routeur
async function router() {
  $(".voile")?.remove(); fermerFeuille(); $(".popover")?.remove(); $$(".confettis").forEach(c => c.remove());
  document.onkeydown = null; etat.tester = null;
  const h = location.hash || "#/";
  try {
    if (h.startsWith("#/lecon/")) await lecteurLecon(h.split("/")[2]);
    else if (h === "#/revisions") await lecteurRevision();
    else if (h === "#/progres") await pageProgres();
    else await pageChemin();
  } catch (e) {
    nav("apprendre");
    vue.innerHTML = `<div class="carte vide" style="max-width:560px;margin:2rem auto">${mascotte(90, "triste")}<h2>Le serveur ne répond pas</h2><p class="sous">Vérifie que Mentor IA est toujours lancé dans le terminal.</p></div>`;
  }
}
addEventListener("hashchange", router);
router();
