/* =====================================================================
   Espace équipe Marius & Fanny — version en ligne (étape 1)
   Connexion sécurisée, dossiers des employés, fiche d'embauche,
   salaire et avantages, cahier de l'employé, nouvelles.
   ===================================================================== */
'use strict';
const sb = window.supabase.createClient(MF_CONFIG.supabaseUrl, MF_CONFIG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
const LOGO = window.MF_LOGO;
const INITIAL_HASH = location.hash || '';

/* ---------- Utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = iso(new Date());
const fd = d => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fdt = d => d ? new Date(d).toLocaleString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const money = n => Number(n || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const fullname = e => e ? `${e.first_name} ${e.last_name}` : '';
const formData = ev => { ev.preventDefault(); return Object.fromEntries(new FormData(ev.target).entries()); };
const fmtPhone = p => { const d = String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ''); };
const fmtPostal = p => { const c = String(p || '').toUpperCase().replace(/\s/g, ''); return c.length === 6 ? c.slice(0, 3) + ' ' + c.slice(3) : String(p || '').toUpperCase(); };
const MAGASINS = ['Laval', 'Montréal', 'Production'];
const TIP_GROUPS = { laval: 'Vente Laval', mtl: 'Vente Montréal', prod: 'Production', none: 'Aucun pourboire' };
const AUD = { all: 'Tout le monde', vente: 'Vente seulement', prod: 'Production seulement' };
const teamOf = e => e && e.magasin === 'Production' ? 'prod' : 'vente';
const defTip = m => m === 'Production' ? 'prod' : m === 'Montréal' ? 'mtl' : 'laval';
const INFO_REQ = ['birth', 'street', 'city', 'postal', 'phone', 'email_perso', 'em_name', 'em_rel', 'em_phone'];
const infoDone = i => !!i && INFO_REQ.every(k => String(i[k] || '').trim());

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 3200); }
function modal(title, body, wide) {
  const m = $('#modal');
  m.innerHTML = `<div class="scrim" onclick="if(event.target===this)App.close()"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="spread"><h2>${esc(title)}</h2><button class="btn ghost sm" onclick="App.close()">Fermer</button></div>${body}</div></div>`;
  m.hidden = false; const f = m.querySelector('input:not([type=hidden]),textarea,select'); if (f) f.focus();
}
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
function errMsg(e) { const m = (e && (e.message || e.error_description || e.error)) || String(e); if (/Invalid login/i.test(m)) return 'Courriel ou mot de passe incorrect.'; if (/rate limit/i.test(m)) return 'Trop de tentatives. Réessaie dans quelques minutes.'; if (/JWT|permission|row-level/i.test(m)) return 'Accès refusé. Reconnecte-toi.'; return m; }
function fail(e) { console.error(e); toast(errMsg(e)); }
async function q(promise) { const { data, error } = await promise; if (error) throw error; return data; }

function hbRender(t) {
  const inl = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); const out = []; let ul = null, para = [];
  const fP = () => { if (para.length) { out.push(`<p>${para.map(inl).join('<br>')}</p>`); para = []; } };
  const fU = () => { if (ul) { out.push(`<ul>${ul.map(x => `<li>${inl(x)}</li>`).join('')}</ul>`); ul = null; } };
  String(t || '').split('\n').forEach(l => { const m = l.match(/^\s*[-•*]\s+(.*)$/); if (m) { fP(); (ul = ul || []).push(m[1]); } else if (!l.trim()) { fP(); fU(); } else { fU(); para.push(l); } });
  fP(); fU(); return out.join('');
}

/* ---------- État ---------- */
const st = { session: null, role: null, me: null, view: { page: 'home' }, needPassword: /type=(invite|recovery)/.test(INITIAL_HASH), data: {} };
const isMob = () => window.matchMedia('(max-width:780px)').matches;
window.matchMedia('(max-width:780px)').addEventListener?.('change', () => render());

/* ---------- Démarrage et connexion ---------- */
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  st.session = session;
  sb.auth.onAuthStateChange((ev, s) => {
    st.session = s;
    if (ev === 'PASSWORD_RECOVERY') { st.needPassword = true; render(); }
    if (ev === 'SIGNED_OUT') { Object.assign(st, { role: null, me: null, data: {}, view: { page: 'home' } }); render(); }
  });
  await afterLogin();
}

async function afterLogin() {
  if (!st.session) return render();
  if (st.needPassword) return render();
  try {
    st.role = await q(sb.rpc('my_role'));
    if (!st.role) { st.screen = 'noprofile'; return render(); }
    if (st.role === 'admin') {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: f } = await sb.auth.mfa.listFactors();
      const totp = (f?.totp || []).find(x => x.status === 'verified');
      if (!totp) { st.screen = 'mfa-enroll'; return render(); }
      if (aal?.currentLevel !== 'aal2') { st.screen = 'mfa-challenge'; st.factorId = totp.id; return render(); }
      st.screen = 'app'; st.view = { page: 'dash' };
    } else {
      const rows = await q(sb.from('employees').select('*').eq('user_id', st.session.user.id));
      st.me = rows[0] || null;
      if (!st.me) { st.screen = 'inactive'; return render(); }
      st.screen = 'app'; st.view = { page: 'home' };
    }
    await loadPage();
  } catch (e) { fail(e); st.screen = 'error'; render(); }
}

/* ---------- Écrans de connexion ---------- */
function loginShell(inner) {
  return `<div class="login"><div class="login-card"><img class="brandlogo" src="${LOGO}" alt="Marius &amp; Fanny, artisan du soleil"><p class="tagline">Espace équipe</p>${inner}</div></div>`;
}
function loginView() {
  return loginShell(`<div class="panel stack"><div class="stack" style="gap:4px"><h1>Connexion</h1><p class="muted">Accède à ton dossier, à tes congés et au cahier de l’employé.</p></div>
  <form class="stack" onsubmit="App.login(event)"><label>Courriel<input id="lg-email" name="email" type="email" required autocomplete="username"></label><label>Mot de passe<input id="lg-pw" name="pw" type="password" required autocomplete="current-password"></label><p id="lg-err" class="err" hidden></p><button class="btn primary" style="justify-content:center">Se connecter</button></form>
  <button class="btn ghost sm" onclick="App.forgotForm()" style="justify-self:start">Mot de passe oublié?</button></div>`);
}
function setPasswordView() {
  const invite = /type=invite/.test(INITIAL_HASH);
  return loginShell(`<div class="panel stack"><h1>${invite ? 'Bienvenue!' : 'Nouveau mot de passe'}</h1><p class="muted">${invite ? 'Choisis ton mot de passe pour accéder à ton espace.' : 'Choisis un nouveau mot de passe.'}</p>
  <form class="stack" onsubmit="App.setPassword(event)"><label>Mot de passe (10 caractères ou plus)<input type="password" name="pw" id="sp-pw" minlength="10" required autocomplete="new-password"></label><label>Confirmer<input type="password" name="pw2" id="sp-pw2" minlength="10" required autocomplete="new-password"></label><p id="sp-err" class="err" hidden></p><button class="btn primary" style="justify-content:center">Enregistrer mon mot de passe</button></form></div>`);
}
function mfaEnrollView() {
  const e = st.enroll;
  return loginShell(`<div class="panel stack"><h1>Sécurité du compte</h1><p class="muted">Ton compte administrateur doit être protégé par la validation en deux étapes.</p>
  ${e ? `<ol class="plain"><li>Installe une application d’authentification sur ton téléphone (Google Authenticator, Microsoft Authenticator ou 1Password).</li><li>Dans l’application, ajoute un compte en scannant ce code.</li><li>Entre le code à 6 chiffres affiché dans l’application.</li></ol>
  <div class="qr"><img src="${e.qr}" alt="Code QR à scanner"></div><p class="small muted">Impossible de scanner? Entre cette clé à la main : <span class="code">${esc(e.secret)}</span></p>
  <form class="stack" onsubmit="App.mfaVerify(event,'${e.id}')"><label>Code à 6 chiffres<input class="otp" name="code" id="mf-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><p id="mf-err" class="err" hidden></p><button class="btn primary" style="justify-content:center">Activer</button></form>`
    : `<button class="btn primary" onclick="App.mfaStart()" style="justify-content:center">Commencer</button>`}
  <button class="btn ghost sm" onclick="App.logout()" style="justify-self:start">Se déconnecter</button></div>`);
}
function mfaChallengeView() {
  return loginShell(`<div class="panel stack"><h1>Validation en deux étapes</h1><p class="muted">Entre le code à 6 chiffres de ton application d’authentification.</p>
  <form class="stack" onsubmit="App.mfaVerify(event,'${st.factorId}')"><label>Code<input class="otp" name="code" id="mf-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><p id="mf-err" class="err" hidden></p><button class="btn primary" style="justify-content:center">Valider</button></form>
  <button class="btn ghost sm" onclick="App.logout()" style="justify-self:start">Se déconnecter</button></div>`);
}
function messageView(title, text) {
  return loginShell(`<div class="panel stack"><h1>${esc(title)}</h1><p>${text}</p><button class="btn" onclick="App.logout()">Se déconnecter</button></div>`);
}

/* ---------- Coquille de l'application ---------- */
const navItem = (page, label, active, n) => `<button onclick="App.go('${page}')" aria-current="${active}">${label}${n ? `<span class="count">${n}</span>` : ''}</button>`;
const ADMIN_GROUPS = { emps: [['emps', 'Dossiers']], comms: [['handbook', 'Cahier de l’employé'], ['news', 'Nouvelles']] };
const EMP_GROUPS = { dossier: [['minfo', 'Mes informations'], ['msal', 'Salaire et avantages']] };
const groupOf = (G, p) => Object.keys(G).find(k => G[k].some(x => x[0] === p));
function subTabs(G) { const g = groupOf(G, st.view.page); if (!g || G[g].length < 2) return ''; return `<nav class="subtabs">${G[g].map(([p, l]) => `<button onclick="App.go('${p}')" aria-current="${st.view.page === p}">${l}</button>`).join('')}</nav>`; }
function adminNav() { const p = st.view.page, g = groupOf(ADMIN_GROUPS, p); return navItem('dash', 'Tableau de bord', p === 'dash') + navItem('emps', 'Employés', g === 'emps' || p === 'emp') + navItem('handbook', 'Communication', g === 'comms'); }
function empNav() { const p = st.view.page; const n = st.data.myInfo === undefined ? 0 : (infoDone(st.data.myInfo) ? 0 : 1); return navItem('home', 'Accueil', p === 'home') + navItem('minfo', 'Mon dossier', !!groupOf(EMP_GROUPS, p), n) + navItem('macct', 'Mon compte', p === 'macct'); }

function render() {
  const app = $('#app'); const m = isMob(); $('#frame').classList.toggle('mobroot', m);
  if (!st.session) { app.innerHTML = loginView(); return; }
  if (st.needPassword) { app.innerHTML = setPasswordView(); return; }
  if (st.screen === 'mfa-enroll') { app.innerHTML = mfaEnrollView(); return; }
  if (st.screen === 'mfa-challenge') { app.innerHTML = mfaChallengeView(); return; }
  if (st.screen === 'noprofile') { app.innerHTML = messageView('Compte non configuré', 'Ton compte existe, mais il n’est relié à aucun dossier. Communique avec la direction.'); return; }
  if (st.screen === 'inactive') { app.innerHTML = messageView('Accès désactivé', 'Ton accès à l’espace équipe n’est pas actif. Communique avec la direction.'); return; }
  if (st.screen === 'error') { app.innerHTML = messageView('Un problème est survenu', 'La plateforme n’a pas pu charger tes informations. Réessaie dans quelques instants.'); return; }
  if (st.screen !== 'app') { app.innerHTML = `<div class="login center"><div class="spinner"></div></div>`; return; }
  const admin = st.role === 'admin';
  const content = admin ? subTabs(ADMIN_GROUPS) + adminPage() : subTabs(EMP_GROUPS) + empPage();
  const name = admin ? 'Administratrice' : fullname(st.me);
  app.innerHTML = `<div class="shell${m ? ' mob' : ''}"><aside class="rail"><div class="brandbar"><img src="${LOGO}" alt="Marius &amp; Fanny"><span class="brandsub">Espace équipe</span></div><nav class="nav" aria-label="Navigation">${admin ? adminNav() : empNav()}</nav><div class="who"><span class="wname">${esc(name)}<br><span class="muted small">${admin ? 'Administration' : esc(st.me.poste)}</span></span><button class="btn sm" onclick="App.logout()">Se déconnecter</button></div></aside><main class="pane"><div class="inner">${content}</div></main></div>`;
}
const loading = () => `<div class="center" style="min-height:200px"><div class="spinner"></div></div>`;

/* ---------- Chargement des données par page ---------- */
async function loadPage() {
  const p = st.view.page; st.loading = true; render();
  try {
    if (st.role === 'admin') {
      if (p === 'dash' || p === 'emps') {
        st.data.emps = await q(sb.from('employees').select('*').order('last_name'));
        st.data.infos = await q(sb.from('employee_info').select('employee_id,birth,street,city,postal,phone,email_perso,em_name,em_rel,em_phone'));
        st.data.rates = await q(sb.from('salary_history').select('employee_id,effective,rate').order('effective', { ascending: false }));
        st.data.hbMeta = (await q(sb.from('handbook_meta').select('*')))[0];
        st.data.hbReads = await q(sb.from('handbook_reads').select('employee_id,version'));
      }
      if (p === 'emp') {
        const id = st.view.id;
        st.data.emp = (await q(sb.from('employees').select('*').eq('id', id)))[0];
        st.data.empInfo = (await q(sb.from('employee_info').select('*').eq('employee_id', id)))[0] || null;
        st.data.empSal = await q(sb.from('salary_history').select('*').eq('employee_id', id).order('effective', { ascending: false }));
        st.data.empPerks = await q(sb.from('perks').select('*').eq('employee_id', id).order('date', { ascending: false }));
        st.data.empNotes = (await q(sb.from('admin_notes').select('*').eq('employee_id', id)))[0] || null;
      }
      if (p === 'handbook') {
        st.data.hbMeta = (await q(sb.from('handbook_meta').select('*')))[0];
        st.data.hbSecs = await q(sb.from('handbook_sections').select('*').order('position'));
        st.data.hbReads = await q(sb.from('handbook_reads').select('employee_id,version'));
        st.data.emps = await q(sb.from('employees').select('id,first_name,last_name,active').order('last_name'));
      }
      if (p === 'news') {
        st.data.news = await q(sb.from('news').select('*').order('date', { ascending: false }));
        st.data.rsvp = await q(sb.from('news_rsvp').select('*'));
        st.data.emps = await q(sb.from('employees').select('id,first_name,last_name,active').order('last_name'));
      }
    } else {
      const id = st.me.id;
      st.data.myInfo = (await q(sb.from('employee_info').select('*').eq('employee_id', id)))[0] || null;
      if (p === 'home') {
        st.data.hbMeta = (await q(sb.from('handbook_meta').select('*')))[0];
        st.data.hbSecs = await q(sb.from('handbook_sections').select('*').order('position'));
        st.data.myReads = await q(sb.from('handbook_reads').select('version').eq('employee_id', id));
        st.data.news = await q(sb.from('news').select('*').order('date', { ascending: false }));
        st.data.myRsvp = await q(sb.from('news_rsvp').select('*').eq('employee_id', id));
      }
      if (p === 'msal') {
        st.data.mySal = await q(sb.from('salary_history').select('*').eq('employee_id', id).order('effective', { ascending: false }));
        st.data.myPerks = await q(sb.from('perks').select('*').eq('employee_id', id).order('date', { ascending: false }));
      }
    }
  } catch (e) { fail(e); }
  st.loading = false; render();
}

/* ---------- Pages administratrice ---------- */
function adminPage() {
  if (st.loading) return loading();
  switch (st.view.page) { case 'emps': return empsView(); case 'emp': return empDetail(); case 'handbook': return handbookAdmin(); case 'news': return newsAdmin(); default: return dashView(); }
}
const curRate = id => { const r = (st.data.rates || []).find(x => x.employee_id === id); return r ? r.rate : null; };
function dashView() {
  const emps = (st.data.emps || []).filter(e => e.active); const infos = st.data.infos || [];
  const inc = emps.filter(e => !infoDone(infos.find(i => i.employee_id === e.id)));
  const v = st.data.hbMeta?.version; const read = new Set((st.data.hbReads || []).filter(r => r.version === v).map(r => r.employee_id));
  const notRead = emps.filter(e => e.user_id && !read.has(e.id));
  return `<div class="spread"><div><p class="eyebrow">Administration</p><h1>Tableau de bord</h1></div></div>
  <div class="tiles"><button class="tile" onclick="App.go('emps')"><b>${emps.length}</b><span>employés actifs</span></button><button class="tile${inc.length ? ' alert' : ''}" onclick="App.go('emps')"><b>${inc.length}</b><span>fiches d’embauche incomplètes</span></button><button class="tile${notRead.length ? ' alert' : ''}" onclick="App.go('handbook')"><b>${notRead.length}</b><span>n’ont pas lu le cahier</span></button></div>
  ${emps.length ? '' : `<section class="panel stack"><h2>Bienvenue dans ton espace</h2><p>Commence par ajouter tes employés. Chacun recevra un courriel pour choisir son mot de passe.</p><div><button class="btn primary" onclick="App.go('emps');setTimeout(()=>App.empForm(),50)">Ajouter un employé</button></div></section>`}
  ${inc.length ? `<section class="section"><h2>Fiches d’embauche incomplètes</h2><div class="list">${inc.map(e => `<div class="item"><div class="grow"><b>${esc(fullname(e))}</b><span class="muted small">${esc(e.poste)} · ${esc(e.magasin)}</span></div><button class="btn sm" onclick="App.openEmp('${e.id}')">Voir le dossier</button></div>`).join('')}</div></section>` : ''}`;
}
function empsView() {
  const qy = slug(st.empSearch || ''); const infos = st.data.infos || [];
  const list = (st.data.emps || []).filter(e => !qy || slug(fullname(e) + e.poste + e.magasin).includes(qy)).sort((a, b) => (b.active - a.active) || a.last_name.localeCompare(b.last_name));
  return `<div class="spread"><div><p class="eyebrow">Employés</p><h1>Dossiers</h1></div><button class="btn primary" onclick="App.empForm()">Ajouter un employé</button></div>
  <input type="search" id="emp-q" placeholder="Rechercher par nom, poste ou magasin" value="${esc(st.empSearch || '')}" oninput="App.empQ(this.value)" aria-label="Rechercher">
  ${list.length ? `<div class="tablewrap"><table><thead><tr><th>Nom</th><th>Poste</th><th>Magasin</th><th>Embauche</th><th class="r">Taux horaire</th><th>À suivre</th></tr></thead><tbody>${list.map(e => {
    const flags = [!e.active ? '<span class="pill p-mute">Inactif</span>' : '', e.active && !infoDone(infos.find(i => i.employee_id === e.id)) ? '<span class="pill p-warn">Fiche incomplète</span>' : ''].join(' ');
    const r = curRate(e.id);
    return `<tr class="click" tabindex="0" onclick="App.openEmp('${e.id}')" onkeydown="if(event.key==='Enter')App.openEmp('${e.id}')"><td><b>${esc(fullname(e))}</b></td><td>${esc(e.poste)}</td><td>${esc(e.magasin)}</td><td class="num">${fd(e.start_date)}</td><td class="r num">${r != null ? money(r) : '—'}</td><td>${flags}</td></tr>`;
  }).join('')}</tbody></table></div>` : `<div class="list"><p class="empty">${qy ? 'Aucun employé ne correspond.' : 'Aucun employé pour le moment.'}</p></div>`}`;
}
function seniority(d) { const m = Math.max(0, Math.floor((new Date() - new Date(d + 'T12:00')) / (30.44 * 864e5))); const y = Math.floor(m / 12), r = m % 12; return [y ? `${y} an${y > 1 ? 's' : ''}` : '', r ? `${r} mois` : ''].filter(Boolean).join(' et ') || 'Moins d’un mois'; }
function empDetail() {
  const e = st.data.emp; if (!e) return `<div class="list"><p class="empty">Dossier introuvable.</p></div>`;
  const tab = st.view.tab || 'profil';
  const tabs = [['profil', 'Profil'], ['fiche', 'Fiche d’embauche'], ['salaire', 'Salaire et avantages'], ['notes', 'Notes']];
  let body = '';
  if (tab === 'profil') body = `<div class="panel stack"><dl class="facts"><div><dt>Poste</dt><dd>${esc(e.poste) || '—'}</dd></div><div><dt>Magasin</dt><dd>${esc(e.magasin)}</dd></div><div><dt>Groupe de pourboire</dt><dd>${TIP_GROUPS[e.tip_group]}</dd></div><div><dt>Date d’embauche</dt><dd>${fd(e.start_date)}</dd></div><div><dt>Ancienneté</dt><dd>${seniority(e.start_date)}</dd></div><div><dt>Courriel de connexion</dt><dd>${esc(e.email)}</dd></div><div><dt>Statut</dt><dd>${e.active ? '<span class="pill p-ok">Actif</span>' : '<span class="pill p-mute">Inactif, ne peut plus se connecter</span>'}</dd></div></dl>
    <div class="row"><button class="btn" onclick="App.empForm('${e.id}')">Modifier le profil</button><button class="btn" onclick="App.resend('${e.id}')">Renvoyer l’invitation</button><button class="btn" onclick="App.toggleActive()">${e.active ? 'Désactiver l’accès' : 'Réactiver l’accès'}</button></div></div>`;
  if (tab === 'fiche') body = `<div class="panel">${infoForm(st.data.empInfo, 'admin')}</div>`;
  if (tab === 'salaire') body = salaryBlock(st.data.empSal, st.data.empPerks, true);
  if (tab === 'notes') body = `<section class="panel stack"><div class="spread"><div><h2>Bloc-notes</h2><p class="small muted">Visible seulement par toi.</p></div><span id="nt-status" class="small muted">${st.data.empNotes ? 'Enregistré le ' + fdt(st.data.empNotes.updated_at) : 'Aucune note'}</span></div><textarea class="big" id="nt-text" oninput="App.noteInput(this.value)">${esc(st.data.empNotes?.notes || '')}</textarea><p class="small muted">Les notes s’enregistrent automatiquement.</p></section>`;
  return `<div><button class="btn ghost sm" onclick="App.go('emps')">← Tous les employés</button></div>
  <div class="spread"><div><p class="eyebrow">${esc(e.poste)} · ${esc(e.magasin)}</p><h1>${esc(fullname(e))}</h1></div>${e.active ? '' : '<span class="pill p-mute">Inactif</span>'}</div>
  <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" onclick="App.tab('${k}')">${l}</button>`).join('')}</div>${body}`;
}
function salaryBlock(sal, perks, admin) {
  sal = sal || []; perks = perks || [];
  const rows = sal.map((s, i) => { const prev = sal[i + 1]; const diff = prev ? s.rate - prev.rate : null;
    return `<tr><td class="num" data-label="En vigueur le">${fd(s.effective)}</td><td class="r num" data-label="Taux"><b>${money(s.rate)}</b> / h</td><td class="r num" data-label="Variation">${diff === null ? '—' : `<span style="color:${diff >= 0 ? 'var(--ok)' : 'var(--crit)'}">${diff >= 0 ? '+' : ''}${money(diff)}</span>`}</td><td data-label="Note">${esc(s.note)}</td>${admin ? `<td class="r"><button class="btn ghost sm" onclick="App.delSalary('${s.id}')">Retirer</button></td>` : ''}</tr>`; }).join('');
  const total = perks.reduce((t, p) => t + (Number(p.value) || 0), 0);
  return `<div class="panel spread"><div class="stack" style="gap:6px"><span class="eyebrow">Taux horaire actuel</span><span class="big">${sal[0] ? money(sal[0].rate) : '—'}</span>${sal[0] ? `<span class="muted small">depuis le ${fd(sal[0].effective)}</span>` : ''}</div>${admin ? `<button class="btn primary" onclick="App.salaryForm()">Changer le salaire</button>` : ''}</div>
  <section class="section"><h2>Historique salarial</h2>${sal.length ? `<div class="tablewrap"><table class="resp"><thead><tr><th>En vigueur le</th><th class="r">Taux</th><th class="r">Variation</th><th>Note</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="list"><p class="empty">Aucun salaire inscrit.</p></div>'}</section>
  <section class="section"><div class="spread"><h2>Avantages, primes et cadeaux</h2>${admin ? `<button class="btn" onclick="App.perkForm()">Ajouter</button>` : ''}</div>
  ${perks.length ? `<div class="tablewrap"><table class="resp"><thead><tr><th>Date</th><th>Description</th><th class="r">Valeur</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>${perks.map(p => `<tr><td class="num" data-label="Date">${fd(p.date)}</td><td data-label="Description">${esc(p.descr)}</td><td class="r num" data-label="Valeur">${p.value != null ? money(p.value) : '—'}</td>${admin ? `<td class="r"><button class="btn ghost sm" onclick="App.delPerk('${p.id}')">Retirer</button></td>` : ''}</tr>`).join('')}<tr><td></td><td><b>Total</b></td><td class="r num" data-label=" "><b>${money(total)}</b></td>${admin ? '<td></td>' : ''}</tr></tbody></table></div>` : '<div class="list"><p class="empty">Aucun avantage inscrit.</p></div>'}</section>`;
}
function infoForm(i, mode) {
  i = i || { province: 'QC' }; const v = k => esc(i[k] || '');
  return `<form class="stack" onsubmit="App.saveInfo(event,'${mode}')" novalidate>
  <fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:10px">Identité</legend><div class="two"><label>Date de naissance<input type="date" name="birth" required max="${TODAY}" value="${v('birth')}"></label></div></fieldset>
  <fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:10px">Adresse</legend><label>Numéro et rue<input name="street" required autocomplete="address-line1" value="${v('street')}"></label>
  <div class="two"><label>Appartement (facultatif)<input name="apt" autocomplete="address-line2" value="${v('apt')}"></label><label>Ville<input name="city" required autocomplete="address-level2" value="${v('city')}"></label><label>Province<input name="province" value="${v('province') || 'QC'}"></label><label>Code postal<input name="postal" required autocomplete="postal-code" placeholder="H7A 1A1" maxlength="7" value="${v('postal')}"></label></div></fieldset>
  <fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:10px">Coordonnées</legend><div class="two"><label>Téléphone<input type="tel" name="phone" required autocomplete="tel" value="${v('phone')}"></label><label>Courriel personnel<input type="email" name="email_perso" required autocomplete="email" value="${v('email_perso')}"></label></div></fieldset>
  <fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:10px">Personne à joindre en cas d’urgence</legend><div class="two"><label>Nom complet<input name="em_name" required value="${v('em_name')}"></label><label>Lien<input name="em_rel" required placeholder="Ex. mère, conjoint" value="${v('em_rel')}"></label><label>Téléphone<input type="tel" name="em_phone" required value="${v('em_phone')}"></label><label>Autre téléphone (facultatif)<input type="tel" name="em_phone2" value="${v('em_phone2')}"></label></div></fieldset>
  ${mode === 'emp' ? '<p class="small muted">Ces renseignements servent à gérer ton emploi et à joindre quelqu’un en cas d’urgence. Seule la direction y a accès.</p>' : ''}
  <p id="if-err" class="err" hidden></p><div><button class="btn primary">Enregistrer</button></div></form>`;
}

/* Cahier de l'employé — administration */
function handbookAdmin() {
  const m = st.data.hbMeta || {}; const secs = st.data.hbSecs || []; const act = (st.data.emps || []).filter(e => e.active);
  const read = new Set((st.data.hbReads || []).filter(r => r.version === m.version).map(r => r.employee_id)); const notRead = act.filter(e => !read.has(e.id));
  return `<div><p class="eyebrow">Communication</p><h1>Cahier de l’employé</h1></div>
  <section class="panel stack"><div class="spread"><div><span class="eyebrow">Version en cours</span><h2>${esc(m.version_name)}</h2><p class="small muted">Mis à jour le ${fdt(m.updated_at)}</p></div><div class="row"><button class="btn" onclick="App.hbPreview('vente')">Aperçu vente</button><button class="btn" onclick="App.hbPreview('prod')">Aperçu production</button><button class="btn primary" onclick="App.hbPublishForm()">Publier une nouvelle version</button></div></div>
  <div class="checklist">${secs.map((x, i) => `<div class="ck" style="align-items:center"><span class="milestone" style="font-size:1.1rem;min-width:28px">${i + 1}</span><div class="grow"><b>${esc(x.title)} <span class="pill ${x.aud === 'all' ? 'p-mute' : x.aud === 'vente' ? 'p-acc' : 'p-warn'}">${x.aud === 'all' ? 'Tous' : x.aud === 'vente' ? 'Vente' : 'Production'}</span></b><span class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.body.replace(/\s+/g, ' ').slice(0, 110))}</span></div><div class="row" style="gap:4px"><button class="btn ghost sm" onclick="App.hbMove(${i},-1)" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn ghost sm" onclick="App.hbMove(${i},1)" ${i === secs.length - 1 ? 'disabled' : ''}>↓</button><button class="btn sm" onclick="App.hbEdit('${x.id}')">Modifier</button></div></div>`).join('')}</div>
  <div><button class="btn" onclick="App.hbEdit()">Ajouter une section</button></div>
  <div class="stack" style="gap:6px"><span class="num"><b>${act.length - notRead.length}</b> sur ${act.length} ont confirmé avoir lu cette version</span>${notRead.length ? `<div class="chips">${notRead.map(e => `<span class="chip">${esc(fullname(e))}</span>`).join('')}</div>` : ''}</div></section>`;
}
function handbookBlock(aud, preview) {
  const m = st.data.hbMeta || {}; const secs = (st.data.hbSecs || []).filter(x => x.aud === 'all' || x.aud === aud); if (!secs.length) return '';
  if ((st.hbIndex || 0) >= secs.length) st.hbIndex = 0; const cur = secs[st.hbIndex || 0];
  const read = !preview && (st.data.myReads || []).some(r => r.version === m.version);
  return `<section class="handbook"><div class="hb-head"><div><span class="eyebrow">Cahier de l’employé · ${esc(m.version_name)}</span><h2>${esc(m.headline)}</h2></div>${preview ? '<span class="pill p-acc">Aperçu</span>' : read ? '<span class="pill p-ok">Lu</span>' : `<button class="btn primary" onclick="App.readHb()">J’ai lu le cahier</button>`}</div>
  <div class="hb-body"><div class="hb-toc">${secs.map((x, i) => `<button aria-current="${i === (st.hbIndex || 0)}" onclick="App.hb(${i},${preview ? `'${aud}'` : 'null'})">${esc(x.title)}</button>`).join('')}</div><div class="hb-text"><h3>${esc(cur.title)}</h3>${hbRender(cur.body)}</div></div></section>`;
}

/* Nouvelles — administration */
function newsAdmin() {
  const act = (st.data.emps || []).filter(e => e.active); const rs = st.data.rsvp || [];
  return `<div class="spread"><div><p class="eyebrow">Communication</p><h1>Nouvelles</h1></div><button class="btn primary" onclick="App.newsForm()">Publier une nouvelle</button></div>
  <div class="news">${(st.data.news || []).length ? st.data.news.map(n => { const live = n.until > TODAY; const ans = rs.filter(r => r.news_id === n.id);
    const yes = act.filter(e => ans.some(a => a.employee_id === e.id && a.answer === 'oui')), no = act.filter(e => ans.some(a => a.employee_id === e.id && a.answer === 'non')), none = act.filter(e => !ans.some(a => a.employee_id === e.id));
    const chips = l => l.length ? `<div class="chips">${l.map(e => `<span class="chip">${esc(fullname(e))}</span>`).join('')}</div>` : '<span class="small muted">Personne</span>';
    return `<article class="newscard"><div class="spread"><span class="eyebrow">${fd(n.date)}</span>${live ? `<span class="small muted">Affichée jusqu’au ${fd(n.until)}</span>` : '<span class="pill p-mute">Retirée</span>'}</div><h3>${esc(n.title)}</h3><p class="body">${esc(n.body)}</p>
    ${n.rsvp ? `<div class="rsvp"><div class="row" style="gap:18px"><span><b class="payh" style="font-size:1.6rem">${yes.length}</b> participent</span><span><b class="num">${no.length}</b> ne peuvent pas</span><span class="muted"><b class="num">${none.length}</b> sans réponse</span></div><details><summary class="small" style="cursor:pointer">Voir qui a répondu</summary><div class="stack" style="gap:8px;margin-top:8px"><b class="small">Participent</b>${chips(yes)}<b class="small">Ne peuvent pas</b>${chips(no)}<b class="small">Sans réponse</b>${chips(none)}</div></details></div>` : ''}
    <div><button class="btn ghost sm" onclick="App.delNews('${n.id}')">Supprimer</button></div></article>`; }).join('') : '<div class="list"><p class="empty">Aucune nouvelle publiée.</p></div>'}</div>`;
}

/* ---------- Pages employé ---------- */
function empPage() {
  if (st.loading) return loading();
  switch (st.view.page) { case 'minfo': return myInfoView(); case 'msal': return `<div><p class="eyebrow">Mon dossier</p><h1>Salaire et avantages</h1></div>${salaryBlock(st.data.mySal, st.data.myPerks, false)}`; case 'macct': return accountView(); default: return homeView(); }
}
function homeView() {
  const e = st.me; const news = (st.data.news || []).filter(n => n.until > TODAY);
  return `<div><p class="eyebrow">${new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Bonjour ${esc(e.first_name)}</h1><p class="muted">Membre de l’équipe depuis ${seniority(e.start_date)}</p></div>
  ${!infoDone(st.data.myInfo) ? `<div class="banner acc"><div><b>Remplis ta fiche d’embauche.</b><br><span class="small">Adresse, téléphone, date de naissance et personne à joindre en cas d’urgence.</span></div><button class="btn primary" onclick="App.go('minfo')">Remplir ma fiche</button></div>` : ''}
  ${handbookBlock(teamOf(e), false)}
  <section class="section"><h2>Nouvelles</h2><div class="news">${news.length ? news.map(n => { const a = (st.data.myRsvp || []).find(r => r.news_id === n.id)?.answer; const closed = n.rsvp_due && n.rsvp_due < TODAY;
    return `<article class="newscard"><span class="eyebrow">${fd(n.date)}</span><h3>${esc(n.title)}</h3><p class="body">${esc(n.body)}</p>${n.rsvp ? `<div class="rsvp"><div class="small">${a === 'oui' ? '<b>Tu as répondu : je participe.</b>' : a === 'non' ? '<b>Tu as répondu : je ne peux pas.</b>' : `<b>Seras-tu présent(e)?</b>${n.rsvp_due ? ` Réponds avant le ${fd(n.rsvp_due)}.` : ''}`}</div>${closed && !a ? '<span class="small muted">Les réponses sont fermées.</span>' : `<div class="row"><button class="btn ${a === 'oui' ? 'primary' : ''}" onclick="App.rsvp('${n.id}','oui')" ${closed ? 'disabled' : ''}>Je participe</button><button class="btn ${a === 'non' ? 'primary' : ''}" onclick="App.rsvp('${n.id}','non')" ${closed ? 'disabled' : ''}>Je ne peux pas</button></div>`}</div>` : ''}</article>`; }).join('') : '<div class="list"><p class="empty">Aucune nouvelle pour le moment.</p></div>'}</div></section>`;
}
function myInfoView() { return `<div class="stack" style="gap:6px"><p class="eyebrow">Mon dossier</p><h1>Mes informations</h1><p class="muted">Garde ces informations à jour, surtout si tu déménages ou changes de numéro.</p></div><div class="panel stack"><dl class="facts"><div><dt>Nom</dt><dd>${esc(fullname(st.me))}</dd></div><div><dt>Poste</dt><dd>${esc(st.me.poste)} · ${esc(st.me.magasin)}</dd></div><div><dt>Courriel de connexion</dt><dd>${esc(st.me.email)}</dd></div></dl></div><div class="panel">${infoForm(st.data.myInfo, 'emp')}</div>`; }
function accountView() {
  return `<div><p class="eyebrow">Mon compte</p><h1>Mon compte</h1></div><form class="panel stack" onsubmit="App.changePw(event)" style="max-width:480px"><h2>Changer mon mot de passe</h2><label>Nouveau mot de passe (10 caractères ou plus)<input type="password" name="nw" minlength="10" required autocomplete="new-password"></label><label>Confirmer<input type="password" name="cf" minlength="10" required autocomplete="new-password"></label><p id="pw-err" class="err" hidden></p><div><button class="btn primary">Enregistrer</button></div></form>`;
}

/* ---------- Actions ---------- */
const App = {
  close: closeModal,
  async go(p) { closeModal(); st.view = { page: p }; window.scrollTo(0, 0); await loadPage(); },
  async openEmp(id, tab) { st.view = { page: 'emp', id, tab: tab || 'profil' }; window.scrollTo(0, 0); await loadPage(); },
  tab(t) { st.view.tab = t; render(); },
  empQ(v) { st.empSearch = v; const pos = $('#emp-q')?.selectionStart; render(); const n = $('#emp-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } },

  async login(ev) {
    const f = formData(ev); const err = $('#lg-err'); err.hidden = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.pw });
    if (error) { err.textContent = errMsg(error); err.hidden = false; return; }
    st.session = data.session; await afterLogin();
  },
  forgotForm() { modal('Mot de passe oublié', `<form class="stack" onsubmit="App.forgot(event)"><p class="muted">Entre ton courriel. Tu recevras un lien pour choisir un nouveau mot de passe.</p><label>Courriel<input type="email" name="email" required></label><div class="row"><button class="btn primary">Envoyer le lien</button></div></form>`); },
  async forgot(ev) { const f = formData(ev); const { error } = await sb.auth.resetPasswordForEmail(f.email.trim().toLowerCase(), { redirectTo: location.origin + location.pathname }); closeModal(); if (error) return fail(error); toast('Si ce courriel existe, un lien vient d’être envoyé.'); },
  async setPassword(ev) {
    const f = formData(ev); const err = $('#sp-err'); const show = m => { err.textContent = m; err.hidden = false; };
    if (f.pw.length < 10) return show('Le mot de passe doit avoir au moins 10 caractères.'); if (f.pw !== f.pw2) return show('Les deux mots de passe ne sont pas identiques.');
    const { error } = await sb.auth.updateUser({ password: f.pw }); if (error) return show(errMsg(error));
    st.needPassword = false; history.replaceState(null, '', location.pathname); toast('Mot de passe enregistré.'); await afterLogin();
  },
  async logout() { await sb.auth.signOut(); st.session = null; st.screen = null; render(); },
  async mfaStart() {
    try { const { data: fl } = await sb.auth.mfa.listFactors(); for (const x of (fl?.all || []).filter(x => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: x.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Espace équipe ' + Date.now() }); if (error) throw error;
      st.enroll = { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret }; render(); } catch (e) { fail(e); }
  },
  async mfaVerify(ev, factorId) {
    const f = formData(ev); const err = $('#mf-err');
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: f.code.replace(/\s/g, '') });
    if (error) { err.textContent = 'Code incorrect. Vérifie l’heure de ton téléphone et réessaie.'; err.hidden = false; return; }
    st.enroll = null; toast('Validation en deux étapes confirmée.'); await afterLogin();
  },
  async changePw(ev) { const f = formData(ev); const err = $('#pw-err'); if (f.nw !== f.cf) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; err.hidden = false; return; } const { error } = await sb.auth.updateUser({ password: f.nw }); if (error) { err.textContent = errMsg(error); err.hidden = false; return; } ev.target.reset(); toast('Mot de passe enregistré.'); },

  /* Employés */
  empForm(id) {
    const e = id ? st.data.emp : null;
    modal(e ? 'Modifier le profil' : 'Ajouter un employé', `<form class="stack" onsubmit="App.saveEmp(event,'${id || ''}')"><div class="two">
    <label>Prénom<input name="first_name" required value="${esc(e?.first_name)}"></label><label>Nom<input name="last_name" required value="${esc(e?.last_name)}"></label>
    <label>Poste<input name="poste" required value="${esc(e?.poste)}" placeholder="Ex. Vendeuse"></label>
    <label>Magasin<select name="magasin" onchange="const t=this.form.tip_group;if(!t.dataset.touched)t.value=this.value==='Production'?'prod':this.value==='Montréal'?'mtl':'laval'">${MAGASINS.map(m => `<option ${e?.magasin === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <label>Groupe de pourboire<select name="tip_group" onchange="this.dataset.touched=1">${Object.entries(TIP_GROUPS).map(([k, v]) => `<option value="${k}" ${(e ? e.tip_group : 'laval') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Date d’embauche<input type="date" name="start_date" required value="${esc(e?.start_date || TODAY)}"></label>
    ${e ? '' : `<label>Courriel de l’employé<input type="email" name="email" required></label><label>Taux horaire initial ($)<input type="number" step="0.01" min="0" name="rate" required></label>`}</div>
    ${e ? '' : '<p class="small muted">L’employé recevra un courriel d’invitation pour choisir son mot de passe. À sa première connexion, il remplira sa fiche d’embauche.</p>'}
    <p id="ef-err" class="err" hidden></p><div class="row"><button class="btn primary">${e ? 'Enregistrer' : 'Créer le dossier et envoyer l’invitation'}</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
  },
  async saveEmp(ev, id) {
    const f = formData(ev); const err = $('#ef-err'); const btn = ev.submitter; if (btn) btn.disabled = true;
    try {
      if (id) { await q(sb.from('employees').update({ first_name: f.first_name.trim(), last_name: f.last_name.trim(), poste: f.poste.trim(), magasin: f.magasin, tip_group: f.tip_group, start_date: f.start_date }).eq('id', id)); closeModal(); toast('Profil enregistré.'); return loadPage(); }
      const { data, error } = await sb.functions.invoke('invite-employee', { body: { ...f, rate: Number(f.rate) } });
      if (error || data?.error) { let m = data?.error; if (!m && error?.context) { try { m = (await error.context.json()).error; } catch (x) {} } throw new Error(m || error.message); }
      closeModal(); toast(`Invitation envoyée à ${f.email}.`); App.openEmp(data.employee.id);
    } catch (e) { err.textContent = errMsg(e); err.hidden = false; if (btn) btn.disabled = false; }
  },
  async resend(id) { try { const { data, error } = await sb.functions.invoke('invite-employee', { body: { action: 'resend', employee_id: id } }); if (error || data?.error) throw new Error(data?.error || error.message); toast(data.mode === 'reset' ? 'Lien de nouveau mot de passe envoyé.' : 'Invitation renvoyée.'); } catch (e) { fail(e); } },
  async toggleActive() { const e = st.data.emp; try { await q(sb.from('employees').update({ active: !e.active }).eq('id', e.id)); toast(e.active ? 'Accès désactivé. Le dossier est conservé.' : 'Accès réactivé.'); await loadPage(); } catch (x) { fail(x); } },
  salaryForm() { modal('Changer le salaire', `<form class="stack" onsubmit="App.saveSalary(event)"><div class="two"><label>Nouveau taux horaire ($)<input type="number" step="0.01" min="0" name="rate" required></label><label>En vigueur le<input type="date" name="effective" required value="${TODAY}"></label></div><label>Raison<input name="note" placeholder="Ex. révision annuelle"></label><div class="row"><button class="btn primary">Enregistrer</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`); },
  async saveSalary(ev) { const f = formData(ev); try { await q(sb.from('salary_history').insert({ employee_id: st.view.id, effective: f.effective, rate: Number(f.rate), note: f.note })); closeModal(); toast('Salaire mis à jour.'); await loadPage(); } catch (e) { fail(e); } },
  async delSalary(id) { try { await q(sb.from('salary_history').delete().eq('id', id)); await loadPage(); } catch (e) { fail(e); } },
  perkForm() { modal('Ajouter un avantage', `<form class="stack" onsubmit="App.savePerk(event)"><label>Description<input name="descr" required placeholder="Ex. carte-cadeau de Noël"></label><div class="two"><label>Date<input type="date" name="date" required value="${TODAY}"></label><label>Valeur ($, facultatif)<input type="number" step="0.01" min="0" name="value"></label></div><div class="row"><button class="btn primary">Ajouter</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`); },
  async savePerk(ev) { const f = formData(ev); try { await q(sb.from('perks').insert({ employee_id: st.view.id, date: f.date, descr: f.descr, value: f.value ? Number(f.value) : null })); closeModal(); toast('Avantage ajouté.'); await loadPage(); } catch (e) { fail(e); } },
  async delPerk(id) { try { await q(sb.from('perks').delete().eq('id', id)); await loadPage(); } catch (e) { fail(e); } },
  noteInput(v) { $('#nt-status').textContent = 'Enregistrement…'; clearTimeout(App._nt); App._nt = setTimeout(async () => { try { await q(sb.from('admin_notes').upsert({ employee_id: st.view.id, notes: v, updated_at: new Date().toISOString() })); $('#nt-status').textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }); } catch (e) { $('#nt-status').textContent = 'Erreur d’enregistrement'; fail(e); } }, 700); },

  async saveInfo(ev, mode) {
    const f = formData(ev); Object.keys(f).forEach(k => f[k] = String(f[k]).trim()); const err = $('#if-err'); const show = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); };
    const labels = { birth: 'la date de naissance', street: 'le numéro et la rue', city: 'la ville', postal: 'le code postal', phone: 'le téléphone', email_perso: 'le courriel personnel', em_name: 'le nom de la personne à joindre', em_rel: 'le lien avec cette personne', em_phone: 'le téléphone d’urgence' };
    const miss = Object.keys(labels).filter(k => !f[k]); if (miss.length) return show(`Il manque ${miss.map(k => labels[k]).join(', ')}.`);
    const pc = f.postal.toUpperCase().replace(/\s/g, ''); if (!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(pc)) return show('Le code postal doit avoir le format A1A 1A1.'); f.postal = fmtPostal(pc);
    for (const k of ['phone', 'em_phone', 'em_phone2']) { if (!f[k]) continue; const d = f[k].replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); if (d.length !== 10) return show('Les numéros de téléphone doivent avoir 10 chiffres.'); f[k] = fmtPhone(d); }
    const empId = mode === 'admin' ? st.view.id : st.me.id;
    try { await q(sb.from('employee_info').upsert({ employee_id: empId, ...f, birth: f.birth || null, updated_at: new Date().toISOString() })); toast('Informations enregistrées.'); if (mode === 'emp') { st.view = { page: 'home' }; } await loadPage(); } catch (e) { show(errMsg(e)); }
  },

  /* Cahier */
  hb(i, aud) { st.hbIndex = i; if (aud) { $('#hb-prev').innerHTML = handbookBlock(aud, true); return; } render(); },
  hbPreview(aud) { st.hbIndex = 0; modal(`Aperçu du cahier · ${aud === 'prod' ? 'production' : 'vente'}`, `<div id="hb-prev">${handbookBlock(aud, true)}</div>`, true); },
  hbEdit(id) {
    const x = id ? st.data.hbSecs.find(y => y.id === id) : { title: '', body: '', aud: 'all' };
    modal(id ? 'Modifier la section' : 'Ajouter une section', `<form class="stack" onsubmit="App.hbSave(event,'${id || ''}')"><div class="two"><label>Titre<input name="title" required value="${esc(x.title)}"></label><label>Visible par<select name="aud">${Object.entries(AUD).map(([k, v]) => `<option value="${k}" ${x.aud === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <label>Texte<textarea class="big" name="body" required>${esc(x.body)}</textarea></label><p class="small muted">Commence une ligne par un tiret (-) pour une liste. Laisse une ligne vide entre deux paragraphes. Entoure un mot de **deux astérisques** pour le mettre en gras.</p>
    <div class="row"><button class="btn primary">Enregistrer</button>${id ? `<button type="button" class="btn ghost crit" onclick="App.hbDel('${id}')">Supprimer</button>` : ''}<button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`, true);
  },
  async hbSave(ev, id) { const f = formData(ev); try { if (id) await q(sb.from('handbook_sections').update({ title: f.title.trim(), body: f.body, aud: f.aud, updated_at: new Date().toISOString() }).eq('id', id)); else await q(sb.from('handbook_sections').insert({ title: f.title.trim(), body: f.body, aud: f.aud, position: (st.data.hbSecs.at(-1)?.position || 0) + 1 })); await q(sb.from('handbook_meta').update({ updated_at: new Date().toISOString() }).eq('id', 1)); closeModal(); toast('Section enregistrée.'); await loadPage(); } catch (e) { fail(e); } },
  async hbDel(id) { try { await q(sb.from('handbook_sections').delete().eq('id', id)); closeModal(); await loadPage(); } catch (e) { fail(e); } },
  async hbMove(i, d) { const a = st.data.hbSecs; const j = i + d; if (j < 0 || j >= a.length) return; try { await q(sb.from('handbook_sections').update({ position: a[j].position }).eq('id', a[i].id)); await q(sb.from('handbook_sections').update({ position: a[i].position }).eq('id', a[j].id)); if (a[i].position === a[j].position) { await Promise.all(a.map((x, k) => sb.from('handbook_sections').update({ position: k === i ? j : k === j ? i : k }).eq('id', x.id))); } await loadPage(); } catch (e) { fail(e); } },
  hbPublishForm() { modal('Publier une nouvelle version', `<form class="stack" onsubmit="App.hbPublish(event)"><label>Nom de la version<input name="name" required placeholder="Ex. Janvier 2027"></label><p class="small muted">Tous les employés devront relire le cahier et confirmer leur lecture.</p><div class="row"><button class="btn primary">Publier</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`); },
  async hbPublish(ev) { const f = formData(ev); try { await q(sb.from('handbook_meta').update({ version: (st.data.hbMeta.version || 1) + 1, version_name: f.name.trim(), updated_at: new Date().toISOString() }).eq('id', 1)); closeModal(); toast('Nouvelle version publiée.'); await loadPage(); } catch (e) { fail(e); } },
  async readHb() { try { await q(sb.from('handbook_reads').insert({ employee_id: st.me.id, version: st.data.hbMeta.version })); toast('Merci! Lecture confirmée.'); await loadPage(); } catch (e) { fail(e); } },

  /* Nouvelles */
  newsForm() { const d = new Date(); d.setDate(d.getDate() + 30);
    modal('Publier une nouvelle', `<form class="stack" onsubmit="App.saveNews(event)"><label>Titre<input name="title" required></label><label>Message<textarea name="body" required></textarea></label><label style="max-width:260px">Afficher jusqu’au<input type="date" name="until" required value="${iso(d)}"></label>
    <div class="panel stack" style="background:var(--blue);border:0;padding:14px"><label class="check"><input type="checkbox" name="rsvp" onchange="this.form.querySelector('.due').hidden=!this.checked"><span><b>Demander aux employés s’ils participent</b></span></label><label class="due" hidden style="max-width:240px">Répondre avant le (facultatif)<input type="date" name="rsvp_due"></label></div>
    <div class="row"><button class="btn primary">Publier</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`); },
  async saveNews(ev) { const f = formData(ev); try { await q(sb.from('news').insert({ title: f.title.trim(), body: f.body, until: f.until, rsvp: !!f.rsvp, rsvp_due: f.rsvp && f.rsvp_due ? f.rsvp_due : null })); closeModal(); toast('Nouvelle publiée.'); await loadPage(); } catch (e) { fail(e); } },
  async delNews(id) { try { await q(sb.from('news').delete().eq('id', id)); toast('Nouvelle supprimée.'); await loadPage(); } catch (e) { fail(e); } },
  async rsvp(id, v) { try { await q(sb.from('news_rsvp').upsert({ news_id: id, employee_id: st.me.id, answer: v, answered_at: new Date().toISOString() })); toast(v === 'oui' ? 'Ta participation est confirmée.' : 'Merci de nous avoir avisés.'); await loadPage(); } catch (e) { fail(e); } },
};
window.App = App;
boot();
