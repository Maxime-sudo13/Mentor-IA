/* Mentor IA — interface locale. Aucune dépendance externe : fonctionne hors ligne. */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const vue = $("#vue");
const etat = { profil: null, ia: false, lecon: null, derniereInteraction: Date.now(), dernierTest: null, debutSession: Date.now(), dernierEchecs: 0 };

// ------------------------------------------------------------------ outils
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

/* Mini-rendu Markdown : titres, paragraphes, listes, tableaux, code, gras. */
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
    if (l.startsWith("### ")) { html += `<h3>${inline(l.slice(4))}</h3>`; i++; continue; }
    if (l.trim() === "") { i++; continue; }
    const para = [];
    while (i < lignes.length && lignes[i].trim() !== "" && !/^(```|\||[-*] |\d+\. )/.test(lignes[i])) para.push(lignes[i++]);
    html += `<p>${inline(para.join(" "))}</p>`;
  }
  return html;
}

function toast(html, actions = [], duree = 0) {
  const t = $("#toast");
  t.innerHTML = html + (actions.length ? `<div class="actions">${actions.map((a, k) => `<button class="btn btn-petit ${k ? "btn-sec" : "btn-accent"}" data-k="${k}">${esc(a.label)}</button>`).join("")}</div>` : "");
  t.hidden = false;
  t.querySelectorAll("button").forEach(b => b.onclick = () => { t.hidden = true; actions[b.dataset.k].action?.(); });
  clearTimeout(t._timer);
  if (duree) t._timer = setTimeout(() => t.hidden = true, duree);
}

function majBarre(plan) {
  $("#serie").textContent = plan.serie;
  majTemps(plan.minutes, plan.objectif_minutes);
  const ia = $("#ia-etat");
  ia.className = "ia-etat " + (etat.ia ? "on" : "off");
  $("#ia-texte").textContent = etat.ia ? "IA locale active" : "Mode sans IA";
  ia.title = etat.ia ? `Modèle : ${etat.modele}` : "Ollama n'est pas détecté : les indices et explications écrits à l'avance restent disponibles.";
}

function majTemps(minutes, objectif) {
  objectif = objectif || etat.profil?.objectif_minutes || 45;
  $("#temps").textContent = `${minutes} / ${objectif} min`;
  $("#jauge").style.width = Math.min(100, (minutes / objectif) * 100) + "%";
  // Félicite une seule fois, au moment précis où l'objectif est franchi
  const atteint = minutes >= objectif;
  const avant = etat.objectifAtteint;
  etat.objectifAtteint = atteint;
  if (atteint && avant === false) toast(`🎯 Objectif du jour atteint (${objectif} min) ! Tu peux continuer, ou t'arrêter là : la régularité compte plus que la durée.`, [{ label: "OK" }], 12000);
}

// ------------------------------------------------------------------ accueil
async function pageAccueil() {
  const d = await api("/api/accueil");
  etat.profil = d.profil; etat.ia = d.ia; etat.modele = d.modele;
  majBarre(d.plan);
  const p = d.plan;
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const ico = { revision: "🔁", lecon: "📘", consolider: "🧱" };
  const lien = t => t.type === "revision" ? "#/revisions" : `#/lecon/${t.lecon_id}`;

  const taches = p.taches.length ? p.taches.map(t => `
      <a class="tache t-${t.type}" href="${lien(t)}">
        <div class="tache-ico">${ico[t.type]}</div>
        <div class="tache-corps"><div class="tache-titre">${esc(t.titre)}</div><div class="tache-detail">${esc(t.detail)}</div></div>
        <div class="tache-duree">~${t.duree_min} min</div>
      </a>`).join("")
    : `<div class="vide-etat"><div class="fete">🎉</div><h3>Module terminé !</h3><p class="sous">Continue les révisions les prochains jours pour tout garder en mémoire.</p></div>`;

  const parcours = d.parcours.map(m => {
    const faites = m.lecons.filter(l => l.reussie).length;
    return `<div class="carte">
      <h2>${esc(m.titre)}</h2>
      <p class="sous">${esc(m.description)}</p>
      <div class="progression-module"><div style="width:${(faites / m.lecons.length) * 100}%"></div></div>
      <ul class="parcours-lecons">${m.lecons.map((l, k) => `
        <li class="${l.reussie ? "ok" : l.debloquee ? "dispo" : "verrou"}">
          <span class="pastille">${l.reussie ? "✓" : k + 1}</span>
          ${l.debloquee ? `<a href="#/lecon/${l.id}">${esc(l.titre)}</a>` : `<span style="flex:1">${esc(l.titre)}</span><span title="Termine la leçon précédente">🔒</span>`}
          ${l.reussie ? `<span class="maitrise" title="Mémorisation : ${l.maitrise}/5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= l.maitrise ? "on" : ""}"></i>`).join("")}</span>` : ""}
        </li>`).join("")}
      </ul></div>`;
  }).join("");

  const j = await api("/api/journal");
  const max = Math.max(30, ...j.historique.map(h => h.minutes));
  const histo = j.historique.map(h => `<div class="${h.minutes ? "" : "vide"}" style="height:${Math.max(3, (h.minutes / max) * 100)}%" title="${h.jour} : ${h.minutes} min, ${h.reussites}/${h.tentatives} essais réussis"></div>`).join("");
  const erreurs = p.erreurs_frequentes.length
    ? `<p class="sous" style="margin-top:1rem">Erreurs les plus fréquentes cette semaine : ${p.erreurs_frequentes.map(e => `<span class="etiquette">${esc(e.erreur_type)} ×${e.n}</span>`).join(" ")}</p>` : "";

  vue.innerHTML = `
    <section class="salut">
      <div class="date">${esc(date)}</div>
      <h1>${d.profil.prenom ? "Bonjour " + esc(d.profil.prenom) : "Bienvenue"}</h1>
      <div class="message-ia"><div class="avatar">M</div><p style="margin:.3rem 0 0">${esc(p.message)}</p></div>
    </section>
    <div class="grille-accueil">
      <div>
        <div class="carte">
          <h2>Ton programme du jour</h2>
          <div class="taches">${taches}</div>
        </div>
        <div class="carte" style="margin-top:1.5rem">
          <h2>Tes 14 derniers jours</h2>
          <div class="histo">${histo}</div>
          <div class="histo-legende"><span>il y a 2 semaines</span><span>aujourd'hui</span></div>
          <p class="sous" style="margin-top:.8rem">${p.nb_reussies} leçon${p.nb_reussies > 1 ? "s" : ""} réussie${p.nb_reussies > 1 ? "s" : ""} sur ${p.nb_lecons}.</p>
          ${erreurs}
        </div>
      </div>
      <div>${parcours}</div>
    </div>`;

  if (!d.profil.prenom) ouvrirProfil();
}

// ------------------------------------------------------------------ leçon
async function pageLecon(id) {
  let l;
  try { l = await api(`/api/lecon/${id}`); }
  catch (e) { vue.innerHTML = `<div class="carte vide-etat"><h2>${esc(e.message)}</h2><a class="btn" href="#/">Retour à l'accueil</a></div>`; return; }
  etat.lecon = l; etat.dernierTest = Date.now(); etat.relanceTest = false;
  const ex = l.exercice;
  const code = l.etat.brouillon ?? ex.code_depart;

  vue.innerHTML = `
    <div class="fil"><a href="#/">Accueil</a> › Leçon ${l.index + 1}</div>
    <div class="lecon">
      <article class="carte cours">
        <h1>${esc(l.titre)}</h1>
        <div class="objectifs">${l.objectifs.map(o => `<span>${esc(o)}</span>`).join("")}</div>
        <div class="md">${md(l.explication)}</div>
        <button class="btn btn-sec btn-petit" id="btn-autrement">💡 Explique-moi autrement</button>
        <div id="autrement"></div>
      </article>

      <section>
        <div class="carte">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem">
            <h2 style="margin:0">Exercice</h2>
            ${l.etat.reussie ? `<span class="etiquette" style="background:var(--vert-doux);color:var(--vert)">✓ Réussi</span>` : `<span class="sous" id="nb-essais">${l.etat.tentatives} essai${l.etat.tentatives > 1 ? "s" : ""}</span>`}
          </div>
          <div class="consigne md">${md(ex.consigne)}</div>
          <div class="editeur"><div class="gouttiere" id="gouttiere">1</div><textarea id="code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Ton code"></textarea></div>
          <div class="editeur-actions">
            <button class="btn btn-accent" id="btn-tester">▶ Tester <span class="kbd">Ctrl+Entrée</span></button>
            <button class="btn btn-sec" id="btn-indice">Indice <span id="nb-indices"></span></button>
            <button class="btn btn-sec" id="btn-solution">Solution</button>
            <span class="espace"></span>
            <button class="btn btn-sec btn-petit" id="btn-reset" title="Revenir au code de départ">↺ Recommencer</button>
          </div>
          <div id="indices"></div>
          <div id="solution" class="solution"></div>
          <div class="resultat" id="resultat"></div>
          <details style="margin-top:.6rem"><summary class="sous" style="cursor:pointer">Ce qui sera vérifié (${ex.tests.length} tests)</summary>
            <ul class="tests">${ex.tests.map(t => `<li>◦ ${esc(t)}</li>`).join("")}</ul></details>
        </div>

        <div class="carte tuteur">
          <div class="tuteur-entete"><h2 style="margin:0">Tuteur</h2><span class="sous">${etat.ia ? "IA locale" : "Mode sans IA : réponses guidées"}</span></div>
          <div class="fil-chat" id="fil-chat">${l.chat.length ? "" : `<div class="bulle tuteur">Je regarde ton code et tes erreurs à chaque question. Je ne te donnerai pas la solution, mais je vais t'aider à la trouver.</div>`}</div>
          <div class="suggestions">
            <button data-q="Je ne comprends pas l'erreur.">Je ne comprends pas l'erreur</button>
            <button data-q="Par où je commence ?">Par où je commence ?</button>
            <button data-q="Mon code tourne mais un test échoue, pourquoi ?">Un test échoue, pourquoi ?</button>
          </div>
          <form class="saisie" id="form-chat"><input id="question" placeholder="Pose ta question…" autocomplete="off"><button class="btn">Envoyer</button></form>
        </div>
      </section>
    </div>`;

  const ta = $("#code");
  ta.value = code;
  installerEditeur(ta);
  l.chat.forEach(m => bulle(m.role, m.texte));
  afficherIndices(ex.indices, ex.nb_indices - ex.indices.length);
  if (ex.solution) afficherSolution(ex.solution);
  majBoutonSolution(ex.solution_disponible, ex.echecs_avant_solution);

  $("#btn-tester").onclick = tester;
  $("#btn-indice").onclick = async () => { const r = await api("/api/indice", { lecon_id: id }); afficherIndices(r.indices, r.restants); };
  $("#btn-solution").onclick = async () => {
    try { const r = await api("/api/solution", { lecon_id: id }); afficherSolution(r.solution); }
    catch (e) { toast(esc(e.message), [], 4000); }
  };
  $("#btn-reset").onclick = () => { if (confirmerReset()) { ta.value = ex.code_depart; ta.dispatchEvent(new Event("input")); } };
  $("#btn-autrement").onclick = expliquerAutrement;
  $("#form-chat").onsubmit = e => { e.preventDefault(); const q = $("#question").value.trim(); if (q) { $("#question").value = ""; demander(q); } };
  vue.querySelectorAll(".suggestions button").forEach(b => b.onclick = () => demander(b.dataset.q));
}

function confirmerReset() {
  // Pas de boîte de dialogue bloquante : double clic dans les 3 s pour confirmer.
  const b = $("#btn-reset");
  if (b.dataset.arme) { delete b.dataset.arme; b.textContent = "↺ Recommencer"; return true; }
  b.dataset.arme = "1"; b.textContent = "Clique encore pour confirmer";
  setTimeout(() => { delete b.dataset.arme; b.textContent = "↺ Recommencer"; }, 3000);
  return false;
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
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); tester(); return; }
    const { selectionStart: s, selectionEnd: f, value: v } = ta;
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        const debut = v.lastIndexOf("\n", s - 1) + 1;
        if (v.slice(debut, debut + 4) === "    ") { ta.setRangeText("", debut, debut + 4, "end"); ta.selectionStart = ta.selectionEnd = Math.max(debut, s - 4); }
      } else ta.setRangeText("    ", s, f, "end");
      ta.dispatchEvent(new Event("input"));
    }
    if (e.key === "Enter" && !e.shiftKey) {
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

async function tester() {
  const l = etat.lecon, btn = $("#btn-tester");
  btn.disabled = true; etat.dernierTest = Date.now(); etat.relanceTest = false;
  try {
    const r = await api("/api/verifier", { lecon_id: l.id, code: $("#code").value });
    afficherResultat(r);
    etat.lecon.etat = r.etat;
    const ne = $("#nb-essais");
    if (ne) ne.textContent = r.reussi ? "✓ Réussi" : `${r.etat.tentatives} essai${r.etat.tentatives > 1 ? "s" : ""}`;
    majBoutonSolution(r.etat.echecs_recents >= 5 || r.etat.reussie || r.etat.solution_vue, Math.max(0, 5 - r.etat.echecs_recents));
    etat.dernierEchecs = r.reussi ? 0 : etat.dernierEchecs + 1;
    surveillerFatigue();
  } finally { btn.disabled = false; }
}

function afficherResultat(r) {
  const box = $("#resultat");
  let h = r.reussi
    ? `<div class="bandeau ok">✓ Tous les tests passent (${r.nb_ok}/${r.nb_tests}) ${r.premiere_reussite ? "— leçon validée !" : ""}</div>`
    : `<div class="bandeau ko">${r.nb_ok}/${r.nb_tests} tests réussis</div>`;
  if (r.erreur) {
    const e = r.erreur;
    h += `<div class="erreur-box"><b>${esc(e.type)}</b>${e.ligne ? ` — ligne ${e.ligne}` : ""}${e.pendant_test ? ` (pendant le test « ${esc(e.pendant_test)} »)` : ""}<br>
      <span class="sous">${esc(e.message)}</span><br><br>${esc(r.explication.quoi)}<br><strong>Que faire :</strong> ${esc(r.explication.comment)}</div>`;
  }
  if (r.sortie) h += `<div class="sous">Ce que ton programme affiche :</div><div class="sortie">${esc(r.sortie)}</div>`;
  h += `<ul class="tests">${r.tests.map(t => `<li>${t.ok ? "✅" : "❌"} <span>${esc(t.desc)}${t.detail ? `<br><span class="detail">${esc(t.detail)}</span>` : ""}</span></li>`).join("")}</ul>`;
  if (r.coaching) h += `<div class="coach"><span>🧭</span><span>${esc(r.coaching.texte)}</span></div>`;
  if (r.reussi && etat.lecon.suivante) h += `<a class="btn" href="#/lecon/${etat.lecon.suivante}">Leçon suivante →</a> <a class="btn btn-sec" href="#/">Accueil</a>`;
  else if (r.reussi) h += `<a class="btn" href="#/">Retour à l'accueil</a>`;
  box.innerHTML = h; box.classList.add("visible");
  if (r.premiere_reussite) toast("🎉 Bravo, leçon validée ! Je te la reproposerai en révision demain pour bien l'ancrer.", [], 6000);
}

function afficherIndices(indices, restants) {
  $("#indices").innerHTML = indices.map((t, k) => `<div class="indice"><b>Indice ${k + 1}</b> — ${esc(t)}</div>`).join("");
  const b = $("#btn-indice");
  $("#nb-indices").textContent = restants ? `(${restants})` : "";
  b.disabled = restants === 0;
}

function afficherSolution(sol) {
  $("#solution").innerHTML = `<div class="sous" style="margin-top:.5rem">Solution — lis-la, ferme-la, puis réécris-la de mémoire :</div><pre>${esc(sol)}</pre>`;
}

function majBoutonSolution(dispo, restants) {
  const b = $("#btn-solution");
  if (!b) return;
  b.disabled = !dispo;
  b.title = dispo ? "Afficher la solution" : `Disponible après ${restants} essai${restants > 1 ? "s" : ""} de plus : cherche encore un peu !`;
}

function bulle(role, texte, source) {
  const fil = $("#fil-chat");
  const div = document.createElement("div");
  div.className = "bulle " + role;
  div.textContent = texte;
  if (source === "regles") div.innerHTML += `<span class="src">réponse guidée (sans IA)</span>`;
  fil.appendChild(div); fil.scrollTop = fil.scrollHeight;
  return div;
}

async function demander(question) {
  bulle("eleve", question);
  const attente = bulle("tuteur attente", etat.ia ? "Le tuteur réfléchit… (une IA locale peut prendre quelques secondes)" : "…");
  try {
    const r = await api("/api/tuteur", { lecon_id: etat.lecon.id, code: $("#code").value, question });
    attente.remove(); bulle("tuteur", r.texte, r.source);
  } catch (e) { attente.textContent = "Le tuteur n'a pas pu répondre : " + e.message; }
}

async function expliquerAutrement() {
  const zone = $("#autrement"), b = $("#btn-autrement");
  b.disabled = true; zone.innerHTML = `<div class="autrement sous">Je prépare une autre explication…</div>`;
  try {
    const r = await api("/api/autrement", { lecon_id: etat.lecon.id });
    zone.innerHTML = `<div class="autrement">${r.texte ? md(r.texte) : esc(r.info)}</div>`;
  } finally { b.disabled = false; }
}

// ------------------------------------------------------------------ révisions
async function pageRevisions() {
  const { questions } = await api("/api/revisions");
  if (!questions.length) {
    vue.innerHTML = `<div class="carte quiz vide-etat"><div class="fete">✨</div><h2>Aucune révision aujourd'hui</h2><p class="sous">Tout est à jour. Les notions reviennent au bon moment : 1, 2, 4, 8 puis 16 jours après.</p><a class="btn" href="#/">Retour</a></div>`;
    return;
  }
  const parLecon = {};
  let k = 0;
  const suivante = () => {
    if (k >= questions.length) return fin();
    const q = questions[k];
    vue.innerHTML = `<div class="carte quiz">
      <div class="compteur">Question ${k + 1} / ${questions.length} · ${esc(q.lecon)}</div>
      <h2 style="margin-top:.6rem" class="md">${md(q.q)}</h2>
      <div class="choix">${q.choix.map((c, n) => `<button data-n="${n}" class="md">${md(c)}</button>`).join("")}</div>
      <div id="expl"></div></div>`;
    vue.querySelectorAll(".choix button").forEach(b => b.onclick = () => {
      const n = +b.dataset.n, juste = n === q.bonne;
      parLecon[q.lecon_id] = (parLecon[q.lecon_id] ?? true) && juste;
      vue.querySelectorAll(".choix button").forEach(x => { x.disabled = true; if (+x.dataset.n === q.bonne) x.classList.add("bon"); });
      if (!juste) b.classList.add("faux");
      $("#expl").innerHTML = `<p>${juste ? "✅ Exact." : "❌ Pas tout à fait."} ${esc(q.explication)}</p><button class="btn" id="suiv">${k + 1 < questions.length ? "Suivante" : "Terminer"}</button>`;
      $("#suiv").onclick = () => { k++; suivante(); };
      $("#suiv").focus();
    });
  };
  const fin = async () => {
    const res = await Promise.all(Object.entries(parLecon).map(([lid, ok]) => api("/api/revision", { lecon_id: lid, tout_juste: ok }).then(r => ({ lid, ok, ...r }))));
    const reussies = res.filter(r => r.ok).length;
    vue.innerHTML = `<div class="carte quiz vide-etat"><div class="fete">${reussies === res.length ? "🏆" : "💪"}</div>
      <h2>${reussies} notion${reussies > 1 ? "s" : ""} sur ${res.length} parfaitement maîtrisée${reussies > 1 ? "s" : ""}</h2>
      <p class="sous">Les notions ratées reviendront demain ; les autres s'espacent.</p><a class="btn" href="#/">Continuer</a></div>`;
  };
  suivante();
}

// ------------------------------------------------------------------ profil
function ouvrirProfil() {
  const dlg = $("#dlg-profil"), f = $("#form-profil");
  f.prenom.value = etat.profil?.prenom || "";
  f.objectif_minutes.value = etat.profil?.objectif_minutes || 45;
  dlg.showModal();
}
$("#btn-profil").onclick = ouvrirProfil;
$("#dlg-profil").addEventListener("close", async () => {
  if ($("#dlg-profil").returnValue !== "ok") return;
  const f = $("#form-profil");
  await api("/api/profil", { prenom: f.prenom.value.trim(), objectif_minutes: +f.objectif_minutes.value || 45 });
  if (location.hash === "" || location.hash === "#/") pageAccueil();
});

// ------------------------------------------------------------------ suivi du comportement (sans caméra)
// Signaux utilisés : activité clavier/souris, temps sans tester, échecs successifs, durée de session.
["keydown", "mousemove", "mousedown", "scroll", "touchstart"].forEach(ev =>
  addEventListener(ev, () => {
    const absence = Date.now() - etat.derniereInteraction;
    etat.derniereInteraction = Date.now();
    if (absence > 15 * 60e3) { etat.debutSession = Date.now(); toast("Re-bonjour 👋 Avant de reprendre, relis la consigne et ton code : ça aide à se remettre dedans.", [], 7000); }
  }, { passive: true }));

setInterval(async () => {
  const actif = document.visibilityState === "visible" && Date.now() - etat.derniereInteraction < 120e3;
  if (!actif) return;
  try { const r = await api("/api/activite", {}); majTemps(r.minutes); } catch {}
  const surExercice = location.hash.startsWith("#/lecon/") && etat.lecon && !etat.lecon.etat.reussie;
  // Beaucoup de frappe mais aucun test depuis 8 minutes : on encourage à tester par petits pas.
  if (surExercice && !etat.relanceTest && Date.now() - etat.dernierTest > 8 * 60e3) {
    etat.relanceTest = true;
    toast("Ça fait un moment que tu n'as pas testé. Tester souvent, même un code incomplet, montre vite où ça coince.",
      [{ label: "Tester maintenant", action: tester }, { label: "Demander au tuteur", action: () => demander("Je suis bloqué, par où je continue ?") }]);
  }
  surveillerFatigue();
}, 60e3);

function surveillerFatigue() {
  const session = (Date.now() - etat.debutSession) / 60e3;
  if (etat.pauseProposee && Date.now() - etat.pauseProposee < 30 * 60e3) return;
  if (session > 50 || (session > 30 && etat.dernierEchecs >= 4)) {
    etat.pauseProposee = Date.now();
    toast(session > 50
      ? "Tu travailles depuis plus de 50 minutes. Une pause de 5 à 10 minutes aide ton cerveau à mémoriser ce que tu viens d'apprendre."
      : "Plusieurs essais ratés d'affilée après une longue session : c'est souvent un signe de fatigue. Une courte pause, puis tu reviens avec un regard neuf ?",
      [{ label: "Je fais une pause", action: () => { etat.debutSession = Date.now() + 5 * 60e3; } }, { label: "Je continue" }]);
  }
}

// ------------------------------------------------------------------ routeur
async function router() {
  const h = location.hash || "#/";
  scrollTo(0, 0);
  try {
    if (h.startsWith("#/lecon/")) await pageLecon(h.split("/")[2]);
    else if (h === "#/revisions") await pageRevisions();
    else await pageAccueil();
  } catch (e) {
    vue.innerHTML = `<div class="carte vide-etat"><h2>Le serveur ne répond pas</h2><p class="sous">Vérifie que Mentor IA est toujours lancé dans le terminal.</p></div>`;
  }
}
addEventListener("hashchange", router);
(async () => {
  try { const d = await api("/api/accueil"); etat.profil = d.profil; etat.ia = d.ia; etat.modele = d.modele; majBarre(d.plan); } catch {}
  router();
})();
