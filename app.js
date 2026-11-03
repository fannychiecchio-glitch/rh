/* =====================================================================
   Espace équipe Marius & Fanny — version en ligne (étapes 1 à 4)
   Connexion sécurisée, dossiers des employés, fiche d'embauche,
   salaire et avantages, cahier de l'employé, nouvelles,
   vacances et calendriers, avertissements, contrats signés,
   messages et avis par courriel, paye et pourboire,
   banque d'heures, achats, jours de maladie payés, coffre chiffré,
   accidents, formation, auto-évaluation, accueil et clés.
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
const fs = d => new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' });
const nDays = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5) + 1;
const range = (a, b) => a === b ? fd(a) : `${fs(a)} au ${fd(b)}`;
const STATUS = { 'en attente': ['p-warn', 'En attente'], 'acceptée': ['p-ok', 'Acceptée'], 'refusée': ['p-crit', 'Refusée'], 'contre-proposition': ['p-acc', 'Autres dates proposées'], 'annulée': ['p-mute', 'Annulée'] };
const pill = s => { const [c, t] = STATUS[s] || ['p-mute', s]; return `<span class="pill ${c}">${t}</span>`; };
function season() { const d = new Date(); const y = d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear(); return { y, a: `${y}-05-01`, b: `${y}-09-30` }; }
const MSG_TYPES = { document: 'Document à transmettre', suggestion: 'Suggestion', demande: 'Demande spéciale', question: 'Question', autre: 'Autre' };
const MSG_PILL = { document: 'p-acc', suggestion: 'p-acc', demande: 'p-warn', question: 'p-mute', autre: 'p-mute' };
const WARN_LEVELS = ['Verbal consigné', 'Écrit', 'Final'];
const TPL_KEYS = [['vend', 'Vente'], ['gerant', 'Vente'], ['caiss', 'Vente'], ['livr', 'Livreur'], ['plong', 'Plongeur'], ['patiss', 'Pâtissier'], ['decor', 'Pâtissier'], ['chocol', 'Chocolatier'], ['boulang', 'Boulanger'], ['cuisin', 'Cuisinier']];
const MAIL_KINDS = {
  warning: ['Nouvel avertissement à lire', 'emp'], leave_answer: ['Réponse à une demande de vacances', 'emp'], contract: ['Contrat de travail à signer', 'emp'],
  message_reply: ['Réponse à un message', 'emp'], news: ['Nouvelle publiée (quand tu coches l’envoi)', 'emp'],
  eval_launch: ['Auto-évaluation annuelle à remplir', 'emp'], eval_remind: ['Rappel d’auto-évaluation', 'emp'], recog: ['Anniversaire de service souligné', 'emp'], onb_remind: ['Rappel de la liste d’accueil', 'emp'],
  leave_request: ['Nouvelle demande de vacances', 'adm'], accident: ['Accident déclaré par un employé', 'adm'], eval_done: ['Auto-évaluation remise', 'adm'], message_new: ['Nouveau message d’un employé', 'adm'], contract_signed: ['Contrat signé par un employé', 'adm'],
};
// Avis par courriel : le site dit seulement quel événement est arrivé; la fonction « notify » vérifie les droits et choisit le destinataire.
function notify(kind, id) { sb.functions.invoke('notify', { body: { kind, id } }).then(({ data, error }) => { if (error || data?.error) console.warn('Courriel non envoyé', kind, data?.error || error); }).catch(e => console.warn(e)); }

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
  return `<div class="login"><span class="sym sym-croissant s1" aria-hidden="true"></span><span class="sym sym-baguette s2" aria-hidden="true"></span><span class="sym sym-citrons s3" aria-hidden="true"></span><span class="sym sym-cafe s4" aria-hidden="true"></span><div class="login-card"><img class="brandlogo" src="${LOGO}" alt="Marius &amp; Fanny, artisan du soleil"><p class="tagline">Espace équipe</p>${inner}<div class="symrow" aria-hidden="true"><span class="sym sym-cafe"></span><span class="sym sym-croissant"></span><span class="sym sym-baguette"></span><span class="sym sym-citrons"></span></div></div></div>`;
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
const ADMIN_GROUPS = { emps: [['emps', 'Dossiers'], ['contracts', 'Contrats'], ['train', 'Formation'], ['evals', 'Auto-évaluations'], ['vault', 'Coffre']], comms: [['msgs', 'Messages'], ['handbook', 'Cahier de l’employé'], ['news', 'Nouvelles'], ['mail', 'Courriels']] };
const EMP_GROUPS = { dossier: [['minfo', 'Mes informations'], ['mcontract', 'Mon contrat'], ['msal', 'Salaire et avantages'], ['mwarn', 'Avertissements'], ['msecure', 'Confidentiel'], ['meval', 'Auto-évaluation']], msgs: [['mmsg', 'Messages'], ['macc', 'Déclarer un accident']] };
const groupOf = (G, p) => Object.keys(G).find(k => G[k].some(x => x[0] === p));
function subTabs(G) { const g = groupOf(G, st.view.page); if (!g || G[g].length < 2) return ''; const c = subCounts(); return `<nav class="subtabs">${G[g].map(([p, l]) => `<button onclick="App.go('${p}')" aria-current="${st.view.page === p}">${l}${c[p] ? ` <span class="count">${c[p]}</span>` : ''}</button>`).join('')}</nav>`; }
function subCounts() {
  if (st.role === 'admin') { const b = st.badges || {}; return { contracts: b.ctr, msgs: b.msgs, evals: b.evals }; }
  const d = st.data; return { minfo: d.myInfo === undefined ? 0 : infoDone(d.myInfo) ? 0 : 1, mcontract: (d.myCtr || []).filter(c => !c.emp_sig_at).length, mwarn: (d.myWarn || []).filter(w => !w.ack_at).length, msecure: d.vpub ? kindsFor(st.me).filter(k => !(d.mySec || []).some(x => x.kind === k)).length : 0, meval: (d.myEvals || []).filter(v => v.status !== 'remise').length };
}
function adminNav() { const p = st.view.page, g = groupOf(ADMIN_GROUPS, p), b = st.badges || {}; return navItem('dash', 'Tableau de bord', p === 'dash') + navItem('emps', 'Employés', g === 'emps' || p === 'emp', (b.ctr || 0) + (b.evals || 0)) + navItem('leaves', 'Congés', p === 'leaves', b.leaves) + navItem('tips', 'Paye et pourboire', p === 'tips') + navItem('acc', 'Santé et sécurité', p === 'acc', b.acc) + navItem('msgs', 'Communication', g === 'comms', b.msgs); }
function empNav() {
  const p = st.view.page, c = subCounts(), d = st.data;
  const nDos = (c.minfo || 0) + (c.mcontract || 0) + (c.mwarn || 0) + (c.msecure || 0) + (c.meval || 0);
  const nLeave = (d.myLeaves || []).filter(l => l.status === 'contre-proposition' || (!l.seen && ['acceptée', 'refusée'].includes(l.status))).length;
  const nMsg = (d.myThreads || []).filter(t => t.unread_emp).length;
  return navItem('home', 'Accueil', p === 'home') + navItem('minfo', 'Mon dossier', !!groupOf(EMP_GROUPS, p), nDos) + (trainFor(st.me).length ? navItem('mtrain', 'Formation', p === 'mtrain', trainProg(st.me).d < trainProg(st.me).t ? 1 : 0) : '') + navItem('mleave', 'Mes congés', p === 'mleave', nLeave) + navItem('mmsg', 'Messages', !!groupOf({ m: EMP_GROUPS.msgs }, p), nMsg) + navItem('macct', 'Mon compte', p === 'macct');
}

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
  app.innerHTML = `<div class="shell${m ? ' mob' : ''}"><aside class="rail"><div class="brandbar"><img src="${LOGO}" alt="Marius &amp; Fanny"><span class="brandsub">Espace équipe</span></div><nav class="nav" aria-label="Navigation">${admin ? adminNav() : empNav()}</nav><span class="sym sym-croissant railsym" aria-hidden="true"></span><div class="who"><span class="wname">${esc(name)}<br><span class="muted small">${admin ? 'Administration' : esc(st.me.poste)}</span></span><button class="btn sm" onclick="App.logout()">Se déconnecter</button></div></aside><main class="pane"><div class="inner">${content}</div></main></div>`;
}
const loading = () => `<div class="center" style="min-height:200px"><div class="spinner"></div></div>`;

/* ---------- Chargement des données par page ---------- */
async function loadPage() {
  const p = st.view.page; st.loading = true; render();
  try {
    if (st.role === 'admin') {
      const cnt = t => t.select('id', { count: 'exact', head: true });
      const [b1, b2, b3] = await Promise.all([cnt(sb.from('leave_requests')).eq('status', 'en attente'), cnt(sb.from('contracts')).is('completed_at', null), cnt(sb.from('threads')).eq('unread_admin', true)]);
      const [b4, b5] = await Promise.all([cnt(sb.from('accidents')).eq('status', 'à traiter'), cnt(sb.from('evals')).eq('status', 'remise').eq('seen', false)]);
      st.badges = { leaves: b1.count || 0, ctr: b2.count || 0, msgs: b3.count || 0, acc: b4.count || 0, evals: b5.count || 0 };
      if (!st.cleaned) { st.cleaned = true; sb.rpc('mf_cleanup').then(({ error }) => error && console.warn(error)); }
      const CTR_LIST = 'id,employee_id,title,created_at,emp_sig_at,admin_sig_at,completed_at';
      if (p === 'dash') {
        st.data.pendLeaves = await q(sb.from('leave_requests').select('*').eq('status', 'en attente').order('start_date'));
        st.data.openWarn = await q(sb.from('warnings').select('id,employee_id,title,date').is('ack_at', null));
        st.data.ctrs = await q(sb.from('contracts').select(CTR_LIST).is('completed_at', null));
      }
      if (p === 'emp') {
        const id = st.view.id;
        st.data.empWarn = await q(sb.from('warnings').select('*').eq('employee_id', id).order('date', { ascending: false }));
        st.data.empCtr = await q(sb.from('contracts').select(CTR_LIST).eq('employee_id', id).order('created_at', { ascending: false }));
        st.data.empLeaves = await q(sb.from('leave_requests').select('*').eq('employee_id', id).order('start_date', { ascending: false }));
      }
      if (p === 'leaves') {
        const from = new Date(); from.setFullYear(from.getFullYear() - 1);
        st.data.leaves = await q(sb.from('leave_requests').select('*').neq('status', 'annulée').gte('end_date', iso(from)).order('start_date'));
        st.data.emps = await q(sb.from('employees').select('id,first_name,last_name,poste,magasin,active').order('last_name'));
      }
      if (p === 'contracts') {
        st.data.ctrs = await q(sb.from('contracts').select(CTR_LIST).order('created_at', { ascending: false }));
        st.data.tpls = await q(sb.from('contract_templates').select('*').order('position'));
        st.data.settings = (await q(sb.from('app_settings').select('*')))[0] || {};
        st.data.emps = await q(sb.from('employees').select('id,first_name,last_name,poste,magasin,active').order('last_name'));
      }
      if (p === 'msgs') {
        st.data.threads = await q(sb.from('threads').select('*').order('last_at', { ascending: false }));
        st.data.emps = await q(sb.from('employees').select('id,first_name,last_name,poste,magasin,active').order('last_name'));
      }
      if (p === 'mail') {
        st.data.settings = (await q(sb.from('app_settings').select('*')))[0] || {};
        st.data.mailLog = await q(sb.from('notify_log').select('*').order('at', { ascending: false }).limit(60));
      }
      if (p === 'tips' || p === 'emp' || p === 'leaves') await loadPay();
      const allEmps = () => q(sb.from('employees').select('*').order('last_name'));
      if (p === 'dash') st.data.recogs = await q(sb.from('recognitions').select('employee_id,years'));
      if (p === 'emp') {
        const id = st.view.id;
        const [k, o, od, os, sm, hm, hr, ev, vp] = await Promise.all([q(sb.from('keys_held').select('*').eq('employee_id', id).order('given', { ascending: false })), q(sb.from('onb').select('*').eq('employee_id', id)), q(sb.from('onb_done').select('*').eq('employee_id', id)), q(sb.from('onb_steps').select('*').order('position')),
          q(sb.from('secure_items').select('id,kind,created_at,employee_id').eq('employee_id', id)), q(sb.from('handbook_meta').select('version')), q(sb.from('handbook_reads').select('version').eq('employee_id', id)), q(sb.from('evals').select('*').eq('employee_id', id).order('year', { ascending: false })), q(sb.from('vault_pub').select('id'))]);
        Object.assign(st.data, { empKeys: k, empOnb: o[0] || null, empOnbDone: od, onbSteps: os, empSec: sm, empHbRead: hr.some(r => r.version === hm[0]?.version), empEvals: ev, vaultOn: vp.length > 0 });
        const { data: dd } = await sb.from('employee_docs').select('*').eq('employee_id', id).order('created_at', { ascending: false }); st.data.empDocs = dd || [];
      }
      if (p === 'vault') {
        const [vk, sm, em, lg] = await Promise.all([q(sb.from('vault_key').select('id')), q(sb.from('secure_items').select('id,kind,created_at,employee_id')), allEmps(), q(sb.from('vault_log').select('*').order('at', { ascending: false }).limit(2000))]);
        Object.assign(st.data, { vkey: vk.length > 0, secMeta: sm, emps: em, vlog: lg });
      }
      if (p === 'acc') { st.data.accs = await q(sb.from('accidents').select('*').order('date', { ascending: false })); st.data.emps = await allEmps(); }
      if (p === 'train') { const [m, l, d] = await Promise.all([q(sb.from('training_modules').select('*')), q(sb.from('training_lessons').select('*')), q(sb.from('training_done').select('*'))]); st.data.train = { mods: m, les: l, done: d }; st.data.emps = await allEmps(); }
      if (p === 'evals') { st.data.evals = await q(sb.from('evals').select('*')); st.data.emps = await allEmps(); }
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
      const [r1, r2, r3, r4, r5] = await Promise.all([
        sb.from('employee_info').select('*').eq('employee_id', id),
        sb.from('warnings').select('*').eq('employee_id', id).order('date', { ascending: false }),
        sb.from('contracts').select('id,title,created_at,emp_sig_at,admin_sig_at,completed_at').eq('employee_id', id).order('created_at', { ascending: false }),
        sb.from('leave_requests').select('*').eq('employee_id', id).order('start_date', { ascending: false }),
        sb.from('threads').select('*').eq('employee_id', id).order('last_at', { ascending: false }),
      ]);
      for (const r of [r1, r2, r3, r4, r5]) if (r.error) throw r.error;
      st.data.myInfo = r1.data[0] || null; st.data.myWarn = r2.data; st.data.myCtr = r3.data; st.data.myLeaves = r4.data; st.data.myThreads = r5.data;
      const [s1, s2, s3, s4, s5, s6, s7, s8] = await Promise.all([sb.rpc('my_secure_status'), sb.from('vault_pub').select('pub'), sb.from('onb').select('*').eq('employee_id', id), sb.from('training_modules').select('*'), sb.from('training_lessons').select('id,module_id,position,title,body'), sb.from('training_done').select('*').eq('employee_id', id), sb.from('evals').select('*').eq('employee_id', id).order('year', { ascending: false }), sb.from('recognitions').select('*').eq('employee_id', id)]);
      for (const r of [s1, s2, s3, s4, s5, s6, s7, s8]) if (r.error) throw r.error;
      Object.assign(st.data, { mySec: s1.data, vpub: s2.data[0]?.pub || null, myOnb: s3.data[0] || null, train: { mods: s4.data, les: s5.data, done: s6.data }, myEvals: s7.data, myRecogs: s8.data });
      if (p === 'macc') st.data.myAccs = await q(sb.from('accidents').select('id,date,place,injury,kind,off_days,status').eq('employee_id', id).order('date', { ascending: false }));
      if ((p === 'home' || p === 'msecure') && !st.data.hbMeta) st.data.hbMeta = (await q(sb.from('handbook_meta').select('*')))[0];
      if (p === 'mcontract') st.data.myCtrFull = await q(sb.from('contracts').select('*').eq('employee_id', id).order('created_at', { ascending: false }));
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
  switch (st.view.page) { case 'emps': return empsView(); case 'emp': return empDetail(); case 'handbook': return handbookAdmin(); case 'news': return newsAdmin(); case 'leaves': return leavesView(); case 'contracts': return contractsView(); case 'msgs': return adminMsgView(); case 'mail': return mailView(); case 'tips': return tipsView(); case 'vault': return vaultView(); case 'acc': return accView(); case 'train': return adminTrainView(); case 'evals': return adminEvalView(); default: return dashView(); }
}
const curRate = id => { const r = (st.data.rates || []).find(x => x.employee_id === id); return r ? r.rate : null; };
function dashView() {
  const emps = (st.data.emps || []).filter(e => e.active); const infos = st.data.infos || [];
  const inc = emps.filter(e => !infoDone(infos.find(i => i.employee_id === e.id)));
  const v = st.data.hbMeta?.version; const read = new Set((st.data.hbReads || []).filter(r => r.version === v).map(r => r.employee_id));
  const notRead = emps.filter(e => e.user_id && !read.has(e.id));
  const b = st.badges || {}; const pl = st.data.pendLeaves || []; const ow = st.data.openWarn || [];
  const empOf = id => (st.data.emps || []).find(e => e.id === id);
  return `<div class="spread"><div><p class="eyebrow">Administration</p><h1>Tableau de bord<span class="sym sym-baguette ttl" aria-hidden="true"></span></h1></div></div>
  <div class="tiles"><button class="tile" onclick="App.go('emps')"><b>${emps.length}</b><span>employés actifs</span></button><button class="tile${b.leaves ? ' alert' : ''}" onclick="App.go('leaves')"><b>${b.leaves || 0}</b><span>demandes de vacances à traiter</span></button><button class="tile${b.msgs ? ' alert' : ''}" onclick="App.go('msgs')"><b>${b.msgs || 0}</b><span>messages non lus</span></button><button class="tile${b.ctr ? ' alert' : ''}" onclick="App.go('contracts')"><b>${b.ctr || 0}</b><span>contrats à signer</span></button><button class="tile${b.acc ? ' alert' : ''}" onclick="App.go('acc')"><b>${b.acc || 0}</b><span>accidents à compléter</span></button><button class="tile${b.evals ? ' alert' : ''}" onclick="App.go('evals')"><b>${b.evals || 0}</b><span>auto-évaluations à lire</span></button><button class="tile${inc.length ? ' alert' : ''}" onclick="App.go('emps')"><b>${inc.length}</b><span>fiches d’embauche incomplètes</span></button><button class="tile${notRead.length ? ' alert' : ''}" onclick="App.go('handbook')"><b>${notRead.length}</b><span>n’ont pas lu le cahier</span></button></div>
  ${annivSection()}
  ${pl.length ? `<section class="section"><h2>Demandes de vacances à traiter</h2>${pendingList(pl.map(l => ({ ...l, emp: empOf(l.employee_id) })).filter(l => l.emp), [])}</section>` : ''}
  ${ow.length ? `<section class="section"><h2>Avertissements pas encore confirmés</h2><div class="list">${ow.map(w => { const e = empOf(w.employee_id); return e ? `<div class="item"><div class="grow"><b>${esc(fullname(e))}</b><span class="muted small">${esc(w.title)} · ${fd(w.date)}</span></div><button class="btn sm" onclick="App.openEmp('${e.id}','warn')">Voir</button></div>` : ''; }).join('')}</div></section>` : ''}
  ${emps.length ? '' : `<section class="panel stack"><h2>Bienvenue dans ton espace</h2><p>Commence par ajouter tes employés. Chacun recevra un courriel pour choisir son mot de passe.</p><div><button class="btn primary" onclick="App.go('emps');setTimeout(()=>App.empForm(),50)">Ajouter un employé</button></div></section>`}
  ${inc.length ? `<section class="section"><h2>Fiches d’embauche incomplètes</h2><div class="list">${inc.map(e => `<div class="item"><div class="grow"><b>${esc(fullname(e))}</b><span class="muted small">${esc(e.poste)} · ${esc(e.magasin)}</span></div><button class="btn sm" onclick="App.openEmp('${e.id}')">Voir le dossier</button></div>`).join('')}</div></section>` : ''}
  ${backupPanel()}`;
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
  const tabs = [['profil', 'Profil'], ['fiche', 'Fiche d’embauche'], ['contrat', 'Contrat'], ['salaire', 'Salaire et avantages'], ['warn', 'Avertissements'], ['conges', 'Congés'], ['accueil', 'Accueil'], ['docs', 'Documents'], ['secure', 'Confidentiel'], ['notes', 'Notes']];
  const flag = { contrat: (st.data.empCtr || []).some(c => !c.completed_at), warn: (st.data.empWarn || []).some(w => !w.ack_at), conges: (st.data.empLeaves || []).some(l => l.status === 'en attente') };
  let body = '';
  if (tab === 'contrat') body = `<div class="spread"><p class="muted">${esc(e.first_name)} peut signer dans son espace, ou sur ton appareil quand tu lui présentes la plateforme.</p><button class="btn primary" onclick="App.contractForm('${e.id}')">Créer un contrat</button></div>${contractRows((st.data.empCtr || []).map(c => ({ c, e })), false, 'Aucun contrat pour cet employé.')}`;
  if (tab === 'warn') body = `<div class="spread"><p class="muted">${esc(e.first_name)} doit confirmer avoir pris connaissance de chaque avertissement.</p><button class="btn primary" onclick="App.warnForm('${e.id}')">Émettre un avertissement</button></div>${warnList(st.data.empWarn, true)}`;
  if (tab === 'conges') body = adminSickPanel(e) + `<section class="section"><h2>Vacances et autres congés</h2>${leaveList((st.data.empLeaves || []).map(l => ({ ...l, emp: e })), true)}</section>`;
  if (tab === 'profil') body = `<div class="panel stack"><dl class="facts"><div><dt>Poste</dt><dd>${esc(e.poste) || '—'}</dd></div><div><dt>Magasin</dt><dd>${esc(e.magasin)}</dd></div><div><dt>Groupe de pourboire</dt><dd>${TIP_GROUPS[e.tip_group]}</dd></div><div><dt>Date d’embauche</dt><dd>${fd(e.start_date)}</dd></div><div><dt>Ancienneté</dt><dd>${seniority(e.start_date)}</dd></div><div><dt>Courriel de connexion</dt><dd>${esc(e.email)}</dd></div><div><dt>Statut</dt><dd>${e.active ? '<span class="pill p-ok">Actif</span>' : '<span class="pill p-mute">Inactif, ne peut plus se connecter</span>'}</dd></div></dl>
    <div class="row"><button class="btn" onclick="App.empForm('${e.id}')">Modifier le profil</button><button class="btn" onclick="App.resend('${e.id}')">Renvoyer l’invitation</button><button class="btn" onclick="App.toggleActive()">${e.active ? 'Désactiver l’accès' : 'Réactiver l’accès'}</button></div></div>`;
  if (tab === 'profil') body += keysCard(e);
  if (tab === 'fiche') body = `<div class="panel">${infoForm(st.data.empInfo, 'admin')}</div>`;
  if (tab === 'salaire') body = empEvalCard() + salaryBlock(st.data.empSal, st.data.empPerks, true) + empTips(e);
  if (tab === 'accueil') body = onbTab(e);
  if (tab === 'docs') body = docsTab(e);
  if (tab === 'secure') body = adminSecureTab(e);
  if (tab === 'notes') body = `<section class="panel stack"><div class="spread"><div><h2>Bloc-notes</h2><p class="small muted">Visible seulement par toi.</p></div><span id="nt-status" class="small muted">${st.data.empNotes ? 'Enregistré le ' + fdt(st.data.empNotes.updated_at) : 'Aucune note'}</span></div><textarea class="big" id="nt-text" oninput="App.noteInput(this.value)">${esc(st.data.empNotes?.notes || '')}</textarea><p class="small muted">Les notes s’enregistrent automatiquement.</p></section>`;
  return `<div><button class="btn ghost sm" onclick="App.go('emps')">← Tous les employés</button></div>
  <div class="spread"><div><p class="eyebrow">${esc(e.poste)} · ${esc(e.magasin)}</p><h1>${esc(fullname(e))}</h1></div>${e.active ? '' : '<span class="pill p-mute">Inactif</span>'}</div>
  <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" onclick="App.tab('${k}')">${l}${flag[k] ? ' <span class="count">!</span>' : ''}</button>`).join('')}</div>${body}`;
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
  return `<section class="handbook"><div class="hb-head"><span class="sym sym-croissant" aria-hidden="true"></span><div><span class="eyebrow">Cahier de l’employé · ${esc(m.version_name)}</span><h2>${esc(m.headline)}</h2></div>${preview ? '<span class="pill p-acc">Aperçu</span>' : read ? '<span class="pill p-ok">Lu</span>' : `<button class="btn primary" onclick="App.readHb()">J’ai lu le cahier</button>`}</div>
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

/* ---------- Congés et calendriers ---------- */
const empById = id => (st.data.emps || []).find(e => e.id === id);
function conflicts(l, all) {
  const others = all.filter(o => o.emp && o.emp.id !== l.emp.id && o.status === 'acceptée' && o.emp.magasin === l.emp.magasin && o.start_date <= l.end_date && o.end_date >= l.start_date);
  return others.length ? `<span class="small" style="color:var(--warn)">Déjà absents (${esc(l.emp.magasin)}) pendant cette période : ${others.map(o => esc(o.emp.first_name)).join(', ')}</span>` : '';
}
const decideBtns = l => `<div class="row"><button class="btn sm ok" onclick="App.leaveDecide('${l.id}')">Accepter</button><button class="btn sm" onclick="App.proposeForm('${l.id}')">Proposer d’autres dates</button><button class="btn sm crit" onclick="App.refuseForm('${l.id}')">Refuser</button></div>`;
function pendingList(pl, all) {
  if (!pl.length) return '<div class="list"><p class="empty">Aucune demande en attente.</p></div>';
  return `<div class="list">${pl.map(l => `<div class="item"><div class="grow"><b>${esc(fullname(l.emp))} <span class="muted small" style="font-weight:400">· ${esc(l.emp.magasin)}</span></b><span>${esc(l.type)} · ${range(l.start_date, l.end_date)} <span class="muted">(${nDays(l.start_date, l.end_date)} jours)</span></span>${l.note ? `<span class="muted small">« ${esc(l.note)} »</span>` : ''}${conflicts(l, all)}</div>${decideBtns(l)}</div>`).join('')}</div>`;
}
function leaveList(ls, admin) {
  if (!ls.length) return `<div class="list"><p class="empty">Aucune demande de congé.</p></div>`;
  return `<div class="list">${ls.map(l => {
    let extra = '';
    if (l.status === 'contre-proposition' && l.prop_start) extra = `<div class="banner acc" style="margin-top:8px"><div class="stack" style="gap:4px"><b>Dates proposées : ${range(l.prop_start, l.prop_end)} (${nDays(l.prop_start, l.prop_end)} jours)</b>${l.prop_msg ? `<span class="small">${esc(l.prop_msg)}</span>` : ''}</div>${admin ? '<span class="small muted">En attente de la réponse de l’employé</span>' : `<div class="row"><button class="btn sm primary" onclick="App.answerProposal('${l.id}',true)">Accepter ces dates</button><button class="btn sm" onclick="App.answerProposal('${l.id}',false)">Refuser</button></div>`}</div>`;
    const acts = admin && l.status === 'en attente' ? decideBtns(l) : (!admin && l.status === 'en attente' ? `<button class="btn sm ghost" onclick="App.cancelLeave('${l.id}')">Annuler la demande</button>` : '');
    return `<div class="item" style="display:grid;gap:4px"><div class="spread"><div class="grow"><b>${esc(l.type)} · ${range(l.start_date, l.end_date)}</b><span class="muted small">${nDays(l.start_date, l.end_date)} jours · demandé le ${fd(l.requested_at)}${l.note ? ` · « ${esc(l.note)} »` : ''}</span>${l.admin_msg ? `<span class="small">Réponse : ${esc(l.admin_msg)}</span>` : ''}</div><div class="row">${pill(l.status)}${acts}</div></div>${extra}</div>`;
  }).join('')}</div>`;
}
function leavesView() {
  const all = (st.data.leaves || []).map(l => ({ ...l, emp: empById(l.employee_id) })).filter(l => l.emp);
  const pl = all.filter(l => l.status === 'en attente'), props = all.filter(l => l.status === 'contre-proposition');
  return `<div class="spread"><div><p class="eyebrow">Administration</p><h1>Congés et vacances</h1></div></div>
  <section class="section"><h2>À traiter</h2>${pendingList(pl, all)}</section>
  ${props.length ? `<section class="section"><h2>En attente de la réponse de l’employé</h2><div class="list">${props.map(l => `<div class="item"><div class="grow"><b>${esc(fullname(l.emp))}</b><span class="small">Demandé : ${range(l.start_date, l.end_date)} · Proposé : <b>${range(l.prop_start, l.prop_end)}</b></span></div>${pill(l.status)}</div>`).join('')}</div></section>` : ''}
  ${campaign(all)}
  ${sickAdminSection()}
  <section class="section">${calendar(all)}</section>`;
}
function campaign(all) {
  const s = season(); const act = (st.data.emps || []).filter(e => e.active);
  const done = act.filter(e => all.some(l => l.emp.id === e.id && l.type === 'Vacances' && l.start_date >= s.a && l.start_date <= s.b));
  const miss = act.filter(e => !done.includes(e)); const pct = act.length ? Math.round(done.length / act.length * 100) : 0;
  return `<section class="panel stack"><div class="spread"><h2>Vacances d’été ${s.y}</h2><span class="num"><b>${done.length}</b> sur ${act.length} employés ont fait leur demande</span></div><div class="bar" role="img" aria-label="${pct} %"><i style="width:${pct}%"></i></div>${miss.length ? `<div class="stack" style="gap:6px"><span class="small muted">N’ont pas encore fait de demande :</span><div class="chips">${miss.map(e => `<span class="chip">${esc(fullname(e))}</span>`).join('')}</div></div>` : '<p class="small" style="color:var(--ok)">Tout le monde a fait sa demande.</p>'}</section>`;
}
function calendar(all) {
  const now = new Date(); const [y, m] = st.cal || [now.getFullYear(), now.getMonth()]; const n = new Date(y, m + 1, 0).getDate();
  const first = `${y}-${pad(m + 1)}-01`, last = `${y}-${pad(m + 1)}-${pad(n)}`;
  const span = l => l.status === 'contre-proposition' && l.prop_start ? [l.prop_start, l.prop_end] : [l.start_date, l.end_date];
  const live = all.filter(l => ['acceptée', 'en attente', 'contre-proposition'].includes(l.status) && span(l)[0] <= last && span(l)[1] >= first);
  const days = [...Array(n)].map((_, i) => { const d = new Date(y, m, i + 1); return { iso: iso(d), num: i + 1, wd: 'DLMMJVS'[d.getDay()], we: d.getDay() === 0 || d.getDay() === 6 }; });
  const title = new Date(y, m, 1).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
  const cls = { 'acceptée': 'c-ok', 'en attente': 'c-pend', 'contre-proposition': 'c-prop' };
  return `<div class="spread"><h2>Calendriers des absences</h2><div class="row"><button class="btn sm" onclick="App.cal(-1)" aria-label="Mois précédent">←</button><b style="min-width:140px;text-align:center;text-transform:capitalize">${title}</b><button class="btn sm" onclick="App.cal(1)" aria-label="Mois suivant">→</button><button class="btn sm ghost" onclick="App.calTo()">Ce mois-ci</button><button class="btn sm ghost" onclick="App.calTo(${season().y},6)">Juillet ${season().y}</button></div></div>
  <div class="legend"><span><i style="background:var(--ok)"></i>Accepté</span><span><i style="background:repeating-linear-gradient(45deg,var(--warn) 0 3px,transparent 3px 6px)"></i>En attente</span><span><i style="border:2px dashed var(--accent);border-left:0;border-right:0"></i>Dates proposées</span></div>
  ${[['Production', 'Production'], ['Laval', 'Vente Laval'], ['Montréal', 'Vente Montréal']].map(([mag, label]) => {
    const team = (st.data.emps || []).filter(e => e.active && e.magasin === mag);
    const rows = team.map(e => ({ e, ls: live.filter(l => l.emp.id === e.id) })).filter(r => r.ls.length);
    const counts = days.map(d => rows.filter(r => r.ls.some(l => l.status === 'acceptée' && l.start_date <= d.iso && l.end_date >= d.iso)).length);
    return `<section class="stack" style="gap:8px"><h3 class="calh">${label} <span class="small muted" style="font-family:var(--body);font-weight:400">· ${team.length} employé${team.length > 1 ? 's' : ''}${rows.length ? ` · ${rows.length} avec une absence ce mois-ci` : ''}</span></h3>
    ${rows.length ? `<div class="tablewrap"><table class="cal"><thead><tr><th class="name">Employé</th>${days.map(d => `<th class="${d.we ? 'we' : ''}">${d.wd}<br><span class="num">${d.num}</span></th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><td class="name">${esc(fullname(r.e))}<br><span class="muted small" style="font-weight:400">${esc(r.e.poste)}</span></td>${days.map(d => { const l = r.ls.find(l => span(l)[0] <= d.iso && span(l)[1] >= d.iso); return `<td class="d ${l ? cls[l.status] : ''}" ${l ? `title="${esc(l.type)} · ${STATUS[l.status][1]}"` : ''}>${l ? '<i></i>' : ''}</td>`; }).join('')}</tr>`).join('')}</tbody><tfoot><tr><td class="name">Absents confirmés</td>${counts.map(c => `<td class="${c >= 2 ? 'hot' : ''}">${c || ''}</td>`).join('')}</tr></tfoot></table></div>` : `<div class="list"><p class="empty">Personne n’est absent ce mois-ci.</p></div>`}</section>`;
  }).join('')}
  <p class="small muted">Le nombre d’absents s’affiche en rouge quand 2 personnes ou plus de la même équipe sont absentes le même jour.</p>`;
}

/* ---------- Avertissements ---------- */
function warnList(ws, admin) {
  ws = ws || []; if (!ws.length) return `<div class="list"><p class="empty">Aucun avertissement au dossier.</p></div>`;
  return `<div class="stack">${ws.map(w => `<article class="warncard${w.ack_at ? '' : ' open'}"><div class="spread"><div><span class="eyebrow">Avertissement ${esc(w.level.toLowerCase())} · ${fd(w.date)}</span><h3>${esc(w.title)}</h3></div>${w.ack_at ? `<span class="pill p-ok">Lu et confirmé le ${fd(w.ack_at)}</span>` : '<span class="pill p-crit">Pas encore confirmé</span>'}</div><p class="body">${esc(w.body)}</p>
  ${w.comment ? `<p class="small"><span class="muted">Commentaire de l’employé :</span> ${esc(w.comment)}</p>` : ''}
  ${!admin && !w.ack_at ? `<form class="stack" onsubmit="App.ack(event,'${w.id}')"><label>Commentaire (facultatif)<textarea name="comment" placeholder="Tu peux ajouter ta version des faits."></textarea></label><div><button class="btn primary">J’ai pris connaissance de cet avertissement</button></div><p class="small muted">Confirmer veut dire que tu l’as lu, pas que tu es d’accord.</p></form>` : ''}
  ${admin ? `<div><button class="btn ghost sm" onclick="App.delWarn('${w.id}')">Retirer du dossier</button></div>` : ''}</article>`).join('')}</div>`;
}

/* ---------- Contrats ---------- */
function cPill(c, forEmp) {
  if (c.completed_at) return '<span class="pill p-ok">Signé par les deux parties</span>';
  if (c.emp_sig_at) return `<span class="pill p-warn">${forEmp ? 'En attente de l’employeur' : 'Attend ta signature'}</span>`;
  if (c.admin_sig_at) return `<span class="pill p-acc">${forEmp ? 'À signer' : 'Attend la signature de l’employé'}</span>`;
  return `<span class="pill p-acc">${forEmp ? 'À signer' : 'À signer par les deux'}</span>`;
}
function contractRows(list, showName, emptyText) {
  if (!list.length) return `<div class="list"><p class="empty">${emptyText || 'Aucun contrat.'}</p></div>`;
  return `<div class="list">${list.map(({ c, e }) => `<div class="item"><div class="grow"><b>${showName ? esc(fullname(e)) : esc(c.title)}</b><span class="muted small">${showName ? esc(c.title) + ' · ' : ''}préparé le ${fd(c.created_at)}${c.completed_at ? ` · signé le ${fd(c.completed_at)}` : ''}</span></div><div class="row">${cPill(c, false)}<button class="btn sm" onclick="App.viewContract('${c.id}')">Ouvrir</button></div></div>`).join('')}</div>`;
}
function contractText(body) {
  return esc(body).split('\n').map((ln, i) => {
    const t = ln.trim(); if (i === 0) return `<span class="ct">${ln}</span>`; if (i === 1 && t) return `<span class="cst">${ln}</span>`;
    if (/^(\d+\.\s+[^a-z]+|PRÉAMBULE|ENTRE|ET|LES PARTIES CONVIENNENT DE CE QUI SUIT :)$/.test(t)) return `<b class="ch">${ln}</b>`;
    return ln.replace(/^(\d+\.\d+\s(?:[A-ZÀ-Ü][\wÀ-ÿ’' -]{2,30}\.)?)/, m => `<b>${m}</b>`);
  }).join('\n');
}
const companyOf = body => (String(body).match(/\nENTRE\n([^\n]+?), ayant/) || [])[1] || 'Marius & Fanny';
function contractDoc(c, empName, company, mode) {
  const block = who => {
    const s = who === 'emp' ? (c.emp_sig_at && { name: c.emp_sig_name, img: c.emp_sig_img, at: c.emp_sig_at, how: c.emp_sig_how }) : (c.admin_sig_at && { name: c.admin_sig_name, img: c.admin_sig_img, at: c.admin_sig_at });
    const label = who === 'emp' ? `L’Employé(e) : ${esc(empName)}` : `Pour l’Employeur : ${esc(company)}`;
    let action = '';
    if (!s && mode !== 'print') {
      if (mode === 'admin') action = who === 'emp' ? `<button class="btn sm" onclick="App.signForm('${c.id}','emp')">Faire signer l’employé sur cet appareil</button>` : `<button class="btn sm primary" onclick="App.signForm('${c.id}','admin')">Signer comme employeur</button>`;
      else action = who === 'emp' ? `<button class="btn primary" onclick="App.signForm('${c.id}','emp')">Signer mon contrat</button>` : '<span class="sigmeta">En attente de la signature de l’employeur</span>';
    }
    return `<div class="sigblock"><div class="sigline">${s ? `<img src="${esc(s.img)}" alt="Signature de ${esc(s.name)}">` : ''}</div><span class="sigmeta">${label}</span>${s ? `<span class="sigmeta">Signé par ${esc(s.name)} le ${fdt(s.at)}${s.how ? ` · ${esc(s.how)}` : ''}</span>` : action}</div>`;
  };
  return `<article class="paper"><div class="ctext">${contractText(c.body)}</div><div class="sigs">${block('emp')}${block('admin')}</div>${c.body_sha256 ? `<p class="sigmeta" style="overflow-wrap:anywhere">Empreinte numérique du texte (SHA-256) : ${esc(c.body_sha256)}</p>` : ''}</article>`;
}
function contractsView() {
  const ctrs = st.data.ctrs || [], S = st.data.settings || {};
  const withE = l => l.map(c => ({ c, e: empById(c.employee_id) })).filter(x => x.e);
  const open = withE(ctrs.filter(c => !c.completed_at)), done = withE(ctrs.filter(c => c.completed_at));
  return `<div class="spread"><div><p class="eyebrow">Employés</p><h1>Contrats de travail</h1></div><button class="btn primary" onclick="App.contractForm()">Créer un contrat</button></div>
  <section class="section"><h2>À compléter</h2>${contractRows(open, true, 'Tous les contrats sont signés.')}</section>
  <section class="section"><h2>Contrats signés</h2>${contractRows(done, true, 'Aucun contrat signé pour le moment.')}</section>
  <section class="section"><h2>Renseignements de l’employeur</h2>
  <form class="panel stack" onsubmit="App.saveCompany(event)"><p class="small muted">Ils remplissent automatiquement l’en-tête et la clause de signature de chaque nouveau contrat.</p>
  <div class="two"><label>Nom légal de l’entreprise<input name="company" required value="${esc(S.company)}"></label><label>Adresse du principal établissement<input name="company_address" required placeholder="1234 rue Principale, Laval (Québec) H7A 1A1" value="${esc(S.company_address)}"></label>
  <label>Représentant(e) qui signe<input name="company_rep" required placeholder="Prénom Nom" value="${esc(S.company_rep)}"></label><label>Titre<input name="company_rep_title" required placeholder="Ex. présidente" value="${esc(S.company_rep_title)}"></label>
  <label>Ville de signature<input name="company_city" required value="${esc(S.company_city)}"></label></div>
  <div class="stack" style="gap:8px"><h3>Adresses des établissements</h3><p class="small muted">Le contrat indique l’adresse de l’établissement inscrit dans le profil de l’employé.</p>
  <div class="two"><label>Magasin de Laval<input name="store_laval" placeholder="Ex. 1234 boulevard Saint-Martin, Laval (Québec) H7A 1A1" value="${esc(S.store_laval)}"></label><label>Magasin de Montréal<input name="store_mtl" placeholder="Ex. 567 rue Saint-Denis, Montréal (Québec) H2X 1A1" value="${esc(S.store_mtl)}"></label>
  <label>Atelier de production (si différent du magasin de Laval)<input name="store_prod" placeholder="Laissé vide : adresse du magasin de Laval" value="${esc(S.store_prod)}"></label></div></div><div><button class="btn primary">Enregistrer</button></div></form></section>
  <section class="section"><div class="spread"><h2>Modèles de contrat</h2><button class="btn" onclick="App.tplForm()">Nouveau modèle</button></div>
  <div class="tplgrid">${(st.data.tpls || []).map(t => `<div class="tpl"><span class="eyebrow">${esc(t.poste)}</span><h3>${esc(t.title)}</h3><div class="row"><button class="btn sm" onclick="App.tplForm('${t.id}')">Modifier le texte</button></div></div>`).join('')}</div>
  <p class="small muted">Fais valider ces modèles par un conseiller juridique ou en ressources humaines avant de les utiliser avec tes employés. Modifier un modèle ne change pas les contrats déjà créés.</p></section>`;
}
function guessTpl(e, tpls) { const p = slug(e.poste); const k = TPL_KEYS.find(([s]) => p.includes(s)); return (k && tpls.find(t => t.poste === k[1])) || tpls[0]; }
function fillContract(e, info, S, tpl, o) {
  const adrL = e.magasin === 'Production' ? (S.store_prod || S.store_laval) : e.magasin === 'Montréal' ? S.store_mtl : S.store_laval;
  const adrLieu = adrL || `[adresse ${e.magasin === 'Production' ? 'de l’atelier de production' : 'du magasin de ' + e.magasin}]`;
  const lieu = (e.magasin === 'Production' ? 'à l’atelier de production de Laval' : `au magasin de ${e.magasin}`) + `, situé au ${adrLieu}`;
  const i = info; const adrE = i && i.street ? `${i.street}${i.apt ? ', app. ' + i.apt : ''}, ${i.city} (${i.province || 'QC'}) ${fmtPostal(i.postal)}` : '[adresse de l’employé — fiche d’embauche à remplir]';
  const v = { adresse_lieu: adrLieu, adresse_entreprise: S.company_address || '[adresse de l’entreprise]', representant: S.company_rep || '[nom du représentant]', titre_representant: S.company_rep_title || '[titre]', ville: S.company_city || '[ville]', adresse_employe: adrE, entreprise: S.company || 'Marius & Fanny', prenom: e.first_name, nom: e.last_name, poste: String(e.poste || '').toLowerCase(), lieu, magasin: e.magasin, date_debut: fd(o.date_debut), statut: o.statut.toLowerCase(), heures: o.heures, taux: money(o.taux), essai: o.essai, date_contrat: fd(TODAY) };
  return tpl.body.replace(/\{\{(\w+)\}\}/g, (m, k) => v[k] !== undefined ? v[k] : m);
}
let sigPad = null;
function initPad() {
  const c = document.getElementById('pad'); if (!c) return; const dpr = window.devicePixelRatio || 1; const r = c.getBoundingClientRect();
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); const x = c.getContext('2d'); x.scale(dpr, dpr);
  x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#1E2A21'; sigPad = { c, x, drawn: false, down: false };
  const pos = ev => { const b = c.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; };
  c.addEventListener('pointerdown', ev => { ev.preventDefault(); sigPad.down = true; try { c.setPointerCapture(ev.pointerId); } catch (_) {} const [a, b] = pos(ev); x.beginPath(); x.moveTo(a, b); x.lineTo(a + .1, b + .1); x.stroke(); sigPad.drawn = true; $('#sg-err').hidden = true; });
  c.addEventListener('pointermove', ev => { if (!sigPad.down) return; const [a, b] = pos(ev); x.lineTo(a, b); x.stroke(); });
  const up = () => { sigPad.down = false; }; c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
}
// Signature réduite (fond blanc, largeur 600 px) pour garder le contrat léger
function sigImage() { const src = sigPad.c, w = Math.min(600, src.width), h = Math.round(src.height * w / src.width); const o = document.createElement('canvas'); o.width = w; o.height = h; const g = o.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h); return o.toDataURL('image/png'); }

/* ---------- Documents au dossier ---------- */
const DOC_CATS = ['Contravention', 'Arrêt de travail ou billet médical', 'Certificat ou formation', 'Document signé', 'Autre'];
const CLIP = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M14.5 9.5l-5.8 5.8a3.5 3.5 0 01-5-5l6.4-6.4a2.3 2.3 0 013.3 3.3l-6.3 6.3a1.2 1.2 0 01-1.7-1.7l5.6-5.6"/></svg>';
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
function shrinkImage(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onerror = rej; r.onload = () => { const img = new Image(); img.onerror = rej; img.onload = () => { const m = 2000, sc = Math.min(1, m / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => b ? res(b) : rej(new Error('image')), 'image/jpeg', .82); }; img.src = r.result; }; r.readAsDataURL(file); }); }
async function uploadDocs(files, empId, meta) {
  const out = [];
  for (const file of files) {
    const pdf = file.type === 'application/pdf'; if (!pdf && !/^image\//.test(file.type)) throw new Error(`« ${file.name} » : seuls les photos et les PDF sont acceptés.`);
    let blob = file, mime = file.type, name = file.name || 'document';
    if (!pdf) { try { blob = await shrinkImage(file); mime = 'image/jpeg'; name = name.replace(/\.[^.]+$/, '') + '.jpg'; } catch (e) { throw new Error(`« ${file.name} » : cette photo ne peut pas être lue. Essaie une photo JPG ou PNG.`); } }
    if (blob.size > 10 * 1048576) throw new Error(`« ${file.name} » dépasse 10 Mo.`);
    const path = `${empId}/${crypto.randomUUID()}.${pdf ? 'pdf' : 'jpg'}`;
    const { error } = await sb.storage.from('docs').upload(path, blob, { contentType: mime, upsert: false }); if (error) throw error;
    const row = await q(sb.from('employee_docs').insert({ employee_id: empId, path, name, mime, size: blob.size, ...meta }).select('*').single()); out.push(row);
  }
  return out;
}
const docLink = d => `<button class="btn sm" onclick="App.openDoc('${esc(d.path)}')">${CLIP} ${esc(d.name)}</button>`;
function docsTab(e) {
  const docs = st.data.empDocs || [];
  return `<form class="panel stack" onsubmit="App.docUpload(event,'${e.id}')"><h2>Ajouter un document</h2>
  <div class="two"><label>Fichier(s) — photo ou PDF, 10 Mo maximum<input type="file" name="files" multiple required accept="image/*,application/pdf"></label><label>Catégorie<select name="cat">${DOC_CATS.map(c => `<option>${c}</option>`).join('')}</select></label></div>
  <label>Note (facultatif)<input name="note" maxlength="300" placeholder="Ex. contravention du 12 octobre, camion de livraison"></label>
  <p id="dc-err" class="err" hidden></p><div><button class="btn primary">Ajouter au dossier</button></div>
  <p class="small muted">Ces documents sont visibles seulement par la direction. ${esc(e.first_name)} ne les voit pas dans son espace. Pour un billet médical : la loi ne permet pas de l’exiger pour les 3 premières absences de 3 jours ou moins dans une année.</p></form>
  <section class="section"><h2>Documents au dossier</h2>${docs.length ? `<div class="list">${docs.map(d => `<div class="item"><div class="grow"><b>${esc(d.name)}</b><span class="muted small">${esc(d.cat)} · ${fd(d.created_at)} · ${fmtSize(d.size)}${d.uploaded_by === 'employé' ? '' : ' · ajouté par la direction'}${d.note ? ` · « ${esc(d.note)} »` : ''}</span></div><div class="row"><button class="btn sm" onclick="App.openDoc('${esc(d.path)}')">Ouvrir</button><button class="btn sm ghost" onclick="App.docDel('${d.id}')">Supprimer</button></div></div>`).join('')}</div>` : '<div class="list"><p class="empty">Aucun document au dossier.</p></div>'}</section>`;
}

/* ---------- Messages ---------- */
function bubble(m, mine, docs) { const att = (docs || []).filter(d => d.msg_id === m.id); return `<div class="bub ${mine ? 'me' : ''}"><div class="bubtxt">${esc(m.body)}</div>${att.length ? `<div class="row" style="gap:6px;${mine ? 'justify-content:flex-end' : ''}">${att.map(docLink).join('')}</div>` : ''}<span class="small muted">${m.from_admin ? 'La direction' : 'Employé'} · ${fdt(m.created_at)}</span></div>`; }
function threadView(t, msgs, role, docs) {
  const who = role === 'admin' ? fullname(empById(t.employee_id)) || 'Ancien employé' : '';
  return `<div class="stack"><div><span class="pill ${MSG_PILL[t.type]}">${MSG_TYPES[t.type]}</span> ${t.status === 'fermé' ? '<span class="pill p-mute">Fermé</span>' : ''}${role === 'admin' ? `<p class="small muted" style="margin-top:6px">De ${esc(who)} · ${fdt(t.created_at)}</p>` : ''}</div>
  <div class="thread">${msgs.map(m => bubble(m, (role === 'admin') === m.from_admin, docs)).join('')}</div>${role === 'admin' && (docs || []).length ? '<p class="small muted">Les pièces jointes sont aussi classées dans le dossier de l’employé, onglet Documents.</p>' : ''}
  ${t.status === 'fermé' ? `<p class="small muted">Cette conversation est fermée.</p>${role === 'admin' ? `<div><button class="btn sm" onclick="App.msgClose('${t.id}',false)">Rouvrir</button></div>` : ''}` :
    `<form class="stack" onsubmit="App.msgReply(event,'${t.id}')"><label>${role === 'admin' ? 'Ta réponse' : 'Ajouter un message'}<textarea name="text" required maxlength="5000" placeholder="${role === 'admin' ? `Écris ta réponse. ${esc(who.split(' ')[0])} recevra un courriel.` : 'Écris ton message.'}"></textarea></label>${role === 'admin' ? '' : '<label>Joindre une photo ou un PDF (facultatif)<input type="file" name="files" multiple accept="image/*,application/pdf"></label>'}<p id="mr-err" class="err" hidden></p><div class="row"><button class="btn primary">Envoyer</button>${role === 'admin' ? `<button type="button" class="btn ghost" onclick="App.msgClose('${t.id}',true)">Fermer la conversation</button>` : ''}</div></form>`}</div>`;
}
function adminMsgView() {
  const f = st.msgFilter || 'ouverts'; const all = st.data.threads || [];
  const list = all.filter(t => f === 'tous' || (f === 'ouverts' ? t.status !== 'fermé' : t.status === 'fermé')); const unread = all.filter(t => t.unread_admin).length;
  return `<div><p class="eyebrow">Communication</p><h1>Messages</h1></div>
  <div class="tabs" role="tablist">${[['ouverts', 'Ouverts'], ['fermés', 'Fermés'], ['tous', 'Tous']].map(([k, l]) => `<button role="tab" aria-selected="${f === k}" onclick="App.msgTab('${k}')">${l}${k === 'ouverts' && unread ? ` <span class="count">${unread}</span>` : ''}</button>`).join('')}</div>
  ${list.length ? `<div class="list">${list.map(t => `<button class="item msgrow${t.unread_admin ? ' unread' : ''}" onclick="App.msgOpen('${t.id}')"><div class="grow"><b>${t.unread_admin ? '<span class="dot"></span>' : ''}${esc(t.subject)}</b><span class="small muted">${esc(fullname(empById(t.employee_id)) || 'Ancien employé')}</span></div><div class="row"><span class="pill ${MSG_PILL[t.type]}">${MSG_TYPES[t.type]}</span><span class="small muted">${fs(t.last_at)}</span></div></button>`).join('')}</div>` : '<div class="list"><p class="empty">Aucun message.</p></div>'}`;
}
function empMsgView() {
  const ts = st.data.myThreads || [];
  return `<div class="stack" style="gap:6px"><p class="eyebrow">Messages</p><h1>Messages</h1><p class="muted">Une suggestion, une demande spéciale ou quelque chose à dire à la direction? Écris-le ici. Tu recevras un courriel quand on te répond.</p></div>
  <form class="panel stack" onsubmit="App.msgNew(event)"><h2>Nouveau message</h2>
  <div class="two"><label>Type<select name="type">${Object.entries(MSG_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>Sujet<input name="subject" required maxlength="140" placeholder="Ex. Idée pour la vitrine"></label></div>
  <label>Message<textarea name="text" required maxlength="5000"></textarea></label>
  <label>Joindre une photo ou un PDF (facultatif)<input type="file" name="files" multiple accept="image/*,application/pdf"></label><p class="small muted">Par exemple, un billet médical, une contravention ou un certificat de formation. Seule la direction pourra le voir.</p><p id="mn-err" class="err" hidden></p>
  <div><button class="btn primary">Envoyer</button></div></form>
  <section class="section"><h2>Mes conversations</h2>${ts.length ? `<div class="list">${ts.map(t => `<button class="item msgrow${t.unread_emp ? ' unread' : ''}" onclick="App.msgOpen('${t.id}')"><div class="grow"><b>${t.unread_emp ? '<span class="dot"></span>' : ''}${esc(t.subject)}</b><span class="small muted">${MSG_TYPES[t.type]}</span></div><div class="row">${t.status === 'fermé' ? '<span class="pill p-mute">Fermé</span>' : t.unread_emp ? '<span class="pill p-acc">Nouvelle réponse</span>' : ''}<span class="small muted">${fs(t.last_at)}</span></div></button>`).join('')}</div>` : '<div class="list"><p class="empty">Aucune conversation pour le moment.</p></div>'}</section>`;
}

/* ---------- Courriels ---------- */
function mailView() {
  const S = st.data.settings || {}, off = S.mail_off || [], log = st.data.mailLog || [];
  return `<div><p class="eyebrow">Communication</p><h1>Avis par courriel</h1></div>
  <form class="panel stack" onsubmit="App.mailSettings(event)"><h2>Réglages</h2>
  <label style="max-width:520px">Courriel(s) qui reçoivent les avis de la direction<input type="text" name="notify_email" placeholder="Laisse vide : ton courriel de connexion" value="${esc(S.notify_email)}"><span class="small muted" style="font-weight:400">Pour 2 personnes, sépare les adresses par une virgule.</span></label>
  <div class="two">${[['emp', 'Envoyés aux employés'], ['adm', 'Envoyés à toi']].map(([g, t]) => `<div class="stack" style="gap:8px"><span class="eyebrow">${t}</span>${Object.entries(MAIL_KINDS).filter(([, v]) => v[1] === g).map(([k, v]) => `<label class="check"><input type="checkbox" name="k_${k}" ${off.includes(k) ? '' : 'checked'}><span>${v[0]}</span></label>`).join('')}</div>`).join('')}</div>
  <div><button class="btn primary">Enregistrer</button></div></form>
  <section class="section"><h2>Derniers courriels envoyés</h2>${log.length ? `<div class="list">${log.map(m => `<div class="mail" style="cursor:default"><span class="spread"><b>${esc(m.subject)}</b><span class="small muted num">${fdt(m.at)}</span></span><span class="small muted">À : ${esc(m.to_addr)} · ${esc(MAIL_KINDS[m.kind]?.[0] || m.kind)}${m.ok ? '' : ` · <span style="color:var(--crit)">échec de l’envoi</span>`}</span></div>`).join('')}</div>` : '<div class="list"><p class="empty">Aucun courriel envoyé pour le moment.</p></div>'}</section>
  <section class="panel stack"><h2>Ce que contiennent les courriels</h2><ul class="plain"><li>Les courriels disent seulement qu’il y a du nouveau et invitent à se connecter. Ils ne contiennent jamais le texte d’un avertissement, un salaire ou un renseignement confidentiel.</li><li>Ils sont envoyés à l’adresse personnelle inscrite dans la fiche d’embauche, ou à défaut au courriel de connexion.</li><li>Les invitations et les liens de mot de passe sont envoyés séparément par le système de connexion.</li></ul></section>`;
}

/* ---------- Paye et pourboire (étape 3) ---------- */
const TG = ['laval', 'mtl', 'prod'];
const TG_LABEL = { laval: 'Vente Laval', mtl: 'Vente Montréal', prod: 'Production', none: 'Sans pourboire' };
const ORDER = ['laval', 'mtl', 'prod', 'none'];
const toC = v => Math.round((Number(String(v ?? '').replace(',', '.')) || 0) * 100);
const fromC = c => money(c / 100);
const fmtH = h => (Math.round(h * 100) / 100).toLocaleString('fr-CA', { maximumFractionDigits: 2 });
const roundQ = hh => Math.ceil(hh / 25 - 1e-9) * 25;
const CART = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3h2l2 10h9l1.8-7H6"/><circle cx="8" cy="16.5" r="1.2"/><circle cx="14.5" cy="16.5" r="1.2"/></svg>';
const pLabel = p => p.label;
const yearOf = p => Number(p.year) || +String(p.end || p.start).slice(0, 4);
const empP = id => st.pay.emps[id];
const tipGroupOf = e => e.tip_group || defTip(e.magasin);
const capC = () => Math.round((Number(st.pay.cap) || 80) * 100);
function rateAt(eid, date) { const h = (st.pay.rates[eid] || []).filter(s => s.effective <= date); return Number((h.length ? h[h.length - 1] : (st.pay.rates[eid] || [])[0] || { rate: 0 }).rate) || 0; }
const rowH = r => r ? Number(r.h) || 0 : 0;
const rowG = (r, e) => r && r.grp ? r.grp : (e ? tipGroupOf(e) : 'prod');

async function loadPay() {
  const [pp, rows, buys, adj, cat, rates, emps, set, sick] = await Promise.all([
    q(sb.from('pay_periods').select('*').order('start_date')), q(sb.from('pay_rows').select('*')), q(sb.from('pay_buys').select('*').order('created_at')),
    q(sb.from('bank_adj').select('*').order('date')), q(sb.from('buy_catalog').select('*')), q(sb.from('salary_history').select('employee_id,effective,rate').order('effective')),
    q(sb.from('employees').select('id,first_name,last_name,poste,magasin,tip_group,start_date,active').order('last_name')), q(sb.from('app_settings').select('bank_cap,sick_per_year')),
    q(sb.from('sick_days').select('*').order('start_date')),
  ]);
  const hol = await sb.from('holidays').select('*').order('date'); const hols = hol.error ? [] : hol.data;
  const periods = pp.map(p => ({ id: p.id, label: p.label, year: p.year, start: p.start_date, end: p.end_date, pct: Number(p.pct), laval: p.laval ? String(p.laval) : '', mtl: p.mtl ? String(p.mtl) : '', locked: p.locked, rows: {} }));
  const byId = Object.fromEntries(periods.map(p => [p.id, p]));
  rows.forEach(r => { const p = byId[r.period_id]; if (p) p.rows[r.employee_id] = { h: Number(r.hours), grp: r.grp, name: r.name, buys: [], holOv: r.hol_override == null ? null : Number(r.hol_override) }; });
  buys.forEach(b => { const p = byId[b.period_id]; if (!p) return; const r = p.rows[b.employee_id] = p.rows[b.employee_id] || { h: 0, grp: null, name: '', buys: [] }; r.buys.push({ id: b.id, desc: b.item, qty: b.qty, unit: b.unit, unitPrice: b.unit_price, price: b.amount }); });
  const R = {}; rates.forEach(r => (R[r.employee_id] = R[r.employee_id] || []).push(r));
  st.pay = { periods, adj, cat: Object.fromEntries(cat.map(c => [c.slug, c])), rates: R, emps: Object.fromEntries(emps.map(e => [e.id, e])), empList: emps, cap: Number(set[0]?.bank_cap) || 80, quota: set[0]?.sick_per_year ?? 2, sick: sick.map(s => ({ ...s, start: s.start_date, end: s.end_date, days: nDays(s.start_date, s.end_date) })), hols, holOn: !hol.error };
}
function tipPeriods() { return [...st.pay.periods].sort((a, b) => a.start < b.start ? 1 : -1); }
function curTip() { const ps = tipPeriods(); let p = ps.find(x => x.id === st.tipSel); if (!p) { p = ps[0]; st.tipSel = p ? p.id : null; } return p; }
function splitCents(total, weights) {
  const W = weights.reduce((t, w) => t + w.w, 0); if (!W || !total) return { map: Object.fromEntries(weights.map(w => [w.id, 0])), left: W ? 0 : total };
  const raw = weights.map(w => ({ id: w.id, ex: total * w.w / W, name: w.name })); raw.forEach(r => r.fl = Math.floor(r.ex)); let rest = total - raw.reduce((t, r) => t + r.fl, 0);
  [...raw].sort((a, b) => (b.ex - b.fl) - (a.ex - a.fl) || a.name.localeCompare(b.name)).forEach(r => { if (rest > 0) { r.fl++; rest--; } }); return { map: Object.fromEntries(raw.map(r => [r.id, r.fl])), left: 0 };
}
function buyHours(eid, r, p) { if (!r || !r.buys || !r.buys.length) return 0; const rate = rateAt(eid, p.end); if (!rate) return 0; return roundQ(r.buys.reduce((t, x) => t + toC(x.price), 0) / rate); }
// Jours fériés compris dans une paye
const holsIn = p => (st.pay.hols || []).filter(h => h.date >= p.start && h.date <= p.end);
// Banque d'heures et jours fériés : recalculés paye par paye, dans l'ordre chronologique.
// Férié = (heures payées des 2 payes précédentes, max. heures normales chacune) ÷ 20, par jour férié.
// Dans une paye avec férié, les heures normales baissent d'autant (ex. 80 − 8 = 72) : le surplus va en banque.
function bankAll() {
  const cap = capC(); const ps = [...st.pay.periods].sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  const bal = {}, led = {}, by = {}; const adjs = [...st.pay.adj].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const target = a => { if (a.period_id && ps.some(p => p.id === a.period_id)) return a.period_id; const p = ps.find(p => p.end >= a.date) || ps[ps.length - 1]; return p ? p.id : null; };
  const applyAdj = (a, p) => { const v = Math.round((Number(a.hours) || 0) * 100); const before = bal[a.employee_id] || 0; bal[a.employee_id] = Math.max(0, before + v); (led[a.employee_id] = led[a.employee_id] || []).push({ type: 'adj', id: a.id, eid: a.employee_id, date: a.date, label: (a.note || 'Ajustement') + (p ? ` · appliqué à ${pLabel(p)}` : ''), delta: bal[a.employee_id] - before, bal: bal[a.employee_id] }); };
  const pending = adjs.map(a => ({ a, t: target(a) }));
  const active = st.pay.empList.filter(e => e.active).map(e => e.id);
  ps.forEach((p, pi) => {
    pending.filter(x => x.t === p.id).forEach(x => applyAdj(x.a, p)); by[p.id] = {};
    const nh = holsIn(p).length; const prev = ps.slice(Math.max(0, pi - 2), pi);
    const ids = new Set([...Object.keys(p.rows || {}), ...(nh ? active : [])]);
    ids.forEach(eid => {
      const r = (p.rows || {})[eid]; const h = Math.round(rowH(r) * 100); const bh = buyHours(eid, r, p);
      let ferAuto = 0, ferBase = 0;
      if (nh) { ferBase = prev.reduce((t, q2) => { const x = by[q2.id][eid]; return t + (x ? Math.min(x.h - x.dep + x.wd + (x.ferH || 0), cap) : 0); }, 0); ferAuto = Math.round(ferBase * nh / 20); }
      const ferH = nh ? (r && r.holOv != null ? Math.round(r.holOv * 100) : ferAuto) : 0;
      if (h <= 0 && !bh && !ferH) return;
      const capE = Math.max(0, cap - ferH); let b = bal[eid] || 0, dep = 0, wd = 0;
      if (h > capE) dep = h - capE; else if (h > 0 && h < capE && b > 0) wd = Math.min(b, capE - h); b = b + dep - wd; const buyBank = Math.min(b, bh); b -= buyBank; bal[eid] = b;
      by[p.id][eid] = { h, dep, wd, tipH: h - dep + wd, bal: b, buyH: bh, buyBank, buyPay: bh - buyBank, ferH, ferAuto, ferBase, ferOv: !!(r && r.holOv != null), capE };
      if (dep || wd || buyBank) (led[eid] = led[eid] || []).push({ type: 'paye', date: p.start, end: p.end, label: pLabel(p), h, dep, wd, buyBank, bal: b });
    });
  });
  pending.filter(x => !x.t).forEach(x => applyAdj(x.a, null));
  return { by, led, bal };
}
function tipCalc(p, B) {
  B = B || bankAll(); const bk = B.by[p.id] || {}; const L = toC(p.laval), M = toC(p.mtl), pct = (Number(p.pct) || 0) / 100;
  const pools = { laval: Math.round(L * pct), mtl: Math.round(M * pct) }; pools.prod = L + M - pools.laval - pools.mtl;
  const rows = p.rows || {}; const hrs = { laval: 0, mtl: 0, prod: 0 }; const shares = {}; const left = {};
  TG.forEach(g => {
    const ws = Object.entries(rows).filter(([id, r]) => rowH(r) > 0 && rowG(r, empP(id)) === g && !(empP(id) && tipGroupOf(empP(id)) === 'none')).map(([id, r]) => ({ id, w: bk[id] ? bk[id].tipH : Math.round(rowH(r) * 100), name: r.name || '' }));
    hrs[g] = ws.reduce((t, w) => t + w.w, 0) / 100; const sp = splitCents(pools[g], ws); left[g] = sp.left; Object.entries(sp.map).forEach(([id, c]) => { shares[id] = { total: c, grp: g }; });
  });
  const dist = Object.values(shares).reduce((t, x) => t + x.total, 0);
  const worked = Object.values(rows).reduce((t, r) => t + rowH(r), 0);
  const buy = {}; Object.entries(rows).forEach(([id, r]) => { if (!r.buys || !r.buys.length) return; const cents = r.buys.reduce((t, x) => t + toC(x.price), 0); const b = bk[id] || { buyH: 0, buyBank: 0, buyPay: 0 }; buy[id] = { c: cents, h: b.buyH, fromBank: b.buyBank, fromPay: b.buyPay, n: r.buys.length }; });
  return { L, M, pools, hrs, shares, left, dist, total: L + M, bk, worked, buy };
}
function tipRowsList(p) {
  const rows = p.rows || {}; const ids = new Set([...st.pay.empList.filter(e => e.active).map(e => e.id), ...Object.keys(rows).filter(id => rowH(rows[id]) > 0 || (rows[id].buys || []).length)]);
  return [...ids].map(id => { const e = empP(id); const r = rows[id]; const h = rowH(r); return { id, e, name: e ? fullname(e) : ((r && r.name) || 'Ancien employé'), grp: r && h > 0 ? rowG(r, e) : (e ? (tipGroupOf(e) === 'none' ? 'none' : tipGroupOf(e)) : 'prod'), h }; })
    .filter(x => !st.tipHide || x.h > 0).sort((a, b) => ORDER.indexOf(a.grp) - ORDER.indexOf(b.grp) || a.name.localeCompare(b.name));
}
function shareCell(id, c) { const sh = c.shares[id], b = c.bk[id]; if (!sh || !sh.total) return '<span class="muted">—</span>'; return fromC(sh.total) + (b && b.tipH !== b.h ? `<br><span class="small muted" style="font-weight:400">sur ${fmtH(b.tipH / 100)} h</span>` : ''); }
const payTotal = c => Object.values(c.bk).reduce((t, b) => t + b.h - b.dep + b.wd - (b.buyPay || 0), 0) / 100;
function payCell(id, c) {
  const p = curTip(); const sk = p ? sickTag(p, id) : '';
  const b = c.bk[id]; if (!b) return sk || '<span class="muted">—</span>'; const pay = b.h - b.dep + b.wd - (b.buyPay || 0);
  const parts = []; if (b.dep) parts.push(`${fmtH(b.h / 100)} − ${fmtH(b.dep / 100)} en banque`); else if (b.wd) parts.push(`${fmtH(b.h / 100)} + ${fmtH(b.wd / 100)} de la banque`); if (b.buyPay) parts.push(`− ${fmtH(b.buyPay / 100)} achat`); if (b.buyBank) parts.push('achat pris en banque');
  return `<span class="payh">${fmtH(pay / 100)} h</span>${parts.length ? `<br><span class="small muted" style="font-weight:400">${parts.join(' · ')}</span>` : ''}${sk}`;
}
function bankCell(id, c) {
  const b = c.bk[id]; if (!b) return '<span class="muted">—</span>';
  const out = (b.wd || 0) + (b.buyBank || 0); const mv = (b.dep ? `<span class="check-ok">+${fmtH(b.dep / 100)} h</span>` : '') + (out ? `${b.dep ? ' ' : ''}<span style="color:var(--warn);font-weight:700">−${fmtH(out / 100)} h</span>${b.buyBank ? `<span class="small muted" style="display:block">dont ${fmtH(b.buyBank / 100)} h achat</span>` : ''}` : '');
  return b.bal || mv ? `<button class="banklink" onclick="App.bankView('${id}')" title="Voir l’historique de la banque">${mv}${mv ? '<br>' : ''}<span class="small muted">Solde ${fmtH(b.bal / 100)} h</span></button>` : '<span class="muted">—</span>';
}
// Notes de maladie payée sur la feuille de paye (selon la date de l'absence)
function sickNotes(p, eid) {
  return st.pay.sick.filter(x => x.employee_id === eid && x.start <= p.end && x.end >= p.start).map(x => x.ind ? `Maladie payée ${range(x.start, x.end)} : ${x.ind.paid} j × ${fromC(x.ind.per)} = <b>${fromC(x.ind.total)}</b>` : `Absence maladie ${range(x.start, x.end)} · indemnité à calculer`);
}
function sickShort(p, eid) {
  const l = st.pay.sick.filter(x => x.employee_id === eid && x.start <= p.end && x.end >= p.start); if (!l.length) return '';
  const tot = l.reduce((t, x) => t + (x.ind ? x.ind.total : 0), 0); const todo = l.some(x => !x.ind);
  const rate = rateAt(eid, p.end); const hh = rate ? fmtH(tot / 100 / rate) + ' h · ' : '';
  return tot ? `Maladie = ${hh}${fromC(tot)}${todo ? ' + à calculer' : ''}` : 'Maladie à calculer';
}
const sickTag = (p, eid) => { const t = sickShort(p, eid); return t ? `<span class="small" style="display:block;color:var(--accent-text);font-weight:700">${t}</span>` : ''; };
const ferAmt = (id, p, b) => Math.round(b.ferH / 100 * rateAt(id, p.end) * 100);
const ferTotal = (c, p) => Object.entries(c.bk).reduce((t, [id, b]) => ({ h: t.h + (b.ferH || 0), m: t.m + (b.ferH ? ferAmt(id, p, b) : 0) }), { h: 0, m: 0 });
function ferCell(id, c, p) {
  const b = c.bk[id] || { ferH: 0, ferOv: (p.rows[id] || {}).holOv != null }; const lk = p.locked;
  const inner = b.ferH ? `<span style="white-space:nowrap"><span class="payh" style="font-size:1.15rem">${fmtH(b.ferH / 100)} h</span> · <b>${fromC(ferAmt(id, p, b))}</b></span>${b.ferOv ? '<br><span class="small muted" style="font-weight:400">ajusté</span>' : ''}` : `<span class="muted">${b.ferOv ? '0 h · ajusté' : '—'}</span>`;
  return lk ? inner : `<button class="banklink" onclick="App.holEdit('${id}')" title="Ajuster les heures de férié">${inner}</button>`;
}
function holSection() {
  if (!st.pay.holOn) return `<section class="panel stack"><h2>Jours fériés</h2><p class="small">Pour activer les jours fériés, colle le script <b>07-feries.sql</b> dans Supabase (SQL Editor → Run).</p></section>`;
  const y = thisYear(); const list = (st.pay.hols || []).filter(h => h.date >= `${y}-01-01` && h.date <= `${y + 1}-12-31`);
  const missing = [y, y + 1].filter(yy => !(st.pay.hols || []).some(h => h.date.startsWith(String(yy))));
  return `<section class="panel stack"><div class="spread"><h2>Jours fériés</h2><div class="row">${missing.map(yy => `<button class="btn sm" onclick="App.holQc(${yy})">Ajouter les jours fériés du Québec ${yy}</button>`).join('')}</div></div>
  ${list.length ? `<div class="list">${list.map(h => `<div class="item"><div class="grow"><b>${esc(h.name)}</b><span class="muted small">${new Date(h.date + 'T12:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div><button class="btn sm ghost" onclick="App.holDel('${h.id}')">Retirer</button></div>`).join('')}</div>` : '<div class="list"><p class="empty">Aucun jour férié inscrit.</p></div>'}
  <form class="row" onsubmit="App.holAdd(event)" style="align-items:flex-end"><label>Date<input type="date" name="date" required></label><label style="flex:1;min-width:200px">Nom<input name="name" required placeholder="Ex. Lundi de Pâques"></label><button class="btn sm">Ajouter</button></form>
  <p class="small muted">Pour chaque jour férié compris dans une paye : férié = heures payées des 2 payes précédentes (${fmtH(capC() / 100)} h maximum chacune) ÷ 20, payé au taux horaire. Les heures normales de cette paye baissent d’autant : par exemple, 80 h travaillées avec un férié de 8 h donnent 72 h payées, 8 h en banque et 8 h de férié. Clique sur la case Férié d’un employé pour l’ajuster (par exemple, absence injustifiée la veille ou le lendemain).</p></section>`;
}
function tipsView() {
  const ps = tipPeriods(), p = curTip();
  const head = `<div class="spread noprint"><div><p class="eyebrow">Administration</p><h1>Paye et pourboire</h1></div><div class="row">${ps.length ? `<select aria-label="Choisir la paye" onchange="App.tipPick(this.value)" style="width:auto">${[...new Set(ps.map(yearOf))].sort((a, b) => b - a).map(y => `<optgroup label="Payes ${y}">${ps.filter(x => yearOf(x) === y).map(x => `<option value="${x.id}" ${p && x.id === p.id ? 'selected' : ''}>${esc(pLabel(x))} · ${fs(x.start)} au ${fd(x.end)}</option>`).join('')}</optgroup>`).join('')}</select>` : ''}<button class="btn primary" onclick="App.tipNewForm()">Nouvelle paye</button></div></div>`;
  if (!p) return head + `<div class="list"><p class="empty">Aucune paye pour le moment. Clique sur « Nouvelle paye » pour commencer.</p></div>`;
  const B = bankAll(), c = tipCalc(p, B), lk = !!p.locked, dis = lk ? 'disabled' : ''; const list = tipRowsList(p); let lastG = '';
  const hs = holsIn(p), nh = hs.length; const ft = ferTotal(c, p);
  if (st.tipPrint) return printSheet(p, c, list);
  const rowsHtml = list.map(x => {
    let g = ''; if (x.grp !== lastG) { lastG = x.grp; g = `<tr class="grp"><td colspan="${nh ? 6 : 5}">${TG_LABEL[x.grp]}${x.grp !== 'none' ? ` <span id="gh-${x.grp}" style="font-weight:600;letter-spacing:0;text-transform:none">· ${fmtH(c.hrs[x.grp])} h de pourboire</span>` : ''}</td></tr>`; }
    const bu = c.buy[x.id];
    return g + `<tr><td><span class="nm">${esc(x.name)}</span> <button class="buy${bu ? ' has' : ''}" onclick="App.buyForm('${x.id}')" aria-label="Achats de ${esc(x.name)}" title="Achat de marchandise">${CART}${bu ? `<span>−${fmtH(bu.h / 100)} h</span>` : ''}</button></td><td class="r"><input type="number" inputmode="decimal" min="0" step="0.25" id="h-${x.id}" aria-label="Heures de ${esc(x.name)}" value="${x.h || ''}" placeholder="0" ${dis} oninput="App.tipH('${x.id}',this.value)"></td><td class="r" id="bk-${x.id}">${bankCell(x.id, c)}</td><td class="r" id="pay-${x.id}">${payCell(x.id, c)}</td>${nh ? `<td class="r" id="fe-${x.id}">${ferCell(x.id, c, p)}</td>` : ''}<td class="r share" id="tp-${x.id}">${shareCell(x.id, c)}</td></tr>`;
  }).join('');
  return head + `
  <section class="panel stack"><div class="spread"><div><span class="eyebrow">Période de paye</span><h2>${esc(pLabel(p))}</h2></div><div class="row"><span id="tp-save" class="small muted"></span>${lk ? '<span class="pill p-mute">Verrouillée</span>' : ''}<button class="btn sm" onclick="App.tipLock()">${lk ? 'Déverrouiller' : 'Verrouiller la paye'}</button><button class="btn sm" onclick="App.tipCopy()">Copier le tableau</button><button class="btn sm" onclick="App.tipPrintView(true)">Feuille à imprimer</button>${lk ? '' : `<button class="btn sm ghost crit" onclick="App.tipDelAsk()">Supprimer</button>`}</div></div>
  <div class="tipin" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))"><label>Nom de la paye<input value="${esc(pLabel(p))}" ${dis} onchange="App.tipField('label',this.value)"></label><label>Année de paye<input type="number" min="2000" max="2100" value="${yearOf(p)}" ${dis} onchange="App.tipField('year',this.value)"></label><label>Du<input type="date" value="${p.start}" ${dis} onchange="App.tipField('start',this.value)"></label><label>Au<input type="date" value="${p.end}" ${dis} onchange="App.tipField('end',this.value)"></label><label>Part de la vente (%)<input type="number" min="0" max="100" step="1" id="tp-pct" value="${p.pct}" ${dis} oninput="App.tipAmt('pct',this.value)"></label></div>
  <div class="tipin" style="grid-template-columns:1fr 1fr"><label>Pourboires reçus à Laval<div class="money"><input type="number" inputmode="decimal" min="0" step="0.01" id="tp-laval" value="${p.laval || ''}" placeholder="0,00" ${dis} oninput="App.tipAmt('laval',this.value)"><span>$</span></div></label><label>Pourboires reçus à Montréal<div class="money"><input type="number" inputmode="decimal" min="0" step="0.01" id="tp-mtl" value="${p.mtl || ''}" placeholder="0,00" ${dis} oninput="App.tipAmt('mtl',this.value)"><span>$</span></div></label></div>
  <div class="pools">${['laval', 'mtl', 'prod'].map(g => `<div class="pool ${g === 'prod' ? 'prod' : ''}"><span>${TG_LABEL[g]} · <span id="pl-${g}-d">${g === 'prod' ? `${100 - p.pct} % de Laval + ${100 - p.pct} % de Montréal` : `${p.pct} % de ${g === 'laval' ? 'Laval' : 'Montréal'}`}</span></span><b id="pl-${g}">${fromC(c.pools[g])}</b><span id="pl-${g}-h">${fmtH(c.hrs[g])} h · ${c.hrs[g] ? money(c.pools[g] / 100 / c.hrs[g]) + ' / h' : 'aucune heure'}</span></div>`).join('')}</div>
  ${nh ? `<div class="banner acc"><div><b>Jour${nh > 1 ? 's' : ''} férié${nh > 1 ? 's' : ''} dans cette paye : ${hs.map(h => `${esc(h.name)} (${fs(h.date)})`).join(', ')}.</b><br><span class="small">Le férié de chacun = heures payées des 2 payes précédentes ÷ 20. Ses heures normales baissent d’autant : par exemple, 80 h travaillées = 72 h payées, 8 h en banque et 8 h de férié.</span></div></div>` : ''}</section>
  <section class="section"><div class="spread"><h2>Heures et pourboire par employé</h2><label class="check" style="font-weight:400"><input type="checkbox" ${st.tipHide ? 'checked' : ''} onchange="App.tipHideEmpty(this.checked)"><span>Masquer les employés sans heures</span></label></div>
  <div class="tablewrap"><table class="tips"><thead><tr><th>Employé</th><th class="r">Heures travaillées</th><th class="r">Banque</th><th class="r">Heures à payer</th>${nh ? '<th class="r">Férié</th>' : ''}<th class="r">Pourboire</th></tr></thead><tbody>${rowsHtml}</tbody>
  <tfoot><tr><td>Total</td><td class="r" id="tt-all">${fmtH(c.worked)} h</td><td></td><td class="r" id="tt-pay">${fmtH(payTotal(c))} h</td>${nh ? `<td class="r" style="white-space:nowrap">${fmtH(ft.h / 100)} h · ${fromC(ft.m)}</td>` : ''}<td class="r" id="tt-dist">${fromC(c.dist)}</td></tr></tfoot></table></div>
  <p id="tp-check">${tipCheck(c)}</p></section>
  ${holSection()}
  <section class="section"><h2>Historique des payes</h2>${tipHistory(B)}</section>
  <section class="panel stack"><h2>Comment le calcul fonctionne</h2><ul class="plain"><li>La vente de Laval se partage ${p.pct} % des pourboires de Laval, et la vente de Montréal ${p.pct} % des pourboires de Montréal. La production se partage les ${100 - p.pct} % restants des deux magasins.</li><li>Chaque employé reçoit une part proportionnelle à ses heures, dans le groupe de pourboire choisi dans son profil. Les employés réglés sur « Aucun pourboire » sont dans le groupe Sans pourboire.</li><li>L’icône de panier à côté du nom sert à inscrire un achat de marchandise. Le montant est converti en heures selon le taux horaire de l’employé, arrondi au quart d’heure supérieur, puis pris d’abord dans sa banque d’heures; le reste est retiré des heures à payer. Le pourboire reste calculé sur les heures travaillées.</li><li>Au-delà de ${fmtH(capC() / 100)} heures dans une paye, les heures en trop vont dans la banque, sans pourboire. Sous ${fmtH(capC() / 100)} heures, la banque complète automatiquement jusqu’à ${fmtH(capC() / 100)} heures, et ces heures reçoivent du pourboire.</li><li>Les montants sont arrondis au cent près, et le total versé égale exactement le total reçu.</li><li>Chaque changement est enregistré automatiquement. Verrouille la paye une fois entrée dans ton logiciel de paye : plus rien ne pourra la modifier.</li></ul>
  <form class="row" onsubmit="App.bankCap(event)" style="align-items:flex-end"><label style="max-width:260px">Heures normales par paye<input type="number" min="1" max="200" step="0.5" name="cap" value="${String(capC() / 100)}"></label><button class="btn sm">Enregistrer</button></form></section>`;
}
function printSheet(p, c, list) {
  const hs = holsIn(p), nh = hs.length, ft = ferTotal(c, p);
  const rows = list.filter(x => x.h > 0 || (c.bk[x.id] && c.bk[x.id].ferH) || sickNotes(p, x.id).length); let lastG = '';
  return `<div class="row noprint" style="justify-content:space-between"><button class="btn" onclick="App.tipPrintView(false)">← Retour au tableau</button><button class="btn primary" onclick="window.print()">Imprimer</button></div>
  <article class="printsheet"><div class="ph"><div><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase">Marius &amp; Fanny · Paye et pourboire</div><h2>${esc(pLabel(p))}</h2></div><div style="text-align:right;font-size:12px">${fd(p.start)} au ${fd(p.end)}<br>Laval ${fromC(c.L)} · Montréal ${fromC(c.M)} · <b>Total ${fromC(c.total)}</b>${nh ? `<br>Férié : ${hs.map(h => `${esc(h.name)} (${fs(h.date)})`).join(', ')}` : ''}</div></div>
  <table><thead><tr><th>Employé</th><th class="r">Travaillées</th><th class="r">Banque</th><th class="r">Heures à payer</th>${nh ? '<th class="r">Férié</th>' : ''}<th class="r">Pourboire</th><th class="r">Entré</th></tr></thead><tbody>
  ${rows.map(x => { const b = c.bk[x.id] || { h: 0, dep: 0, wd: 0, bal: 0 }; const sh = c.shares[x.id]; let g = ''; if (x.grp !== lastG) { lastG = x.grp; g = `<tr class="g"><td colspan="${nh ? 7 : 6}">${TG_LABEL[x.grp]}</td></tr>`; }
    const sn = sickShort(p, x.id);
    return g + `<tr><td>${esc(x.name)}</td><td class="r">${fmtH(x.h)} h</td><td class="r">${b.dep ? '+' + fmtH(b.dep / 100) : ''}${(b.wd || 0) + (b.buyBank || 0) ? ' −' + fmtH(((b.wd || 0) + (b.buyBank || 0)) / 100) : ''}${b.bal ? ` <span style="color:#666">(solde ${fmtH(b.bal / 100)})</span>` : ''}</td><td class="big">${fmtH((b.h - b.dep + b.wd - (b.buyPay || 0)) / 100)} h${b.buyH ? `<span style="font:400 9px var(--body);color:#555;display:block">achat ${fmtH(b.buyH / 100)} h${b.buyBank ? ` (${fmtH(b.buyBank / 100)} en banque)` : ''}</span>` : ''}${sn ? `<span style="font:700 10px var(--body);color:#111;display:block">${sn}</span>` : ''}</td>${nh ? `<td class="r" style="white-space:nowrap">${b.ferH ? `${fmtH(b.ferH / 100)} h · ${fromC(ferAmt(x.id, p, b))}` : '—'}</td>` : ''}<td class="r">${sh && sh.total ? fromC(sh.total) : '—'}</td><td class="r"><span class="box"></span></td></tr>`; }).join('')}
  </tbody><tfoot><tr><td>Total</td><td class="r">${fmtH(c.worked)} h</td><td></td><td class="r" style="font-size:15px">${fmtH(payTotal(c))} h</td>${nh ? `<td class="r" style="white-space:nowrap">${fmtH(ft.h / 100)} h · ${fromC(ft.m)}</td>` : ''}<td class="r">${fromC(c.dist)}</td><td></td></tr></tfoot></table>
  <div class="foot"><span>Vérifié par : ____________________</span><span>Date : ______________</span></div></article>`;
}
function tipCheck(c) {
  if (!c.total) return '<span class="small muted">Entre les montants de pourboire des deux magasins pour lancer le calcul.</span>';
  const miss = TG.filter(g => c.left[g] > 0); if (miss.length) return `<span class="check-bad">${miss.map(g => `${fromC(c.left[g])} ne sont pas répartis : personne ne reçoit de pourboire en ${TG_LABEL[g]}.`).join(' ')}</span>`;
  return c.dist === c.total ? `<span class="check-ok">✓ Total versé ${fromC(c.dist)} = total reçu ${fromC(c.total)} (Laval ${fromC(c.L)} + Montréal ${fromC(c.M)})</span>` : `<span class="check-bad">Écart : ${fromC(c.total - c.dist)}</span>`;
}
function tipHistory(B) {
  const all = tipPeriods(); if (!all.length) return ''; B = B || bankAll();
  const years = [...new Set(all.map(yearOf))].sort((a, b) => b - a); const cur = curTip(); const y = st.tipYear && years.includes(st.tipYear) ? st.tipYear : (cur ? yearOf(cur) : years[0]);
  const ps = all.filter(p => yearOf(p) === y).sort((a, b) => a.start < b.start ? -1 : 1);
  const tot = ps.reduce((t, p) => { const c = tipCalc(p, B); t.m += c.total; t.h += c.worked; return t; }, { m: 0, h: 0 });
  return `<div class="tabs" role="tablist" style="margin-bottom:12px">${years.map(yy => `<button role="tab" aria-selected="${yy === y}" onclick="App.tipYearTab(${yy})">Payes ${yy}</button>`).join('')}</div>
  <p class="small muted" style="margin-bottom:8px">${ps.length} paye${ps.length > 1 ? 's' : ''} en ${y} · ${fromC(tot.m)} de pourboires · ${fmtH(tot.h)} h travaillées</p>
  <div class="tablewrap"><table class="resp"><thead><tr><th>Paye</th><th>Période</th><th class="r">Laval</th><th class="r">Montréal</th><th class="r">Total</th><th class="r">Heures</th><th></th></tr></thead><tbody>${ps.map(p => { const c = tipCalc(p, B);
    return `<tr class="click" tabindex="0" onclick="App.tipPick('${p.id}')" onkeydown="if(event.key==='Enter')App.tipPick('${p.id}')"><td data-label="Paye"><b>${esc(pLabel(p))}</b></td><td data-label="Période">${fs(p.start)} au ${fd(p.end)}</td><td class="r num" data-label="Laval">${fromC(c.L)}</td><td class="r num" data-label="Montréal">${fromC(c.M)}</td><td class="r num" data-label="Total"><b>${fromC(c.total)}</b></td><td class="r num" data-label="Heures">${fmtH(c.worked)} h</td><td data-label=" ">${p.locked ? '<span class="pill p-mute">Verrouillée</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function tipsRefresh() {
  const p = curTip(); if (!p) return; const c = tipCalc(p);
  TG.forEach(g => { const el = $('#pl-' + g); if (el) el.textContent = fromC(c.pools[g]); const h = $('#pl-' + g + '-h'); if (h) h.textContent = `${fmtH(c.hrs[g])} h · ${c.hrs[g] ? money(c.pools[g] / 100 / c.hrs[g]) + ' / h' : 'aucune heure'}`;
    const d = $('#pl-' + g + '-d'); if (d) d.textContent = g === 'prod' ? `${100 - p.pct} % de Laval + ${100 - p.pct} % de Montréal` : `${p.pct} % de ${g === 'laval' ? 'Laval' : 'Montréal'}`; const gh = $('#gh-' + g); if (gh) gh.textContent = '· ' + fmtH(c.hrs[g]) + ' h de pourboire'; });
  document.querySelectorAll('td.share[id^="tp-"]').forEach(td => { const id = td.id.slice(3); td.innerHTML = shareCell(id, c); const bk = $('#bk-' + id); if (bk) bk.innerHTML = bankCell(id, c); const py = $('#pay-' + id); if (py) py.innerHTML = payCell(id, c); const fe = $('#fe-' + id); if (fe) fe.innerHTML = ferCell(id, c, p); });
  const tp = $('#tt-pay'); if (tp) tp.textContent = fmtH(payTotal(c)) + ' h';
  const ta = $('#tt-all'); if (ta) ta.textContent = fmtH(c.worked) + ' h'; const dt = $('#tt-dist'); if (dt) dt.textContent = fromC(c.dist); const ck = $('#tp-check'); if (ck) ck.innerHTML = tipCheck(c);
}
function empTips(e) {
  const B = bankAll(); const ps = tipPeriods().filter(p => p.rows && rowH(p.rows[e.id]) > 0);
  const tips = ps.length ? `<section class="section"><h2>Pourboires</h2><div class="tablewrap"><table class="resp"><thead><tr><th>Paye</th><th>Période</th><th class="r">Heures travaillées</th><th class="r">Pourboire</th></tr></thead><tbody>${ps.map(p => { const c = tipCalc(p, B), h = rowH(p.rows[e.id]), sh = c.shares[e.id];
    return `<tr><td data-label="Paye">${esc(pLabel(p))}</td><td data-label="Période">${fs(p.start)} au ${fd(p.end)}</td><td class="r num" data-label="Heures travaillées">${fmtH(h)} h</td><td class="r num" data-label="Pourboire"><b>${sh && sh.total ? fromC(sh.total) : '—'}</b></td></tr>`; }).join('')}</tbody></table></div></section>` : '';
  return tips + bankAdmin(e, B);
}
function bankRows(led) {
  return [...led].reverse().map(x => `<tr><td data-label="Date">${x.type === 'paye' ? `<b>${esc(x.label)}</b><br><span class="small muted">${fs(x.date)} au ${fd(x.end)}</span>` : `Ajustement du ${fd(x.date)}<br><span class="small muted">${esc(x.label)}</span> <button class="btn ghost sm" onclick="App.bankAdjDel('${x.id}')">Retirer</button>`}</td><td class="r num" data-label="Heures travaillées">${x.type === 'paye' ? fmtH(x.h / 100) + ' h' : '—'}</td><td class="r num" data-label="Ajoutées">${x.type === 'paye' ? (x.dep ? `<span class="check-ok">+${fmtH(x.dep / 100)} h</span>` : '—') : (x.delta > 0 ? `<span class="check-ok">+${fmtH(x.delta / 100)} h</span>` : '—')}</td><td class="r num" data-label="Utilisées">${x.type === 'paye' ? ((x.wd || x.buyBank) ? `−${fmtH(((x.wd || 0) + (x.buyBank || 0)) / 100)} h${x.buyBank ? `<br><span class="small muted">dont ${fmtH(x.buyBank / 100)} h achat</span>` : ''}` : '—') : (x.delta < 0 ? `−${fmtH(-x.delta / 100)} h` : '—')}</td><td class="r num" data-label="Solde"><b>${fmtH(x.bal / 100)} h</b></td></tr>`).join('');
}
function bankAdmin(e, B) {
  const led = B.led[e.id] || [], bal = B.bal[e.id] || 0;
  return `<section class="panel stack"><div class="spread"><div><h2>Banque d’heures</h2><p class="small muted">Heures au-delà de ${fmtH(capC() / 100)} h par paye, sans pourboire. Visible seulement par l’administration.</p></div><div class="row"><span class="big" style="font-size:1.8rem">${fmtH(bal / 100)} h</span><button class="btn sm" onclick="App.bankAdjForm('${e.id}')">Ajuster le solde</button></div></div>
  ${led.length ? `<div class="tablewrap"><table class="resp"><thead><tr><th>Paye ou ajustement</th><th class="r">Heures travaillées</th><th class="r">Ajoutées</th><th class="r">Utilisées</th><th class="r">Solde</th></tr></thead><tbody>${bankRows(led)}</tbody></table></div>` : '<p class="small muted">Aucun mouvement dans la banque.</p>'}</section>`;
}

/* ---------- Jours de maladie payés (administration seulement) ---------- */
const thisYear = () => new Date().getFullYear();
const quota = () => Number(st.pay.quota) || 0;
function eligibleFrom(e) { const d = new Date(e.start_date + 'T12:00'); d.setMonth(d.getMonth() + 3); return iso(d); }
const sickOf = e => st.pay.sick.filter(x => x.employee_id === e.id);
function sickYear(e, y) { return sickOf(e).filter(x => x.start.slice(0, 4) === String(y)).sort((a, b) => a.start < b.start ? -1 : 1); }
function sickAlloc(e, y) { let left = quota(); const el = eligibleFrom(e); const m = {}; sickYear(e, y).forEach(x => { const p = x.start >= el ? Math.min(left, x.days) : 0; left -= p; m[x.id] = { paid: p, unpaid: x.days - p }; }); return m; }
function sickStats(e, y) { y = y || thisYear(); const ys = sickYear(e, y), al = sickAlloc(e, y); const used = ys.reduce((t, x) => t + x.days, 0), paid = ys.reduce((t, x) => t + al[x.id].paid, 0); return { used, paid, left: Math.max(0, quota() - paid), unpaid: used - paid }; }
function dayBoxes(s) { return `<div class="daybox" role="img" aria-label="${s.paid} sur ${quota()} jours utilisés">${[...Array(quota())].map((_, i) => `<i class="${i < s.paid ? 'used' : ''}"></i>`).join('')}</div>`; }
function lastTwoPays(e) {
  const B = bankAll(); const ps = [...st.pay.periods].sort((a, b) => a.start < b.start ? 1 : -1).filter(p => B.by[p.id] && B.by[p.id][e.id]).slice(0, 2).reverse(); if (ps.length < 2) return null;
  return ps.map(p => { const b = B.by[p.id][e.id]; const h = Math.min(b.h - b.dep + b.wd + (b.ferH || 0), capC()); return Math.round(h / 100 * rateAt(e.id, p.end) * 100); });
}
function sickItems(e) {
  const al = sickAlloc(e, thisYear()); const list = [...sickOf(e)].sort((a, b) => a.start < b.start ? 1 : -1);
  if (!list.length) return `<div class="list"><p class="empty">Aucune absence maladie.</p></div>`;
  return `<div class="list">${list.map(x => { const a = al[x.id]; return `<div class="item"><div class="grow"><b>${range(x.start, x.end)}</b><span class="muted small">${x.days} jour${x.days > 1 ? 's' : ''}${a ? (a.unpaid ? ` · <span style="color:var(--warn)">${a.unpaid} non rémunéré${a.unpaid > 1 ? 's' : ''}</span>` : ' · rémunéré') : ''}${x.note ? ` · « ${esc(x.note)} »` : ''}</span>${x.ind ? `<span class="small" style="color:var(--accent-text)">À verser : ${x.ind.paid} × ${fromC(x.ind.per)} = <b>${fromC(x.ind.total)}</b></span>` : ''}</div><div class="row"><button class="btn sm" onclick="App.sickForm('${e.id}','${x.id}')">${x.ind ? 'Indemnité' : 'Calculer l’indemnité'}</button><button class="btn sm ghost" onclick="App.sickDel('${x.id}')">Retirer</button></div></div>`; }).join('')}</div>`;
}
function sickHeader(e) {
  const s = sickStats(e), el = eligibleFrom(e);
  return `<div class="sickhead">${dayBoxes(s)}<div class="stack" style="gap:2px"><span><b class="num" style="font-size:1.2rem">${s.left}</b> jour${s.left > 1 ? 's' : ''} rémunéré${s.left > 1 ? 's' : ''} restant${s.left > 1 ? 's' : ''} sur ${quota()}</span><span class="small muted">Année ${thisYear()} · remis à zéro le 1<sup>er</sup> janvier${s.unpaid ? ` · ${s.unpaid} jour${s.unpaid > 1 ? 's' : ''} non rémunéré${s.unpaid > 1 ? 's' : ''}` : ''}</span>${el > TODAY ? `<span class="small" style="color:var(--warn)">Les jours rémunérés commencent après 3 mois de service, soit le ${fd(el)}.</span>` : ''}</div></div>`;
}
function adminSickPanel(e) { return `<section class="panel stack"><div class="spread"><h2>Congés maladie</h2><button class="btn" onclick="App.sickForm('${e.id}')">Inscrire une absence</button></div>${sickHeader(e)}${sickItems(e)}</section>`; }
function sickAdminSection() {
  const y = thisYear(), act = st.pay.empList.filter(x => x.active);
  return `<section class="section"><div class="spread"><h2>Congés maladie ${y}</h2><form class="row" onsubmit="App.sickQuota(event)"><label class="row" style="font-weight:400">Jours rémunérés par année<input type="number" min="0" max="10" name="q" value="${quota()}" style="width:72px"></label><button class="btn sm">Enregistrer</button></form></div>
  <div class="tablewrap"><table class="resp"><thead><tr><th>Employé</th><th class="r">Jours pris</th><th class="r">Rémunérés restants</th><th class="r">Non rémunérés</th></tr></thead><tbody>${act.map(e => { const s = sickStats(e, y); return `<tr class="click" tabindex="0" onclick="App.openEmp('${e.id}','conges')" onkeydown="if(event.key==='Enter')App.openEmp('${e.id}','conges')"><td data-label="Employé"><b>${esc(fullname(e))}</b></td><td class="r num" data-label="Jours pris">${s.used}</td><td class="r num" data-label="Rémunérés restants">${s.left === 0 ? '<span class="pill p-crit">0</span>' : s.left}</td><td class="r num" data-label="Non rémunérés">${s.unpaid || '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>
  <p class="small muted">Tu inscris toi-même les absences maladie : les employés ne les voient pas. La Loi sur les normes du travail prévoit jusqu’à 10 jours d’absence par année pour maladie ou obligations familiales, dont les 2 premiers sont rémunérés après 3 mois de service continu.</p></section>`;
}

/* ---------- Coffre chiffré (étape 4) ---------- */
const SECURE_KINDS = {
  nas: { label: 'Numéro d’assurance sociale', why: 'Obligatoire pour produire tes relevés fiscaux (T4 et Relevé 1).' },
  cheque: { label: 'Spécimen de chèque', why: 'Sert uniquement à déposer ta paie dans ton compte bancaire.' },
  permis: { label: 'Permis de conduire', why: 'Requis pour ton poste de livraison, afin de confirmer que ton permis est valide.' },
};
const LOCK_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.4"/></svg>';
const needsPermis = e => /livr/.test(slug(e.poste)) || !!e.needs_permis;
const kindsFor = e => ['nas', 'cheque', ...(needsPermis(e) ? ['permis'] : [])];
const KDF_ITER = 600000, MIN_CODE = 12;
const V = { key: null, timer: null, until: 0, fails: 0, blocked: 0 };
function b64(buf) { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(code, salt, iter) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
async function wrapPriv(privBytes, code) { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const k = await deriveKey(code, salt, KDF_ITER); const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, privBytes); return { enc_priv: b64(enc), salt: b64(salt), iv: b64(iv), iter: KDF_ITER }; }
async function unwrapPriv(vk, code) { const k = await deriveKey(code, ub64(vk.salt), vk.iter); return crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(vk.iv) }, k, ub64(vk.enc_priv)); }
async function sealItem(pubB64, obj) {
  const pub = await crypto.subtle.importKey('spki', ub64(pubB64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']); const raw = await crypto.subtle.exportKey('raw', aes);
  const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify(obj)));
  const wk = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw); return { wk: b64(wk), iv: b64(iv), ct: b64(ct) };
}
async function openItem(it) {
  const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, V.key, ub64(it.wk)); const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(it.iv) }, aes, ub64(it.ct)); return JSON.parse(new TextDecoder().decode(pt));
}
function lockVault(silent) { V.key = null; clearTimeout(V.timer); V.until = 0; if (!silent) { closeModal(); render(); } }
function armVault() { V.until = Date.now() + 5 * 60e3; clearTimeout(V.timer); V.timer = setTimeout(() => { lockVault(); toast('Coffre verrouillé automatiquement.'); }, 5 * 60e3); }
async function logVault(action, e, kind) { try { await q(sb.from('vault_log').insert({ action, employee_id: e ? e.id : null, emp_name: e ? fullname(e) : '', kind: kind ? SECURE_KINDS[kind].label : '' })); if (st.view.page === 'vault' && st.data.vlog) { st.data.vlog = await q(sb.from('vault_log').select('*').order('at', { ascending: false }).limit(2000)); const keep = $('#vu-err') && !$('#vu-err').hidden ? $('#vu-err').textContent : null; render(); if (keep) { const el = $('#vu-err'); if (el) { el.textContent = keep; el.hidden = false; } } } } catch (x) { console.warn(x); } }
function luhn(d) { let t = 0; for (let i = 0; i < d.length; i++) { let n = +d[i]; if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } t += n; } return t % 10 === 0; }
const fmtNas = d => d.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
function resizeImage(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onerror = () => rej(new Error('lecture')); r.onload = () => { const img = new Image(); img.onerror = () => rej(new Error('image')); img.onload = () => { const m = 1400, sc = Math.min(1, m / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .72)); }; img.src = r.result; }; r.readAsDataURL(file); }); }
function secureCell(e, items, k) { const it = items.find(x => x.employee_id === e.id && x.kind === k); if (!kindsFor(e).includes(k) && !it) return '<span class="muted">—</span>'; return it ? `<span class="pill p-ok">Reçu le ${fs(it.created_at)}</span>` : '<span class="pill p-warn">Manquant</span>'; }
function unlockForm(next) { return `<form class="panel stack" onsubmit="App.vaultUnlock(event,'${next || ''}')"><div class="row" style="align-items:flex-end"><span class="lockico">${LOCK_ICON}</span><label style="flex:1;min-width:200px">Code du coffre<input type="password" name="code" required autocomplete="current-password"></label><button class="btn primary">Déverrouiller</button></div><p id="vu-err" class="err" hidden></p></form>`; }
function vaultHow() { return `<section class="panel stack"><h2>Comment c’est protégé</h2><ul class="plain"><li>Le document est chiffré sur l’appareil de l’employé, avant même d’être envoyé.</li><li>Seul ton code permet de le déchiffrer. Même l’hébergeur, ou quelqu’un qui volerait la base de données, ne verrait que du texte illisible.</li><li>Le coffre se verrouille après 5 minutes et à la déconnexion. Après 5 codes erronés, il se bloque une minute.</li><li>Chaque dépôt, consultation et destruction est inscrit au journal des accès. Les entrées de plus de 2 ans s’effacent automatiquement.</li></ul></section>`; }
function vaultLogSection() {
  const all = st.data.vlog || []; const f = st.logFilter || (st.logFilter = { emp: '', action: '', n: 20 });
  const emps = [...new Set(all.map(l => l.emp_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)); const acts = [...new Set(all.map(l => l.action))].sort();
  const list = all.filter(l => (!f.emp || l.emp_name === f.emp) && (!f.action || l.action === f.action)); const shown = list.slice(0, f.n);
  return `<section class="section"><div class="spread"><h2>Journal des accès</h2><div class="row"><select aria-label="Filtrer par employé" onchange="App.logFilter('emp',this.value)" style="width:auto"><option value="">Tous les employés</option>${emps.map(n => `<option ${f.emp === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><select aria-label="Filtrer par action" onchange="App.logFilter('action',this.value)" style="width:auto"><option value="">Toutes les actions</option>${acts.map(a => `<option ${f.action === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div></div>
  ${shown.length ? `<div class="tablewrap"><table class="resp"><thead><tr><th>Date</th><th>Action</th><th>Employé</th><th>Document</th></tr></thead><tbody>${shown.map(l => `<tr><td class="num" data-label="Date">${fdt(l.at)}</td><td data-label="Action">${esc(l.action)}</td><td data-label="Employé">${esc(l.emp_name)}</td><td data-label="Document">${esc(l.kind)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="list"><p class="empty">${all.length ? 'Aucune entrée ne correspond à ces filtres.' : 'Aucune activité pour le moment.'}</p></div>`}
  <div class="spread"><span class="small muted num">${shown.length} sur ${list.length} entrée${list.length > 1 ? 's' : ''} · les entrées de plus de 2 ans s’effacent automatiquement</span>${list.length > shown.length ? `<button class="btn sm" onclick="App.logMore()">Voir plus</button>` : ''}</div></section>`;
}
function vaultView() {
  const head = `<div><p class="eyebrow">Employés</p><h1>Coffre sécurisé</h1></div>`;
  if (!st.data.vkey) return head + `<section class="panel stack" style="max-width:600px"><h2>Crée le code du coffre</h2><p>Ce code est différent de ton mot de passe. Tu en auras besoin chaque fois que tu voudras consulter un NAS, un spécimen de chèque ou un permis.</p>
  <form class="stack" onsubmit="App.vaultSetup(event)"><label>Code du coffre (12 caractères ou plus)<input type="password" name="code" minlength="12" required autocomplete="new-password"></label><label>Confirmer le code<input type="password" name="code2" minlength="12" required autocomplete="new-password"></label>
  <div class="banner crit small"><div><b>Ce code ne peut pas être récupéré.</b> Si tu l’oublies, les documents du coffre seront perdus et les employés devront les envoyer de nouveau. Garde-le dans un gestionnaire de mots de passe ou sur papier, en lieu sûr.</div></div>
  <p class="small muted">Astuce : une phrase comme « croissant-violet-marche-vers-laval » est plus sûre et plus facile à retenir qu’un mot de passe compliqué.</p>
  <p id="vs-err" class="err" hidden></p><div><button class="btn primary">Activer le coffre</button></div></form></section>${vaultHow()}`;
  const act = (st.data.emps || []).filter(e => e.active); const items = st.data.secMeta || [];
  const done = act.filter(e => kindsFor(e).every(k => items.some(x => x.employee_id === e.id && x.kind === k))).length;
  const bar = V.key ? `<div class="banner acc"><div class="row"><span class="lockico">${LOCK_ICON}</span><div><b>Coffre ouvert</b><br><span class="small">Verrouillage automatique à ${new Date(V.until).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}</span></div></div><button class="btn" onclick="App.vaultLock()">Verrouiller maintenant</button></div>` : unlockForm('');
  return head + bar + `<section class="section"><div class="spread"><h2>Documents reçus</h2><span class="num"><b>${done}</b> sur ${act.length} dossiers complets</span></div>
  <div class="tablewrap"><table><thead><tr><th>Employé</th><th>NAS</th><th>Spécimen de chèque</th><th>Permis</th><th></th></tr></thead><tbody>${act.map(e => `<tr><td><b>${esc(fullname(e))}</b><br><span class="muted small">${esc(e.poste)}</span></td><td>${secureCell(e, items, 'nas')}</td><td>${secureCell(e, items, 'cheque')}</td><td>${secureCell(e, items, 'permis')}</td><td class="r">${items.some(x => x.employee_id === e.id) ? `<button class="btn sm" onclick="App.vaultOpen('${e.id}')">Consulter</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
  <p class="small muted">L’état des dépôts est visible sans code. Le contenu, lui, exige le code.</p></section>
  ${vaultLogSection()}
  <details class="panel"><summary>Changer le code du coffre</summary><form class="stack" style="max-width:420px" onsubmit="App.vaultChange(event)"><label>Code actuel<input type="password" name="old" required autocomplete="current-password"></label><label>Nouveau code<input type="password" name="nw" minlength="12" required autocomplete="new-password"></label><label>Confirmer le nouveau code<input type="password" name="cf" minlength="12" required autocomplete="new-password"></label><p id="vc-err" class="err" hidden></p><div><button class="btn primary">Changer le code</button></div></form></details>
  ${vaultHow()}`;
}
function adminSecureTab(e) {
  if (!st.data.vaultOn) return `<div class="list"><div class="item"><div class="grow"><b>Le coffre sécurisé n’est pas encore activé.</b><span class="muted small">Crée ton code pour que les employés puissent envoyer leur NAS, leur spécimen de chèque et leur permis.</span></div><button class="btn primary" onclick="App.go('vault')">Activer le coffre</button></div></div>`;
  const items = st.data.empSec || []; const kinds = [...new Set([...kindsFor(e), ...items.map(x => x.kind)])];
  return `<div class="list">${kinds.map(k => `<div class="item"><div class="grow"><b>${SECURE_KINDS[k].label}</b></div>${secureCell(e, items, k)}</div>`).join('')}</div>
  <div class="row">${items.length ? `<button class="btn primary" onclick="App.vaultOpen('${e.id}')">${LOCK_ICON} Consulter avec le code</button>` : ''}${/livr/.test(slug(e.poste)) ? '' : `<button class="btn" onclick="App.togglePermis('${e.id}')">${e.needs_permis ? 'Ne plus demander le permis de conduire' : 'Demander aussi le permis de conduire'}</button>`}</div>
  <p class="small muted">${esc(e.first_name)} envoie ces documents depuis son espace, section « Confidentiel ».</p>`;
}
function mySecure() {
  const e = st.me; const head = `<div class="stack" style="gap:6px"><p class="eyebrow">Mon dossier</p><h1>Renseignements confidentiels</h1></div>`;
  if (!st.data.vpub) return head + `<div class="list"><p class="empty">Cette section n’est pas encore activée. La direction t’avisera quand tu pourras y envoyer tes documents.</p></div>`;
  const status = st.data.mySec || [];
  return head + `<section class="panel stack"><div class="row"><span class="lockico">${LOCK_ICON}</span><h2>Comment tes renseignements sont protégés</h2></div><ul class="plain">
  <li><b>Chiffrés sur ton appareil</b>, avant même d’être envoyés.</li>
  <li><b>Une seule personne peut les lire :</b> la direction, avec un code qu’elle seule connaît. Chaque consultation est inscrite dans un journal.</li>
  <li><b>Utilisés seulement pour la raison indiquée</b> sous chaque document, puis détruits quand ils ne sont plus nécessaires.</li>
  <li>Tu peux demander à les consulter, à les corriger ou à les faire retirer en t’adressant à la personne responsable de la protection des renseignements personnels de l’entreprise.</li></ul>
  <p class="small muted">Une fois envoyé, un document ne s’affiche plus ici, même pour toi. Tu peux le remplacer en tout temps.</p></section>
  ${kindsFor(e).map(k => {
    const it = status.find(x => x.kind === k), K = SECURE_KINDS[k], showForm = !it || st.secRep === k;
    const field = k === 'nas' ? `<label>Ton numéro d’assurance sociale<input name="v" inputmode="numeric" autocomplete="off" required placeholder="000 000 000" maxlength="11"></label>`
      : `<label>Prends une photo ou choisis un fichier<input type="file" name="f" accept="image/*" required onchange="App.previewPhoto(this,'pv-${k}')"></label><img id="pv-${k}" class="secimg" hidden alt="Aperçu de la photo" style="max-width:280px">`;
    return `<article class="panel stack"><div class="spread"><div><h3>${K.label}</h3><p class="small muted">${K.why}</p></div>${it ? `<span class="pill p-ok">Envoyé le ${fd(it.created_at)}</span>` : '<span class="pill p-warn">À fournir</span>'}</div>
    ${showForm ? `<form class="stack" onsubmit="App.secureSend(event,'${k}')">${field}<label class="check"><input type="checkbox" name="ok" required><span>J’accepte que ce renseignement soit utilisé pour la raison indiquée ci-dessus.</span></label><p id="err-${k}" class="err" hidden></p><div class="row"><button class="btn primary">${LOCK_ICON} Envoyer de façon sécurisée</button>${it ? `<button type="button" class="btn ghost" onclick="App.secRep(null)">Annuler</button>` : ''}</div></form>` : `<div><button class="btn sm" onclick="App.secRep('${k}')">Remplacer</button></div>`}</article>`;
  }).join('')}`;
}

/* ---------- Accidents de travail ---------- */
const ACC_ST = { 'à traiter': ['p-warn', 'À compléter'], 'complété': ['p-ok', 'Complété'] };
const PLACES = ['Laval', 'Montréal', 'Production', 'Livraison', 'Autre'];
function accTypeLabel(a) { return a.kind === 'incident' ? 'Incident sans blessure' : a.kind === 'premiers' ? 'Premiers soins seulement' : a.off_days > 0 ? 'Accident avec arrêt de travail' : 'Accident sans arrêt de travail'; }
function accColor(a) { return a.kind === 'incident' ? 'var(--muted)' : a.off_days > 0 ? 'var(--crit)' : 'var(--warn)'; }
function accRows(list, empty) {
  if (!list.length) return `<div class="list"><p class="empty">${empty || 'Aucun.'}</p></div>`;
  return `<div class="list">${list.map(a => `<div class="item"><div class="grow"><b><span class="sev" style="background:${accColor(a)}"></span>${esc(fullname(empById(a.employee_id)) || 'Ancien employé')} · ${fd(a.date)}${a.time ? ` à ${esc(a.time)}` : ''}</b><span class="small">${esc(accTypeLabel(a))}${a.injury ? ` · ${esc(a.injury)}` : ''}</span><span class="muted small">${esc(a.place)}${a.declared_by === 'employé' ? ' · déclaré par l’employé' : ''}</span></div><div class="row">${a.cnesst ? '<span class="pill p-mute">CNESST avisée</span>' : ''}<span class="pill ${ACC_ST[a.status][0]}">${ACC_ST[a.status][1]}</span><button class="btn sm" onclick="App.accForm('${a.id}')">Ouvrir</button></div></div>`).join('')}</div>`;
}
function accView() {
  const y = thisYear(), list = st.data.accs || [], ys = list.filter(a => a.date.startsWith(String(y)));
  const lost = ys.reduce((t, a) => t + (Number(a.off_days) || 0), 0), last = list.find(a => a.kind !== 'incident');
  const since = last ? Math.round((new Date(TODAY) - new Date(last.date)) / 864e5) : null; const open = list.filter(a => a.status === 'à traiter');
  return `<div class="spread"><div><p class="eyebrow">Santé et sécurité</p><h1>Accidents de travail</h1></div><button class="btn primary" onclick="App.accForm()">Inscrire un accident</button></div>
  <div class="tiles"><div class="tile" style="cursor:default"><b>${ys.length}</b><span>événements inscrits en ${y}</span></div><div class="tile" style="cursor:default"><b>${lost}</b><span>jours de travail perdus en ${y}</span></div><div class="tile" style="cursor:default"><b>${since === null ? '—' : since}</b><span>jours depuis le dernier accident</span></div></div>
  ${open.length ? `<section class="section"><h2>À compléter</h2>${accRows(open)}</section>` : ''}
  <section class="section"><h2>Registre</h2>${accRows(list.filter(a => a.status !== 'à traiter'), 'Aucun accident inscrit.')}</section>
  <section class="panel stack"><h2>Rappels</h2><ul class="plain"><li>Inscris au registre tout accident, incident ou premiers soins donnés, même sans gravité. La CNESST exige un registre des premiers soins et premiers secours.</li><li>Si l’employé ne peut pas terminer sa journée ou doit s’absenter, tu lui paies la journée de l’accident au complet. Pour une absence plus longue, informe-toi auprès de la CNESST de la marche à suivre et des formulaires à remplir.</li><li>Ce registre contient des renseignements de santé : seule la direction y a accès.</li></ul></section>`;
}
function myAcc() {
  const e = st.me; const list = st.data.myAccs || [];
  return `<div class="stack" style="gap:6px"><p class="eyebrow">Messages</p><h1>Déclarer un accident</h1><p class="muted">Tu t’es blessé(e) au travail, même légèrement? Avise d’abord ton superviseur, puis déclare-le ici. Ça protège tes droits si la blessure s’aggrave plus tard.</p></div>
  <form class="panel stack" onsubmit="App.accDeclare(event)"><h2>Déclarer un accident</h2><div class="two"><label>Date<input type="date" name="date" required max="${TODAY}" value="${TODAY}"></label><label>Heure approximative<input type="time" name="time"></label>
  <label>Lieu<select name="place">${PLACES.map(m => `<option ${e.magasin === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label>Partie du corps touchée<input name="injury" placeholder="Ex. main gauche, dos"></label></div>
  <label>Que s’est-il passé?<textarea name="desc" required placeholder="Décris ce que tu faisais et comment c’est arrivé."></textarea></label>
  <div class="two"><label>Témoins (facultatif)<input name="witness"></label><label>As-tu reçu des premiers soins?<select name="aid"><option value="">Non</option><option>Oui, sur place</option><option>Oui, à la clinique ou à l’hôpital</option></select></label></div>
  <p id="ad-err" class="err" hidden></p><div><button class="btn primary">Envoyer la déclaration</button></div></form>
  <section class="section"><h2>Mes déclarations</h2>${list.length ? `<div class="list">${list.map(a => `<div class="item"><div class="grow"><b>${fd(a.date)} · ${esc(a.place)}</b><span class="muted small">${esc(a.injury || accTypeLabel(a))}</span></div><span class="pill ${a.status === 'à traiter' ? 'p-warn' : 'p-ok'}">${a.status === 'à traiter' ? 'Reçue' : 'Traitée'}</span></div>`).join('')}</div>` : '<div class="list"><p class="empty">Aucune déclaration.</p></div>'}</section>`;
}

/* ---------- Clés ---------- */
const KEY_ICON = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="6.5" cy="10" r="3.5"/><path d="M10 10h8M15 10v3M17.5 10v2"/></svg>';
function keysCard(e) {
  const ks = st.data.empKeys || []; const held = ks.filter(k => !k.returned), back = ks.filter(k => k.returned).sort((a, b) => a.returned < b.returned ? 1 : -1);
  return `<section class="panel stack"><div class="spread"><div class="row"><span class="lockico">${KEY_ICON}</span><h2>Clés et accès</h2></div><div class="row">${held.length ? `<span class="pill p-warn">${held.length} clé${held.length > 1 ? 's' : ''} en sa possession</span>` : '<span class="pill p-mute">Aucune clé en sa possession</span>'}<button class="btn sm" onclick="App.keyForm('${e.id}')">Inscrire une clé remise</button></div></div>
  ${held.length ? `<div class="list">${held.map(k => `<div class="item"><div class="grow"><b>${esc(k.descr)}${k.number ? ` <span class="muted" style="font-weight:400">· n° ${esc(k.number)}</span>` : ''}</b><span class="muted small">Remise le ${fd(k.given)}</span></div><button class="btn sm" onclick="App.keyReturn('${k.id}')">Marquer comme rendue</button></div>`).join('')}</div>` : ''}
  ${back.length ? `<details><summary class="small muted" style="cursor:pointer">Clés rendues (${back.length})</summary><div class="list" style="margin-top:8px">${back.map(k => `<div class="item"><div class="grow"><span>${esc(k.descr)}${k.number ? ` · n° ${esc(k.number)}` : ''}</span><span class="muted small">Remise le ${fd(k.given)} · rendue le ${fd(k.returned)}</span></div></div>`).join('')}</div></details>` : ''}</section>`;
}

/* ---------- Anniversaires de service ---------- */
const MILESTONES = [1, 2, 3, 5, 10, 15, 20, 25, 30];
function anniversaries(back, ahead) {
  const t = new Date(TODAY + 'T12:00'); const out = []; const recs = st.data.recogs || [];
  (st.data.emps || []).filter(e => e.active).forEach(e => { const s = new Date(e.start_date + 'T12:00'); [t.getFullYear() - 1, t.getFullYear(), t.getFullYear() + 1].forEach(y => { const d = new Date(y, s.getMonth(), s.getDate(), 12); const yrs = y - s.getFullYear(); const diff = Math.round((d - t) / 864e5); if (yrs >= 1 && diff >= -back && diff <= ahead) out.push({ e, yrs, date: iso(d), diff, done: recs.some(r => r.employee_id === e.id && r.years === yrs) }); }); });
  return out.sort((a, b) => a.diff - b.diff);
}
function annivSection() {
  const list = anniversaries(30, 60); if (!list.length) return '';
  return `<section class="section"><h2>Anniversaires de service</h2><div class="list">${list.map(a => `<div class="item"><div class="milestone">${a.yrs}<small>an${a.yrs > 1 ? 's' : ''}</small></div><div class="grow"><b>${esc(fullname(a.e))}</b><span class="muted small">${a.diff === 0 ? 'Aujourd’hui' : a.diff > 0 ? `Le ${fd(a.date)}, dans ${a.diff} jour${a.diff > 1 ? 's' : ''}` : `Le ${fd(a.date)}, il y a ${-a.diff} jour${a.diff < -1 ? 's' : ''}`}${MILESTONES.includes(a.yrs) && a.yrs >= 3 ? ' · étape importante' : ''}</span></div>${a.done ? '<span class="pill p-ok">Souligné</span>' : `<button class="btn sm${a.diff <= 7 ? ' primary' : ''}" onclick="App.recogForm('${a.e.id}',${a.yrs},'${a.date}')">Souligner</button>`}</div>`).join('')}</div></section>`;
}
function myRecog() {
  const r = (st.data.myRecogs || []).filter(x => (new Date(TODAY) - new Date(x.date)) / 864e5 <= 30 && x.date <= TODAY).sort((a, b) => a.date < b.date ? 1 : -1)[0]; if (!r) return '';
  return `<section class="recog"><span class="sym sym-citrons" aria-hidden="true"></span><div class="yrs">${r.years}<span style="font-size:1rem;display:block">an${r.years > 1 ? 's' : ''}</span></div><div class="stack" style="gap:6px;flex:1;min-width:200px"><span class="eyebrow">Anniversaire de service · ${fd(r.date)}</span><p style="white-space:pre-wrap">${esc(r.msg)}</p>${r.gift ? `<span class="small muted">Petite attention : ${esc(r.gift)}</span>` : ''}</div></section>`;
}

/* ---------- Formation ---------- */
const LOCK_SM = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.4"/></svg>';
function trainMods() { const T = st.data.train || { mods: [], les: [] }; return T.mods.map(m => ({ ...m, lessons: T.les.filter(l => l.module_id === m.id).sort((a, b) => a.position - b.position) })).sort((a, b) => a.position - b.position); }
function trainFor(e) { const t = teamOf(e); return trainMods().filter(m => m.aud === 'all' || m.aud === t); }
const trainFlat = e => trainFor(e).flatMap(m => m.lessons.map(l => ({ m, l })));
const doneMap = eid => Object.fromEntries((st.data.train?.done || []).filter(d => d.employee_id === eid).map(d => [d.lesson_id, d.done_at]));
function trainProg(e) { const f = trainFlat(e), dm = doneMap(e.id); const d = f.filter(x => dm[x.l.id]).length; return { d, t: f.length, pct: f.length ? Math.round(d / f.length * 100) : 0 }; }
function trainUnlocked(e, lid, dm) { const f = trainFlat(e); const i = f.findIndex(x => x.l.id === lid); if (i < 0) return false; return f.slice(0, i).every(x => dm[x.l.id]); }
function empTrainView() {
  const e = st.me; const mods = trainFor(e); if (!mods.length) return `<div><p class="eyebrow">Formation</p><h1>Formation</h1></div><div class="list"><p class="empty">Aucune formation pour le moment.</p></div>`;
  const dm = doneMap(e.id); const p = trainProg(e); const flat = trainFlat(e); if (!flat.length) return `<div><p class="eyebrow">Formation</p><h1>Formation</h1></div><div class="list"><p class="empty">Aucune section pour le moment.</p></div>`;
  let cur = flat.find(x => x.l.id === st.trainCur && trainUnlocked(e, x.l.id, dm)); if (!cur) cur = flat.find(x => !dm[x.l.id]) || flat[flat.length - 1];
  const idx = flat.findIndex(x => x.l.id === cur.l.id); const done = !!dm[cur.l.id]; const nxt = flat[idx + 1];
  const plan = mods.map(m => `<div class="tmod"><b>${esc(m.title)}</b>${m.lessons.map(l => { const ok = dm[l.id], un = trainUnlocked(e, l.id, dm); return `<button class="tles${l.id === cur.l.id ? ' cur' : ''}" ${un ? `onclick="App.trainGo('${l.id}')"` : 'disabled'} aria-current="${l.id === cur.l.id}"><span class="tico ${ok ? 'ok' : ''}">${ok ? '✓' : un ? '' : LOCK_SM}</span><span>${esc(l.title)}</span></button>`; }).join('')}</div>`).join('');
  return `<div class="stack" style="gap:6px"><p class="eyebrow">Formation</p><h1>Formation</h1><p class="muted">Lis chaque section attentivement, puis confirme que tu l’as comprise pour passer à la suivante.</p></div>
  <section class="panel stack"><div class="spread"><b>${p.d === p.t ? 'Formation terminée. Bravo!' : `${p.d} sur ${p.t} sections complétées`}</b><span class="num small">${p.pct} %</span></div><div class="prog"><div class="bar"><i style="width:${p.pct}%"></i></div></div></section>
  <div class="trainwrap"><aside class="panel tplan"><details ${isMob() ? '' : 'open'}><summary><b>Plan de la formation</b></summary><div class="stack" style="gap:12px;margin-top:10px">${plan}</div></details></aside>
  <article class="panel stack tles-body"><span class="eyebrow">${esc(cur.m.title)} · section ${idx + 1} sur ${flat.length}</span><h2>${esc(cur.l.title)}</h2><div class="hb-text" style="padding:0;max-width:68ch">${hbRender(cur.l.body)}</div>
  <div class="tconfirm">${done ? `<span class="check-ok">✓ Lu et compris le ${fd(dm[cur.l.id])}</span>` : `<label class="check" style="font-weight:600"><input type="checkbox" onchange="document.getElementById('tr-next').disabled=!this.checked"><span>J’ai lu et compris cette section</span></label>`}
  <div class="row">${done ? (nxt ? `<button class="btn primary" onclick="App.trainGo('${nxt.l.id}')">Section suivante →</button>` : '') : `<button class="btn primary" id="tr-next" disabled onclick="App.trainDone('${cur.l.id}')">${nxt ? 'Confirmer et continuer →' : 'Confirmer et terminer'}</button>`}</div></div></article></div>`;
}
function adminTrainView() {
  const mods = trainMods(); const act = (st.data.emps || []).filter(e => e.active);
  const audPill = a => `<span class="pill ${a === 'vente' ? 'p-acc' : a === 'prod' ? 'p-warn' : 'p-mute'}" style="vertical-align:middle">${a === 'vente' ? 'Vente' : a === 'prod' ? 'Production' : 'Tous'}</span>`;
  return `<div class="spread"><div><p class="eyebrow">Employés</p><h1>Formation</h1></div><button class="btn primary" onclick="App.trainModForm()">Nouveau module</button></div>
  <section class="section"><h2>Modules</h2>${mods.length ? mods.map((m, i) => `<section class="panel stack"><div class="spread"><div><h3 style="font-size:1.25rem">${esc(m.title)} ${audPill(m.aud)}</h3><span class="small muted">${m.lessons.length} section${m.lessons.length > 1 ? 's' : ''}</span></div><div class="row" style="gap:4px"><button class="btn ghost sm" onclick="App.trainModMove(${i},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button class="btn ghost sm" onclick="App.trainModMove(${i},1)" ${i === mods.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button><button class="btn sm" onclick="App.trainModForm('${m.id}')">Modifier le module</button></div></div>
    <div class="checklist">${m.lessons.map((l, j) => `<div class="ck" style="align-items:center"><span class="milestone" style="font-size:1rem;min-width:24px">${j + 1}</span><div class="grow"><b>${esc(l.title)}</b><span class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.body.replace(/\s+/g, ' ').slice(0, 100))}</span></div><div class="row" style="gap:4px"><button class="btn ghost sm" onclick="App.trainLesMove('${m.id}',${j},-1)" ${j === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button class="btn ghost sm" onclick="App.trainLesMove('${m.id}',${j},1)" ${j === m.lessons.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button><button class="btn sm" onclick="App.trainLesForm('${m.id}','${l.id}')">Modifier</button></div></div>`).join('')}</div>
    <div><button class="btn sm" onclick="App.trainLesForm('${m.id}')">Ajouter une section</button></div></section>`).join('') : '<div class="list"><p class="empty">Aucun module. Crée ton premier module de formation.</p></div>'}</section>
  <section class="section"><h2>Suivi des employés</h2><div class="tablewrap"><table class="resp"><thead><tr><th>Employé</th><th>Progression</th><th class="r">Sections</th><th>Dernière section complétée</th></tr></thead><tbody>${act.filter(e => trainFor(e).length).sort((a, b) => trainProg(a).pct - trainProg(b).pct || a.last_name.localeCompare(b.last_name)).map(e => { const p = trainProg(e); const last = Object.entries(doneMap(e.id)).sort((a, b) => a[1] < b[1] ? 1 : -1)[0]; const ll = last ? trainFlat(e).find(x => x.l.id === last[0]) : null;
    return `<tr><td data-label="Employé"><b>${esc(fullname(e))}</b><br><span class="small muted">${esc(e.magasin)}</span></td><td data-label="Progression" style="min-width:160px"><div class="prog"><div class="bar"><i style="width:${p.pct}%"></i></div><span class="small num">${p.pct} %</span></div></td><td class="r num" data-label="Sections">${p.d}/${p.t}</td><td data-label="Dernière">${ll ? `${esc(ll.l.title)}<br><span class="small muted">${fd(last[1])}</span>` : '<span class="muted">Pas commencée</span>'}</td></tr>`; }).join('')}</tbody></table></div></section>`;
}

/* ---------- Auto-évaluation ---------- */
const RATE_LBL = ['', 'À améliorer', 'Parfois', 'Correct', 'Très bien', 'Excellent'];
const EV_ST = { 'à remplir': ['p-warn', 'À remplir'], brouillon: ['p-acc', 'Commencée'], remise: ['p-ok', 'Remise'] };
const evPill = s => `<span class="pill ${EV_ST[s][0]}">${EV_ST[s][1]}</span>`;
function evalAvg(v) { const vals = Object.values(v.answers.r || {}).map(Number).filter(Boolean); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null; }
function evalForm(v) {
  const qq = v.tpl, a = v.answers;
  return `<form class="stack" id="ev-form" onsubmit="App.evalSubmit(event,'${v.id}')">
  <section class="panel stack"><h2>Comment évalues-tu ton travail?</h2><p class="small muted">1 = à améliorer · 5 = excellent</p>
  ${qq.ratings.map((t, i) => `<fieldset class="rate"><legend>${esc(t)}</legend><div class="rates">${[1, 2, 3, 4, 5].map(n => `<label class="rbtn"><input type="radio" name="r${i}" value="${n}" ${Number(a.r[i]) === n ? 'checked' : ''}><span>${n}</span><small>${RATE_LBL[n]}</small></label>`).join('')}</div></fieldset>`).join('')}</section>
  <section class="panel stack"><h2>En tes mots</h2>${qq.open.map((t, i) => `<label>${esc(t)}<textarea name="o${i}" maxlength="3000">${esc(a.o[i] || '')}</textarea></label>`).join('')}</section>
  <p id="ev-err" class="err" hidden></p><div class="row"><button type="button" class="btn" onclick="App.evalDraft('${v.id}')">Enregistrer le brouillon</button><button class="btn primary">Remettre à la direction</button></div><p class="small muted">Une fois remise, ton auto-évaluation ne peut plus être modifiée.</p></form>`;
}
function evalAnswers(v) {
  const qq = v.tpl, a = v.answers; const avg = evalAvg(v);
  return `<div class="stack"><div class="spread"><span class="muted">${v.submitted_at ? `Remise le ${fdt(v.submitted_at)}` : 'Pas encore remise'}</span>${avg ? `<span>Moyenne : <b class="payh" style="font-size:1.4rem">${avg.toFixed(1).replace('.', ',')}</b> / 5</span>` : ''}</div>
  <div class="list">${qq.ratings.map((t, i) => `<div class="item"><div class="grow"><span>${esc(t)}</span></div><span class="dots" aria-label="${a.r[i] || 0} sur 5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= Number(a.r[i] || 0) ? 'on' : ''}"></i>`).join('')}</span><b class="num" style="min-width:24px;text-align:right">${a.r[i] || '—'}</b></div>`).join('')}</div>
  ${qq.open.map((t, i) => `<div class="stack" style="gap:4px"><b>${esc(t)}</b><p style="white-space:pre-wrap">${a.o[i] ? esc(a.o[i]) : '<span class="muted">Aucune réponse</span>'}</p></div>`).join('')}</div>`;
}
function adminEvalView() {
  const all = st.data.evals || []; const years = [...new Set(all.map(v => v.year))].sort((a, b) => b - a); const cy = thisYear();
  const y = st.evalYear && years.includes(st.evalYear) ? st.evalYear : (years.includes(cy) ? cy : (years[0] || cy));
  const o = { 'à remplir': 0, brouillon: 1, remise: 2 };
  const list = all.filter(v => v.year === y).sort((a, b) => o[a.status] - o[b.status] || fullname(empById(a.employee_id)).localeCompare(fullname(empById(b.employee_id))));
  const done = list.filter(v => v.status === 'remise').length; const pct = list.length ? Math.round(done / list.length * 100) : 0;
  const missing = (st.data.emps || []).filter(e => e.active && !list.some(v => v.employee_id === e.id)); const hasThisYear = years.includes(cy); const due = list.find(v => v.due)?.due;
  return `<div class="spread"><div><p class="eyebrow">Employés</p><h1>Auto-évaluations</h1></div><div class="row"><button class="btn" onclick="App.evalTplForm()">Modifier les questions</button>${hasThisYear ? '' : `<button class="btn primary" onclick="App.evalLaunchForm()">Lancer l’auto-évaluation ${cy}</button>`}</div></div>
  ${years.length > 1 ? `<div class="tabs" role="tablist">${years.map(yy => `<button role="tab" aria-selected="${yy === y}" onclick="App.evalYearTab(${yy})">${yy}</button>`).join('')}</div>` : ''}
  ${!list.length ? `<section class="panel stack"><h2>Auto-évaluation annuelle ${cy}</h2><p>Une fois par année, tous les employés actifs reçoivent leur auto-évaluation en même temps, par courriel et sur leur page d’accueil. Tu peux ensuite lire chaque réponse avant de décider des augmentations.</p><div><button class="btn primary" onclick="App.evalLaunchForm()">Lancer l’auto-évaluation ${cy}</button></div></section>` : `
  <section class="panel stack"><div class="spread"><div><h2>Auto-évaluation ${y}</h2><p class="small muted">Envoyée le ${fd(list[0].sent)}${due ? ` · à remettre avant le ${fd(due)}` : ''}</p></div><span class="num"><b>${done}</b> sur ${list.length} remises</span></div>
  <div class="prog"><div class="bar"><i style="width:${pct}%"></i></div><span class="small num">${pct} %</span></div>
  <div class="row">${list.length - done ? `<button class="btn sm" onclick="App.evalRemindAll(${y})">Envoyer un rappel aux ${list.length - done} retardataire${list.length - done > 1 ? 's' : ''}</button>` : ''}${y === cy && missing.length ? `<button class="btn sm" onclick="App.evalAddForm()">Ajouter un employé (${missing.length} sans auto-évaluation)</button>` : ''}</div></section>
  <section class="section"><h2>Employés</h2><div class="tablewrap"><table class="resp"><thead><tr><th>Employé</th><th>Statut</th><th>Remise le</th><th class="r">Moyenne</th><th></th></tr></thead><tbody>${list.map(v => { const e = empById(v.employee_id); const avg = evalAvg(v); return `<tr><td data-label="Employé"><b>${esc(e ? fullname(e) : 'Ancien employé')}</b>${e ? `<br><span class="small muted">${esc(e.poste)}</span>` : ''}</td><td data-label="Statut">${evPill(v.status)}${v.status === 'remise' && !v.seen ? ' <span class="pill p-acc">Nouveau</span>' : ''}</td><td data-label="Remise le">${v.submitted_at ? fd(v.submitted_at) : '—'}</td><td class="r num" data-label="Moyenne">${v.status === 'remise' && avg ? avg.toFixed(1).replace('.', ',') : '—'}</td><td class="r" data-label=" ">${v.status === 'remise' ? `<button class="btn sm" onclick="App.evalOpen('${v.id}')">Lire</button>` : `<button class="btn sm ghost" onclick="App.evalRemind('${v.id}')">Rappel</button>`}</td></tr>`; }).join('')}</tbody></table></div></section>`}`;
}
function empEvalView() {
  const mine = st.data.myEvals || []; const open = mine.find(v => v.status !== 'remise'); const done = mine.filter(v => v.status === 'remise');
  return `<div class="stack" style="gap:6px"><p class="eyebrow">Mon dossier</p><h1>Auto-évaluation</h1><p class="muted">Prends le temps de réfléchir à ton travail depuis ta dernière évaluation. Tes réponses aident la direction à préparer ta révision salariale. Sois honnête : il n’y a pas de mauvaise réponse.</p></div>
  ${open ? `${open.due ? `<div class="banner acc"><div><b>À remettre avant le ${fd(open.due)}</b>${open.status === 'brouillon' ? '<br><span class="small">Ton brouillon est enregistré. Tu peux continuer quand tu veux.</span>' : ''}</div></div>` : ''}${evalForm(open)}` : '<div class="list"><p class="empty">Aucune auto-évaluation à remplir pour le moment.</p></div>'}
  ${done.length ? `<section class="section"><h2>Mes auto-évaluations remises</h2><div class="list">${done.map(v => `<div class="item"><div class="grow"><b>${v.year} · remise le ${fd(v.submitted_at)}</b></div><button class="btn sm" onclick="App.evalOpen('${v.id}')">Revoir</button></div>`).join('')}</div></section>` : ''}`;
}
function empEvalCard() {
  const v = (st.data.empEvals || [])[0]; if (!v) return '';
  return `<section class="panel stack"><div class="spread"><div><h2>Auto-évaluation ${v.year}</h2><p class="small muted">Envoyée le ${fd(v.sent)}${v.submitted_at ? ` · remise le ${fd(v.submitted_at)}` : ''}</p></div><div class="row">${evPill(v.status)}${v.status === 'remise' ? `<button class="btn sm" onclick="App.evalOpen('${v.id}')">Lire</button>` : ''}</div></div></section>`;
}

/* ---------- Liste d'accueil ---------- */
function onbAuto(info, ctrs, secKinds, kinds, hbRead, vaultOn) {
  return [
    { id: 'auto-pw', label: 'Choisir son mot de passe', done: true, page: 'macct' },
    { id: 'auto-info', label: 'Remplir sa fiche d’embauche', done: infoDone(info), page: 'minfo' },
    ...(vaultOn ? [{ id: 'auto-secure', label: 'Envoyer NAS et spécimen de chèque', done: kinds.every(k => secKinds.includes(k)), page: 'msecure' }] : []),
    { id: 'auto-contrat', label: 'Signer son contrat de travail', done: ctrs.some(c => c.emp_sig_at), page: 'mcontract' },
    { id: 'auto-cahier', label: 'Lire le cahier de l’employé', done: hbRead, page: 'home' },
  ].map(x => ({ ...x, auto: true }));
}
function onbTab(e) {
  const o = st.data.empOnb;
  if (!o) return `<div class="list"><div class="item"><div class="grow"><b>Aucune liste d’accueil pour cet employé</b><span class="muted small">Les listes sont créées automatiquement pour les nouveaux employés. Tu peux en démarrer une ici.</span></div><button class="btn primary" onclick="App.onbStart('${e.id}')">Démarrer la liste d’accueil</button></div></div>`;
  const auto = onbAuto(st.data.empInfo, st.data.empCtr || [], (st.data.empSec || []).map(x => x.kind), kindsFor(e), (st.data.empHbRead || false), st.data.vaultOn);
  const dn = Object.fromEntries((st.data.empOnbDone || []).map(d => [d.step_id, d.done_at]));
  const man = (st.data.onbSteps || []).map(t => ({ id: t.id, label: t.label, done: !!dn[t.id], doneAt: dn[t.id] }));
  const it = [...auto, ...man]; const d = it.filter(x => x.done).length; const pct = Math.round(d / it.length * 100);
  return `<section class="panel stack"><div class="spread"><div><h2>Liste d’accueil</h2><p class="small muted">Commencée le ${fd(o.started)}${o.closed ? ` · fermée le ${fd(o.closed)}` : ''}</p></div><div class="row">${d === it.length ? '<span class="pill p-ok">Terminée</span>' : `<span class="pill p-warn">${it.length - d} à faire</span>`}</div></div><div class="prog"><div class="bar"><i style="width:${pct}%"></i></div><span class="small num">${d}/${it.length}</span></div>
  <div class="checklist">${it.map(x => `<div class="ck${x.done ? ' done' : ''}">${x.auto ? `<span class="box" aria-hidden="true">${x.done ? '✓' : ''}</span>` : `<button class="box" onclick="App.onbToggle('${e.id}','${x.id}',${x.done})" aria-label="${x.done ? 'Décocher' : 'Cocher'} : ${esc(x.label)}" aria-pressed="${x.done}">${x.done ? '✓' : ''}</button>`}<div class="grow"><span class="lbl">${esc(x.label)}</span><span class="who-tag">${x.auto ? 'Fait par l’employé · coché automatiquement' : `À faire par toi${x.doneAt ? ` · fait le ${fd(x.doneAt)}` : ''}`}</span></div></div>`).join('')}</div>
  <div class="row"><button class="btn" onclick="App.onbRemind('${e.id}')">Envoyer un rappel à ${esc(e.first_name)}</button>${o.closed ? `<button class="btn ghost" onclick="App.onbClose('${e.id}',false)">Rouvrir</button>` : `<button class="btn ghost" onclick="App.onbClose('${e.id}',true)">Fermer la liste</button>`}<button class="btn ghost" onclick="App.onbTplForm()">Modifier les étapes</button></div></section>`;
}
function myOnb() {
  const o = st.data.myOnb; if (!o || o.closed) return '';
  const read = (st.data.myReads || []).some(r => r.version === st.data.hbMeta?.version);
  const it = onbAuto(st.data.myInfo, st.data.myCtr || [], (st.data.mySec || []).map(x => x.kind), kindsFor(st.me), read, !!st.data.vpub);
  const left = it.filter(x => !x.done); if (!left.length) return '';
  return `<section class="panel stack"><div class="spread"><h2>Mes premières étapes</h2><span class="small muted num">${it.length - left.length} sur ${it.length} faites</span></div><div class="checklist">${it.map(x => `<div class="ck${x.done ? ' done' : ''}"><span class="box" aria-hidden="true">${x.done ? '✓' : ''}</span><div class="grow"><span class="lbl">${esc(x.label)}</span></div>${x.done ? '' : `<button class="btn sm" onclick="App.go('${x.page}')">Faire</button>`}</div>`).join('')}</div></section>`;
}

/* ---------- Copie de sauvegarde ---------- */
const BACKUP_TABLES = ['employees', 'profiles', 'employee_info', 'salary_history', 'perks', 'admin_notes', 'handbook_meta', 'handbook_sections', 'handbook_reads', 'news', 'news_rsvp', 'app_settings',
  'leave_requests', 'warnings', 'contract_templates', 'contracts', 'threads', 'thread_msgs', 'notify_log', 'pay_periods', 'pay_rows', 'pay_buys', 'buy_catalog', 'bank_adj', 'sick_days',
  'vault_pub', 'vault_key', 'secure_items', 'vault_log', 'accidents', 'keys_held', 'recognitions', 'training_modules', 'training_lessons', 'training_done', 'eval_template', 'evals', 'eval_notes', 'onb_steps', 'onb', 'onb_done', 'employee_docs'];
function lastBackup() { try { return localStorage.getItem('mf-last-backup'); } catch (e) { return null; } }
function backupPanel() {
  const last = lastBackup(); const days = last ? Math.floor((Date.now() - new Date(last)) / 864e5) : null; const late = days === null || days >= 30;
  return `<section class="panel stack"><div class="spread"><div><h2>Copie de sauvegarde</h2><p class="small muted">${last ? `Dernière copie téléchargée sur cet appareil le ${fdt(last)}${days >= 1 ? ` (il y a ${days} jour${days > 1 ? 's' : ''})` : ''}.` : 'Aucune copie téléchargée sur cet appareil.'}</p></div><button class="btn ${late ? 'primary' : ''}" id="bk-btn" onclick="App.backup()">Télécharger une copie</button></div>
  ${late ? '<div class="banner acc small"><div><b>Pense à faire ta copie du mois.</b> Range le fichier dans ton Google Drive, dans un dossier à part.</div></div>' : ''}
  <p class="small muted">Le fichier contient toutes les données de la plateforme : dossiers, contrats signés, payes, pourboires, messages, etc. Les documents du coffre y restent chiffrés et illisibles sans ton code. Les fichiers de l’onglet Documents n’y sont pas inclus (seulement leur liste) : garde une copie des plus importants dans ton Drive. Garde ce fichier en lieu sûr (Google Drive avec la validation en deux étapes) et ne l’envoie à personne.</p></section>`;
}
/* ---------- Pages employé ---------- */
function empPage() {
  if (st.loading) return loading();
  switch (st.view.page) {
    case 'minfo': return myInfoView(); case 'msal': return `<div><p class="eyebrow">Mon dossier</p><h1>Salaire et avantages</h1></div>${salaryBlock(st.data.mySal, st.data.myPerks, false)}`; case 'macct': return accountView();
    case 'mcontract': return myContracts(); case 'mwarn': return `<div class="stack" style="gap:6px"><p class="eyebrow">Mon dossier</p><h1>Avertissements</h1><p class="muted">Tu dois confirmer avoir pris connaissance de chaque avertissement.</p></div>${warnList(st.data.myWarn, false)}`;
    case 'mleave': return myLeaves(); case 'mmsg': return empMsgView(); case 'msecure': return mySecure(); case 'meval': return empEvalView(); case 'mtrain': return empTrainView(); case 'macc': return myAcc(); default: return homeView();
  }
}
function myLeaves() {
  return `<div><p class="eyebrow">Mes congés</p><h1>Mes congés</h1></div>
  <form class="panel stack" onsubmit="App.requestLeave(event)"><h2>Demander des vacances</h2>
  <div class="two"><label>Type<select name="type"><option>Vacances</option><option>Congé personnel</option><option>Congé férié reporté</option><option>Autre</option></select></label><span></span>
  <label>Du<input type="date" name="start" required min="${TODAY}"></label><label>Au<input type="date" name="end" required min="${TODAY}"></label></div>
  <label>Note pour ta gestionnaire (facultatif)<input name="note" maxlength="300" placeholder="Ex. demande de date pour réserver mon voyage"></label><p id="lv-err" class="err" hidden></p><div><button class="btn primary">Envoyer la demande</button></div></form>
  <section class="section"><h2>Mes demandes</h2>${leaveList((st.data.myLeaves || []).filter(l => l.status !== 'annulée'), false)}</section>`;
}
function myContracts() {
  const cs = st.data.myCtrFull || [];
  return `<div class="stack" style="gap:6px"><p class="eyebrow">Mon dossier</p><h1>Mon contrat de travail</h1><p class="muted">Lis ton contrat attentivement. Si tu as une question, parles-en à ta gestionnaire avant de signer.</p></div>
  ${cs.length ? cs.map(c => `<section class="section"><div class="spread"><h2>${esc(c.title)}</h2><div class="row">${cPill(c, true)}<button class="btn sm" onclick="App.printContract('${c.id}')">Imprimer ou PDF</button></div></div>${contractDoc(c, fullname(st.me), companyOf(c.body), 'emp')}</section>`).join('') : '<div class="list"><p class="empty">Aucun contrat pour le moment.</p></div>'}`;
}
function homeView() {
  const e = st.me; const news = (st.data.news || []).filter(n => n.until > TODAY);
  const d = st.data; const w = (d.myWarn || []).filter(x => !x.ack_at); const props = (d.myLeaves || []).filter(l => l.status === 'contre-proposition' && l.prop_start);
  const decided = (d.myLeaves || []).filter(l => !l.seen && ['acceptée', 'refusée'].includes(l.status)); const unread = (d.myThreads || []).filter(t => t.unread_emp).length;
  const toSign = (d.myCtr || []).some(c => !c.emp_sig_at);
  return `<div class="greet"><div><p class="eyebrow">${new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Bonjour ${esc(e.first_name)}</h1><p class="muted">Membre de l’équipe depuis ${seniority(e.start_date)}</p></div><span class="sym sym-cafe" aria-hidden="true"></span></div>
  ${myRecog()}
  ${myOnb()}
  ${(() => { const ev = (d.myEvals || []).find(v => v.status !== 'remise'); return ev ? `<div class="banner acc"><div><b>Ton auto-évaluation est prête.</b><br><span class="small">${ev.due ? `À remettre avant le ${fd(ev.due)}.` : 'Remplis-la avant ta révision salariale.'}</span></div><button class="btn primary" onclick="App.go('meval')">${ev.status === 'brouillon' ? 'Continuer' : 'Commencer'}</button></div>` : ''; })()}
  ${(() => { if (!trainFor(e).length) return ''; const p = trainProg(e); if (!p.t || p.d === p.t) return ''; return `<section class="panel stack"><div class="spread"><div><span class="eyebrow">Formation</span><h2>${p.d ? 'Continue ta formation' : 'Commence ta formation'}</h2></div><button class="btn primary" onclick="App.go('mtrain')">${p.d ? 'Continuer' : 'Commencer'}</button></div><div class="prog"><div class="bar"><i style="width:${p.pct}%"></i></div><span class="small num">${p.d}/${p.t}</span></div></section>`; })()}
  ${w.length ? `<div class="banner crit"><div><b>Tu as ${w.length === 1 ? 'un avertissement' : w.length + ' avertissements'} à lire.</b><br><span class="small">Tu dois confirmer en avoir pris connaissance.</span></div><button class="btn primary" onclick="App.go('mwarn')">Lire maintenant</button></div>` : ''}
  ${props.length ? `<div class="banner acc"><div><b>D’autres dates de vacances te sont proposées.</b><br><span class="small">${range(props[0].prop_start, props[0].prop_end)}</span></div><button class="btn" onclick="App.go('mleave')">Répondre</button></div>` : ''}
  ${decided.map(l => `<div class="banner ${l.status === 'refusée' ? 'crit' : 'acc'}" style="${l.status === 'acceptée' ? 'background:var(--ok-soft);border-color:var(--ok)' : ''}"><div class="stack" style="gap:2px"><b>${l.status === 'acceptée' ? 'Ta demande de vacances est acceptée.' : 'Ta demande de vacances est refusée.'}</b><span class="small">${esc(l.type)} · ${range(l.start_date, l.end_date)}</span>${l.admin_msg ? `<span class="small">Message de la direction : « ${esc(l.admin_msg)} »</span>` : ''}${l.status === 'refusée' ? '<span class="small">Tu peux faire une nouvelle demande à d’autres dates.</span>' : ''}</div><div class="row"><button class="btn primary" onclick="App.go('mleave')">Voir mes congés</button><button class="btn" onclick="App.leaveSeen('${l.id}')">OK, compris</button></div></div>`).join('')}
  ${unread ? `<div class="banner acc"><div><b>La direction t’a répondu.</b><br><span class="small">${unread} conversation${unread > 1 ? 's' : ''} avec une nouvelle réponse.</span></div><button class="btn primary" onclick="App.go('mmsg')">Lire</button></div>` : ''}
  ${toSign ? `<div class="banner acc"><div><b>Ton contrat de travail est prêt.</b><br><span class="small">Lis-le et signe-le électroniquement.</span></div><button class="btn primary" onclick="App.go('mcontract')">Voir mon contrat</button></div>` : ''}
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
  async go(p) { closeModal(); st.tipPrint = false; st.view = { page: p }; window.scrollTo(0, 0); await loadPage(); },
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
  async logout() { lockVault(true); await sb.auth.signOut(); st.session = null; st.screen = null; render(); },
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
    <label class="check"><input type="checkbox" name="mail" checked><span>Envoyer un courriel aux employés pour les aviser</span></label>
    <div class="row"><button class="btn primary">Publier</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`); },
  async saveNews(ev) { const f = formData(ev); try { const n = await q(sb.from('news').insert({ date: TODAY, title: f.title.trim(), body: f.body, until: f.until, rsvp: !!f.rsvp, rsvp_due: f.rsvp && f.rsvp_due ? f.rsvp_due : null }).select('id').single()); if (f.mail) notify('news', n.id); closeModal(); toast(f.mail ? 'Nouvelle publiée. Les employés recevront un courriel.' : 'Nouvelle publiée.'); await loadPage(); } catch (e) { fail(e); } },
  async delNews(id) { try { await q(sb.from('news').delete().eq('id', id)); toast('Nouvelle supprimée.'); await loadPage(); } catch (e) { fail(e); } },
  /* Congés */
  cal(d) { const now = new Date(); const [y, m] = st.cal || [now.getFullYear(), now.getMonth()]; const x = new Date(y, m + d, 1); st.cal = [x.getFullYear(), x.getMonth()]; render(); },
  calTo(y, m) { st.cal = y === undefined ? null : [y, m]; render(); },
  findLeave(id) { return [...(st.data.leaves || []), ...(st.data.empLeaves || []), ...(st.data.pendLeaves || [])].find(l => l.id === id); },
  async leaveDecide(id) { try { await q(sb.from('leave_requests').update({ status: 'acceptée', decided_at: new Date().toISOString(), seen: false, admin_msg: '' }).eq('id', id)); notify('leave_answer', id); toast('Congé accepté.'); await loadPage(); } catch (e) { fail(e); } },
  proposeForm(id) { const l = App.findLeave(id); if (!l) return; const e = empById(l.employee_id) || st.data.emp;
    modal('Proposer d’autres dates', `<form class="stack" onsubmit="App.savePropose(event,'${id}')"><p class="muted">${esc(fullname(e))} a demandé du ${range(l.start_date, l.end_date)}.</p><div class="two"><label>Du<input type="date" name="start" required value="${l.start_date}"></label><label>Au<input type="date" name="end" required value="${l.end_date}"></label></div><label>Message<textarea name="msg" placeholder="Explique pourquoi tu proposes ces dates."></textarea></label><p id="pp-err" class="err" hidden></p><div class="row"><button class="btn primary">Envoyer la proposition</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`); },
  async savePropose(ev, id) { const f = formData(ev); if (f.end < f.start) { const er = $('#pp-err'); er.textContent = 'La date de fin doit suivre la date de début.'; er.hidden = false; return; }
    try { await q(sb.from('leave_requests').update({ status: 'contre-proposition', prop_start: f.start, prop_end: f.end, prop_msg: f.msg.trim(), seen: false }).eq('id', id)); notify('leave_answer', id); closeModal(); toast('Proposition envoyée.'); await loadPage(); } catch (e) { fail(e); } },
  refuseForm(id) { const l = App.findLeave(id); if (!l) return; const e = empById(l.employee_id) || st.data.emp;
    modal('Refuser la demande', `<form class="stack" onsubmit="App.saveRefuse(event,'${id}')"><p class="muted">${esc(fullname(e))} · ${esc(l.type)} du ${range(l.start_date, l.end_date)}</p><label>Message pour ${esc(e.first_name)} (facultatif)<textarea name="msg" placeholder="Ex. Trop de collègues du même magasin sont déjà absents cette semaine-là."></textarea></label><p class="small muted">${esc(e.first_name)} verra la réponse et ce message sur sa page d’accueil.</p><div class="row"><button class="btn primary" style="background:var(--crit);border-color:var(--crit)">Refuser la demande</button><button type="button" class="btn" onclick="App.close();App.proposeForm('${id}')">Proposer d’autres dates plutôt</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`); },
  async saveRefuse(ev, id) { const f = formData(ev); try { await q(sb.from('leave_requests').update({ status: 'refusée', admin_msg: f.msg.trim(), decided_at: new Date().toISOString(), seen: false }).eq('id', id)); notify('leave_answer', id); closeModal(); toast('Demande refusée. L’employé le verra sur sa page d’accueil.'); await loadPage(); } catch (e) { fail(e); } },
  async requestLeave(ev) { const f = formData(ev); const er = $('#lv-err'); if (f.end < f.start) { er.textContent = 'La date de fin doit suivre la date de début.'; er.hidden = false; return; }
    try { const r = await q(sb.from('leave_requests').insert({ employee_id: st.me.id, type: f.type, start_date: f.start, end_date: f.end, note: f.note.trim() }).select('id').single()); notify('leave_request', r.id); toast('Demande envoyée.'); await loadPage(); } catch (e) { er.textContent = errMsg(e); er.hidden = false; } },
  async cancelLeave(id) { try { await q(sb.rpc('leave_cancel', { p_id: id })); toast('Demande annulée.'); await loadPage(); } catch (e) { fail(e); } },
  async answerProposal(id, yes) { try { await q(sb.rpc('leave_answer', { p_id: id, p_accept: yes })); toast(yes ? 'Vacances confirmées.' : 'Réponse envoyée.'); await loadPage(); } catch (e) { fail(e); } },
  async leaveSeen(id) { try { await q(sb.rpc('leave_seen', { p_id: id })); await loadPage(); } catch (e) { fail(e); } },

  /* Avertissements */
  warnForm(eid) { const e = st.data.emp;
    modal('Émettre un avertissement', `<form class="stack" onsubmit="App.saveWarn(event,'${eid}')"><p class="muted">À : <b>${esc(fullname(e))}</b></p><div class="two"><label>Type<select name="level">${WARN_LEVELS.map(x => `<option>${x}</option>`).join('')}</select></label><label>Date<input type="date" name="date" required value="${TODAY}"></label></div><label>Objet<input name="title" required placeholder="Ex. retards répétés"></label><label>Description des faits et attentes<textarea name="body" required></textarea></label><p class="small muted">${esc(e.first_name)} le verra dans son espace et devra confirmer en avoir pris connaissance.</p><div class="row"><button class="btn primary">Envoyer l’avertissement</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`); },
  async saveWarn(ev, eid) { const f = formData(ev); try { const r = await q(sb.from('warnings').insert({ employee_id: eid, date: f.date, level: f.level, title: f.title.trim(), body: f.body.trim() }).select('id').single()); notify('warning', r.id); closeModal(); toast('Avertissement envoyé.'); await loadPage(); } catch (e) { fail(e); } },
  async delWarn(id) { if (!confirm('Retirer cet avertissement du dossier?')) return; try { await q(sb.from('warnings').delete().eq('id', id)); toast('Avertissement retiré.'); await loadPage(); } catch (e) { fail(e); } },
  async ack(ev, id) { const f = formData(ev); try { await q(sb.rpc('warning_ack', { p_id: id, p_comment: f.comment || '' })); toast('Confirmation envoyée.'); await loadPage(); } catch (e) { fail(e); } },

  /* Contrats */
  async contractForm(eid) {
    try {
      if (!st.data.tpls) st.data.tpls = await q(sb.from('contract_templates').select('*').order('position'));
      const emps = await q(sb.from('employees').select('id,first_name,last_name,poste,magasin,active,start_date').eq('active', true).order('last_name'));
      const e = eid ? emps.find(x => x.id === eid) : null; const t0 = e ? guessTpl(e, st.data.tpls) : null;
      modal('Créer un contrat', `<form class="stack" onsubmit="App.saveContract(event,'${eid || ''}')">
      ${e ? `<p class="muted">Pour <b>${esc(fullname(e))}</b> · ${esc(e.poste)} · ${esc(e.magasin)}</p>` : `<label>Employé<select name="emp" required>${emps.map(x => `<option value="${x.id}">${esc(fullname(x))} · ${esc(x.poste)}</option>`).join('')}</select></label>`}
      <label>Modèle<select name="tpl">${t0 ? '' : '<option value="auto" selected>Selon le poste de l’employé</option>'}${st.data.tpls.map(t => `<option value="${t.id}" ${t === t0 ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select></label>
      <div class="two"><label>Statut<select name="statut"><option>Temps plein</option><option>Temps partiel</option></select></label><label>Heures par semaine<input type="number" min="1" max="60" name="heures" required value="35"></label>
      <label>Date d’entrée en fonction<input type="date" name="debut" value="${e ? e.start_date : ''}"></label><label>Taux horaire ($)<input type="number" step="0.01" min="0" name="taux" placeholder="Taux actuel"></label>
      <label>Période de probation<select name="essai"><option>3 mois</option><option>6 mois</option><option>1 mois</option></select></label></div>
      <p class="small muted">Laisse la date et le taux vides pour utiliser la date d’embauche et le taux actuel de l’employé. L’adresse de l’employé vient de sa fiche d’embauche.</p>
      <p id="cf-err" class="err" hidden></p><div class="row"><button class="btn primary">Créer et afficher le contrat</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
    } catch (e) { fail(e); }
  },
  async saveContract(ev, eid) {
    const f = formData(ev); const btn = ev.submitter; if (btn) btn.disabled = true; const id = eid || f.emp;
    try {
      const e = (await q(sb.from('employees').select('*').eq('id', id)))[0];
      const info = (await q(sb.from('employee_info').select('*').eq('employee_id', id)))[0] || null;
      const rate = (await q(sb.from('salary_history').select('rate').eq('employee_id', id).order('effective', { ascending: false }).limit(1)))[0]?.rate || 0;
      const S = (await q(sb.from('app_settings').select('*')))[0] || {};
      const tpls = st.data.tpls; const tpl = f.tpl === 'auto' ? guessTpl(e, tpls) : tpls.find(t => t.id === f.tpl);
      const o = { statut: f.statut, heures: f.heures, date_debut: f.debut || e.start_date, taux: f.taux ? Number(f.taux) : Number(rate), essai: f.essai };
      const c = await q(sb.from('contracts').insert({ employee_id: id, title: tpl.title, body: fillContract(e, info, S, tpl, o), opts: o }).select('id').single());
      notify('contract', c.id); toast('Contrat créé. ' + e.first_name + ' recevra un courriel.'); await loadPage(); App.viewContract(c.id);
    } catch (x) { const er = $('#cf-err'); if (er) { er.textContent = errMsg(x); er.hidden = false; } else fail(x); if (btn) btn.disabled = false; }
  },
  async viewContract(id) {
    try {
      const c = (await q(sb.from('contracts').select('*').eq('id', id)))[0]; if (!c) return toast('Contrat introuvable.');
      const e = (await q(sb.from('employees').select('id,first_name,last_name,poste').eq('id', c.employee_id)))[0];
      st.ctrOpen = { c, e };
      modal(c.title, `<div class="spread"><span class="muted">${esc(fullname(e))} · ${esc(e.poste)}</span><div class="row">${cPill(c, false)}<button class="btn sm" onclick="App.printContract('${c.id}')">Imprimer ou PDF</button></div></div>${contractDoc(c, fullname(e), companyOf(c.body), 'admin')}${c.completed_at ? '<p class="small muted">L’employé peut consulter le contrat signé en tout temps dans « Mon contrat ».</p>' : `<div class="row"><button class="btn ghost crit" onclick="App.delContract('${c.id}')">Supprimer ce contrat</button></div>`}`, true);
    } catch (x) { fail(x); }
  },
  async delContract(id) { if (!confirm('Supprimer ce contrat? Les signatures déjà apposées seront perdues.')) return; try { await q(sb.from('contracts').delete().eq('id', id)); closeModal(); toast('Contrat supprimé.'); await loadPage(); } catch (e) { fail(e); } },
  async signForm(id, who) {
    let c = st.ctrOpen?.c?.id === id ? st.ctrOpen.c : (st.data.myCtrFull || []).find(x => x.id === id); if (!c) return;
    const admin = st.role === 'admin'; const empName = admin ? fullname(st.ctrOpen.e) : fullname(st.me);
    let signer = '';
    if (who === 'admin') { try { signer = (await q(sb.from('app_settings').select('admin_signer,company_rep')))[0]; signer = signer?.admin_signer || signer?.company_rep || ''; } catch (_) {} }
    const inPerson = admin && who === 'emp';
    modal(who === 'emp' ? 'Signature de l’employé' : 'Signature de l’employeur', `<form class="stack" onsubmit="App.saveSig(event,'${id}','${who}')">
    ${inPerson ? `<div class="banner acc small">Remets l’appareil à ${esc(st.ctrOpen.e.first_name)} pour qu’il ou elle signe.</div>` : ''}
    <label>Nom complet<input name="name" required value="${esc(who === 'emp' ? empName : signer)}"></label>
    <div class="stack" style="gap:6px"><div class="spread"><span style="font-weight:600;font-size:.9rem">Trace ta signature dans le cadre</span><button type="button" class="btn ghost sm" onclick="App.clearPad()">Effacer</button></div><canvas id="pad" class="pad" aria-label="Zone de signature"></canvas></div>
    <label class="check"><input type="checkbox" name="ok" required><span>${who === 'emp' ? 'J’ai lu mon contrat de travail et j’en accepte les conditions.' : `Je signe ce contrat au nom de ${esc(companyOf(c.body))}.`}</span></label>
    <p id="sg-err" class="err" hidden>Trace ta signature dans le cadre avant de continuer.</p>
    <div class="row"><button class="btn primary">Signer</button><button type="button" class="btn ghost" onclick="${admin ? `App.viewContract('${id}')` : 'App.close()'}">Annuler</button></div></form>`);
    initPad();
  },
  clearPad() { if (!sigPad) return; sigPad.x.clearRect(0, 0, sigPad.c.width, sigPad.c.height); sigPad.drawn = false; },
  async saveSig(ev, id, who) {
    const f = formData(ev); if (!sigPad || !sigPad.drawn) { $('#sg-err').hidden = false; return; }
    const btn = ev.submitter; if (btn) btn.disabled = true;
    try {
      const c = await q(sb.rpc('contract_sign', { p_id: id, p_who: who, p_name: f.name.trim(), p_img: sigImage() }));
      if (st.role !== 'admin') notify('contract_signed', id);
      closeModal(); toast(c.completed_at ? 'Contrat signé par les deux parties.' : 'Signature enregistrée.');
      await loadPage(); if (st.role === 'admin') App.viewContract(id);
    } catch (e) { const er = $('#sg-err'); er.textContent = errMsg(e); er.hidden = false; if (btn) btn.disabled = false; }
  },
  async printContract(id) {
    const w = window.open('', '_blank'); if (!w) return toast('Autorise les fenêtres surgissantes pour imprimer.');
    try {
      const c = (await q(sb.from('contracts').select('*').eq('id', id)))[0];
      const e = st.role === 'admin' ? (await q(sb.from('employees').select('first_name,last_name').eq('id', c.employee_id)))[0] : st.me;
      w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(c.title)} — ${esc(fullname(e))}</title><style>body{font-family:Georgia,serif;color:#111;max-width:760px;margin:30px auto;padding:0 24px;line-height:1.55;font-size:13px}.ctext{white-space:pre-wrap}.ct{display:block;text-align:center;font-size:18px;font-weight:700}.cst{display:block;text-align:center;font-weight:700;letter-spacing:.06em}.ch{display:inline-block;margin-top:8px}.sigs{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:30px;break-inside:avoid}.sigline{border-bottom:1px solid #111;min-height:80px;display:flex;align-items:flex-end}.sigline img{max-height:76px;max-width:100%}.sigmeta{display:block;font-size:11px;color:#444;margin-top:4px}.btn{display:none}p.sigmeta{margin-top:24px}</style></head><body>${contractDoc(c, fullname(e), companyOf(c.body), 'print')}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
      w.document.close();
    } catch (x) { w.close(); fail(x); }
  },
  async saveCompany(ev) { const f = formData(ev); Object.keys(f).forEach(k => f[k] = String(f[k]).trim()); try { await q(sb.from('app_settings').update({ ...f, updated_at: new Date().toISOString() }).eq('id', 1)); toast('Renseignements enregistrés. Ils s’appliquent aux nouveaux contrats.'); await loadPage(); } catch (e) { fail(e); } },
  tplForm(id) {
    const t = id ? st.data.tpls.find(x => x.id === id) : { poste: '', title: 'Contrat — ', body: st.data.tpls[0]?.body || '' };
    modal(id ? 'Modifier le modèle' : 'Nouveau modèle', `<form class="stack" onsubmit="App.saveTpl(event,'${id || ''}')"><div class="two"><label>Type de poste<input name="poste" required value="${esc(t.poste)}"></label><label>Titre<input name="title" required value="${esc(t.title)}"></label></div>
    <label>Texte du contrat<textarea class="big" name="body" required style="min-height:50vh">${esc(t.body)}</textarea></label>
    <p class="small muted">Champs remplis automatiquement : ${['entreprise', 'adresse_entreprise', 'representant', 'titre_representant', 'ville', 'prenom', 'nom', 'adresse_employe', 'poste', 'lieu', 'magasin', 'date_debut', 'statut', 'heures', 'taux', 'essai', 'date_contrat'].map(v => `<code>{{${v}}}</code>`).join(' ')}</p>
    <p class="small muted">Les contrats déjà créés ne changent pas.</p>
    <div class="row"><button class="btn primary">Enregistrer le modèle</button>${id ? `<button type="button" class="btn ghost crit" onclick="App.delTpl('${id}')">Supprimer le modèle</button>` : ''}<button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`, true);
  },
  async saveTpl(ev, id) { const f = formData(ev); try { if (id) await q(sb.from('contract_templates').update({ poste: f.poste.trim(), title: f.title.trim(), body: f.body, updated_at: new Date().toISOString() }).eq('id', id)); else await q(sb.from('contract_templates').insert({ poste: f.poste.trim(), title: f.title.trim(), body: f.body, position: (st.data.tpls.at(-1)?.position || 0) + 1 })); st.data.tpls = null; closeModal(); toast('Modèle enregistré.'); await loadPage(); } catch (e) { fail(e); } },
  async delTpl(id) { if (st.data.tpls.length <= 1) return toast('Garde au moins un modèle.'); if (!confirm('Supprimer ce modèle?')) return; try { await q(sb.from('contract_templates').delete().eq('id', id)); st.data.tpls = null; closeModal(); toast('Modèle supprimé.'); await loadPage(); } catch (e) { fail(e); } },

  /* Messages */
  msgTab(k) { st.msgFilter = k; render(); },
  async msgOpen(id) {
    try {
      const admin = st.role === 'admin'; const t = (admin ? st.data.threads : st.data.myThreads).find(x => x.id === id); if (!t) return;
      const msgs = await q(sb.from('thread_msgs').select('*').eq('thread_id', id).order('created_at'));
      const docs = (await sb.from('employee_docs').select('*').eq('thread_id', id)).data || [];
      if (admin && t.unread_admin) { await q(sb.from('threads').update({ unread_admin: false }).eq('id', id)); t.unread_admin = false; st.badges.msgs = Math.max(0, (st.badges.msgs || 1) - 1); }
      if (!admin && t.unread_emp) { await q(sb.rpc('thread_seen', { p_id: id })); t.unread_emp = false; }
      render(); modal(t.subject, threadView(t, msgs, admin ? 'admin' : 'emp', docs), true);
      const th = document.querySelector('.thread'); if (th) th.scrollTop = th.scrollHeight;
    } catch (e) { fail(e); }
  },
  async msgReply(ev, id) {
    const files = [...(ev.target.elements.files?.files || [])]; const f = formData(ev); const btn = ev.submitter; if (btn) btn.disabled = true; const admin = st.role === 'admin';
    try {
      const m = await q(sb.from('thread_msgs').insert({ thread_id: id, body: f.text.trim(), from_admin: admin }).select('id').single());
      if (files.length) { if (btn) btn.textContent = 'Envoi des fichiers…'; await uploadDocs(files, st.me.id, { uploaded_by: 'employé', cat: 'Envoyé par l’employé', thread_id: id, msg_id: m.id }); }
      if (admin) await q(sb.from('threads').update({ unread_admin: false }).eq('id', id));
      notify(admin ? 'message_reply' : 'message_new', id); toast('Message envoyé.');
      await loadPage(); App.msgOpen(id);
    } catch (e) { const er = $('#mr-err'); if (er) { er.textContent = errMsg(e); er.hidden = false; } else fail(e); if (btn) { btn.disabled = false; btn.textContent = 'Envoyer'; } }
  },
  async msgClose(id, close) { try { await q(sb.from('threads').update({ status: close ? 'fermé' : 'ouvert' }).eq('id', id)); closeModal(); toast(close ? 'Conversation fermée.' : 'Conversation rouverte.'); await loadPage(); } catch (e) { fail(e); } },
  async msgNew(ev) {
    const files = [...(ev.target.elements.files?.files || [])]; const f = formData(ev); const btn = ev.submitter; if (btn) btn.disabled = true;
    try {
      const t = await q(sb.from('threads').insert({ employee_id: st.me.id, type: f.type, subject: f.subject.trim() }).select('id').single());
      const m = await q(sb.from('thread_msgs').insert({ thread_id: t.id, body: f.text.trim() }).select('id').single());
      if (files.length) { if (btn) btn.textContent = 'Envoi des fichiers…'; try { await uploadDocs(files, st.me.id, { uploaded_by: 'employé', cat: 'Envoyé par l’employé', thread_id: t.id, msg_id: m.id }); } catch (x) { notify('message_new', t.id); await loadPage(); return fail(new Error('Ton message est envoyé, mais un fichier n’a pas pu être joint : ' + errMsg(x))); } }
      notify('message_new', t.id); toast('Message envoyé à la direction.'); await loadPage();
    } catch (e) { const er = $('#mn-err'); if (er) { er.textContent = errMsg(e); er.hidden = false; } else fail(e); if (btn) { btn.disabled = false; btn.textContent = 'Envoyer'; } }
  },

  /* Documents */
  async openDoc(path) {
    const w = window.open('', '_blank');
    try { const { data, error } = await sb.storage.from('docs').createSignedUrl(path, 120); if (error) throw error; if (w) w.location = data.signedUrl; else location.href = data.signedUrl; }
    catch (e) { if (w) w.close(); fail(e); }
  },
  async docUpload(ev, eid) {
    const files = [...ev.target.elements.files.files]; const f = formData(ev); const er = $('#dc-err'); const btn = ev.submitter; if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
    try { await uploadDocs(files, eid, { uploaded_by: 'admin', cat: f.cat, note: (f.note || '').trim() }); toast(files.length > 1 ? `${files.length} documents ajoutés.` : 'Document ajouté.'); await loadPage(); }
    catch (e) { er.textContent = errMsg(e); er.hidden = false; if (btn) { btn.disabled = false; btn.textContent = 'Ajouter au dossier'; } }
  },
  async docDel(id) {
    const d = (st.data.empDocs || []).find(x => x.id === id); if (!d || !confirm(`Supprimer « ${d.name} » définitivement?`)) return;
    try { const { error } = await sb.storage.from('docs').remove([d.path]); if (error) throw error; await q(sb.from('employee_docs').delete().eq('id', id)); toast('Document supprimé.'); await loadPage(); } catch (e) { fail(e); }
  },

  /* Paye et pourboire */
  tipPick(id) { st.tipSel = id; const p = curTip(); if (p) st.tipYear = yearOf(p); render(); },
  tipYearTab(y) { st.tipYear = y; render(); },
  tipHideEmpty(v) { st.tipHide = v; render(); },
  tipPrintView(v) { st.tipPrint = v; render(); window.scrollTo(0, 0); },
  tipSaving(msg) { const el = $('#tp-save'); if (el) el.textContent = msg; },
  tipNewForm() {
    const ps = tipPeriods(); let start, end;
    if (ps.length) { const d = new Date(ps[0].end + 'T12:00'); d.setDate(d.getDate() + 1); start = iso(d); d.setDate(d.getDate() + 13); end = iso(d); }
    else { const d = new Date(); d.setDate(d.getDate() - d.getDay() - 1); end = iso(d); d.setDate(d.getDate() - 13); start = iso(d); }
    const lastNum = ps.length ? parseInt((pLabel(ps[0]).match(/\d+/) || [0])[0], 10) : 0; const ny = ps.length && lastNum >= 26; const name = `Paye ${ny ? 1 : lastNum + 1}`; const year = ps.length ? yearOf(ps[0]) + (ny ? 1 : 0) : new Date(end + 'T12:00').getFullYear();
    modal('Nouvelle paye', `<form class="stack" onsubmit="App.tipNew(event)"><div class="two"><label>Nom de la paye<input name="label" required value="${esc(name)}" placeholder="Ex. Paye 25"></label><label>Année de paye<input type="number" name="year" required min="2000" max="2100" value="${year}"></label></div>${ny ? '<p class="small muted">La paye 26 est terminée : une nouvelle année de paye commence.</p>' : ''}<div class="two"><label>Du<input type="date" name="start" required value="${start}"></label><label>Au<input type="date" name="end" required value="${end}"></label></div><p id="np-err" class="err" hidden></p><div class="row"><button class="btn primary">Créer la paye</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
  },
  async tipNew(ev) {
    const f = formData(ev); const er = $('#np-err'); if (f.end < f.start) { er.textContent = 'La date de fin doit suivre la date de début.'; er.hidden = false; return; }
    const ps = tipPeriods();
    try { const p = await q(sb.from('pay_periods').insert({ label: f.label.trim(), year: Number(f.year) || new Date(f.end + 'T12:00').getFullYear(), start_date: f.start, end_date: f.end, pct: ps.length ? ps[0].pct : 70 }).select('id,year').single()); st.tipSel = p.id; st.tipYear = p.year; closeModal(); toast(`${f.label.trim()} créée.`); await loadPage(); } catch (e) { er.textContent = errMsg(e); er.hidden = false; }
  },
  async tipField(k, v) {
    const p = curTip(); if (!p || p.locked) return; const col = { label: 'label', year: 'year', start: 'start_date', end: 'end_date' }[k];
    const val = k === 'label' ? (v.trim() || p.label) : k === 'year' ? (Number(v) || yearOf(p)) : v;
    try { await q(sb.from('pay_periods').update({ [col]: val }).eq('id', p.id)); p[k] = val; if (k === 'year') st.tipYear = val; render(); toast('Enregistré.'); } catch (e) { fail(e); }
  },
  tipAmt(k, v) {
    const p = curTip(); if (!p || p.locked) return; if (k === 'pct') p.pct = Math.max(0, Math.min(100, parseFloat(v) || 0)); else p[k] = v; tipsRefresh();
    App.tipSaving('Enregistrement…'); clearTimeout(App._ta); App._ta = setTimeout(async () => { try { await q(sb.from('pay_periods').update({ laval: toC(p.laval) / 100, mtl: toC(p.mtl) / 100, pct: p.pct }).eq('id', p.id)); App.tipSaving('Enregistré'); } catch (e) { App.tipSaving('Erreur d’enregistrement'); fail(e); } }, 600);
  },
  tipH(id, v) {
    const p = curTip(); if (!p || p.locked) return; const e = empP(id); const prev = p.rows[id]; const h = Math.max(0, parseFloat(String(v).replace(',', '.')) || 0);
    if (!h && !(prev && ((prev.buys && prev.buys.length) || prev.holOv != null))) delete p.rows[id];
    else p.rows[id] = { ...(prev || { buys: [] }), name: e ? fullname(e) : (prev && prev.name) || '', grp: prev && rowH(prev) > 0 ? rowG(prev, e) : (e ? tipGroupOf(e) : 'prod'), h };
    tipsRefresh(); App.tipSaving('Enregistrement…');
    App._th = App._th || {}; clearTimeout(App._th[id]); App._th[id] = setTimeout(async () => {
      const r = p.rows[id];
      try { if (r && (r.h > 0 || r.holOv != null)) await q(sb.from('pay_rows').upsert({ period_id: p.id, employee_id: id, hours: r.h, grp: r.grp, name: r.name, ...(st.pay.holOn ? { hol_override: r.holOv ?? null } : {}) })); else await q(sb.from('pay_rows').delete().eq('period_id', p.id).eq('employee_id', id)); App.tipSaving('Enregistré'); }
      catch (e) { App.tipSaving('Erreur d’enregistrement'); fail(e); }
    }, 600);
  },
  holEdit(id) {
    const p = curTip(); if (!p || p.locked) return; const b = (bankAll().by[p.id] || {})[id] || { ferAuto: 0, ferBase: 0, ferOv: false, ferH: 0 }; const e = empP(id); const r = p.rows[id];
    modal(`Férié · ${e ? fullname(e) : ''}`, `<form class="stack" onsubmit="App.holSave(event,'${id}')"><p class="muted" style="margin-top:-6px">${esc(pLabel(p))} · ${holsIn(p).map(h => esc(h.name)).join(', ')}</p>
    <div class="panel" style="background:var(--blue);border:0;padding:14px"><span class="small" style="color:var(--accent-text)">Calcul automatique : ${fmtH(b.ferBase / 100)} h payées dans les 2 payes précédentes ÷ 20${holsIn(p).length > 1 ? ` × ${holsIn(p).length} jours` : ''} = <b>${fmtH(b.ferAuto / 100)} h</b>, soit ${fromC(Math.round(b.ferAuto / 100 * rateAt(id, p.end) * 100))} au taux de ${money(rateAt(id, p.end))} / h.</span></div>
    <label style="max-width:260px">Heures de férié à payer<input type="number" step="0.25" min="0" name="h" value="${r && r.holOv != null ? r.holOv : ''}" placeholder="${String(b.ferAuto / 100)} (automatique)"></label>
    <p class="small muted">Laisse vide pour garder le calcul automatique. Mets 0 si l’employé n’a pas droit au férié, par exemple après une absence injustifiée la veille ou le lendemain.</p>
    <div class="row"><button class="btn primary">Enregistrer</button>${r && r.holOv != null ? `<button type="button" class="btn" onclick="App.holSave(null,'${id}',true)">Revenir au calcul automatique</button>` : ''}<button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
  },
  async holSave(ev, id, reset) {
    const p = curTip(); const e = empP(id); let v = null;
    if (ev) { const f = formData(ev); v = String(f.h).trim() === '' ? null : Math.max(0, parseFloat(String(f.h).replace(',', '.')) || 0); }
    if (reset) v = null;
    const prev = p.rows[id]; const row = prev || { h: 0, grp: e ? tipGroupOf(e) : 'prod', name: e ? fullname(e) : '', buys: [] };
    try {
      if (v == null && !(row.h > 0)) await q(sb.from('pay_rows').delete().eq('period_id', p.id).eq('employee_id', id));
      else await q(sb.from('pay_rows').upsert({ period_id: p.id, employee_id: id, hours: row.h || 0, grp: row.grp || (e ? tipGroupOf(e) : 'prod'), name: row.name || (e ? fullname(e) : ''), hol_override: v }));
      closeModal(); toast(v == null ? 'Férié calculé automatiquement.' : 'Férié ajusté.'); await loadPage();
    } catch (x) { fail(x); }
  },
  async holAdd(ev) { const f = formData(ev); try { await q(sb.from('holidays').insert({ date: f.date, name: f.name.trim() })); toast('Jour férié ajouté.'); await loadPage(); } catch (e) { fail(/duplicate|unique/i.test(errMsg(e)) ? new Error('Ce jour est déjà inscrit.') : e); } },
  async holDel(id) { if (!confirm('Retirer ce jour férié?')) return; try { await q(sb.from('holidays').delete().eq('id', id)); toast('Jour férié retiré.'); await loadPage(); } catch (e) { fail(e); } },
  async holQc(y) {
    const d = (m, dd) => iso(new Date(y, m - 1, dd)); const nth = (m, wd, n) => { const x = new Date(y, m - 1, 1); while (x.getDay() !== wd) x.setDate(x.getDate() + 1); x.setDate(x.getDate() + 7 * (n - 1)); return iso(x); };
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const em = Math.floor((h + l - 7 * m + 114) / 31), ed = ((h + l - 7 * m + 114) % 31) + 1; const gf = new Date(y, em - 1, ed); gf.setDate(gf.getDate() - 2);
    const pat = new Date(y, 4, 24); while (pat.getDay() !== 1) pat.setDate(pat.getDate() - 1);
    const can = new Date(y, 6, 1); if (can.getDay() === 0) can.setDate(2);
    const list = [[d(1, 1), 'Jour de l’An'], [iso(gf), 'Vendredi saint'], [iso(pat), 'Journée nationale des patriotes'], [d(6, 24), 'Fête nationale du Québec'], [iso(can), 'Fête du Canada'], [nth(9, 1, 1), 'Fête du Travail'], [nth(10, 1, 2), 'Action de grâces'], [d(12, 25), 'Noël']];
    const have = new Set((st.pay.hols || []).map(x => x.date)); const rows = list.filter(([dt]) => !have.has(dt)).map(([date, name]) => ({ date, name }));
    try { if (rows.length) await q(sb.from('holidays').insert(rows)); toast(`${rows.length} jours fériés ajoutés pour ${y}. Vérifie-les : tu peux remplacer le Vendredi saint par le lundi de Pâques.`); await loadPage(); } catch (x) { fail(x); }
  },
  buyForm(id) {
    const p = curTip(); const e = empP(id); const r = p.rows[id] || {}; const buys = r.buys || []; const rate = rateAt(id, p.end); const lk = !!p.locked;
    const tot = buys.reduce((t, x) => t + toC(x.price), 0); const bk = (bankAll().by[p.id] || {})[id] || { buyH: 0, buyBank: 0, buyPay: 0 };
    const cat = Object.values(st.pay.cat).sort((a, b) => a.item.localeCompare(b.item));
    modal(`Achats · ${e ? fullname(e) : r.name || ''}`, `<p class="muted" style="margin-top:-6px">${esc(pLabel(p))} · taux horaire ${money(rate)} / h</p>
    ${buys.length ? `<div class="list">${buys.map(x => `<div class="item"><div class="grow"><b>${esc(x.desc)}</b><span class="muted small">${x.qty ? `${String(Number(x.qty)).replace('.', ',')} ${esc(x.unit || '')} × ${money(Number(x.unitPrice))} = ` : ''}${money(toC(x.price) / 100)}</span></div>${lk ? '' : `<button class="btn sm ghost" onclick="App.buyDel('${id}','${x.id}')">Retirer</button>`}</div>`).join('')}
    <div class="item"><div class="grow"><b>Total ${money(tot / 100)}</b><span class="muted small">au taux horaire, arrondi au quart d’heure supérieur</span>${bk.buyBank ? `<span class="small" style="color:var(--accent-text)">${fmtH(bk.buyBank / 100)} h prise(s) dans la banque d’heures${bk.buyPay ? `, ${fmtH(bk.buyPay / 100)} h retirée(s) de la paye` : ''}</span>` : ''}</div><b class="payh" style="font-size:1.3rem">−${fmtH(bk.buyH / 100)} h</b></div></div>` : '<p class="small muted">Aucun achat pour cette paye.</p>'}
    ${!rate ? '<p class="err">Cet employé n’a pas de taux horaire : ajoute-le dans son dossier pour convertir les achats en heures.</p>' : ''}
    ${lk ? '<p class="small muted">Cette paye est verrouillée.</p>' : `<form class="stack" onsubmit="App.buyAdd(event,'${id}')" oninput="App.buyCalc(this,${rate})">
      <label>Article<input name="desc" required list="by-cat" placeholder="Ex. Saumon" onchange="App.buyPick(this.form,${rate})"></label><datalist id="by-cat">${cat.map(x => `<option value="${esc(x.item)}">${money(x.unit_price)} / ${esc(x.unit)}</option>`).join('')}</datalist>
      <div class="tipin" style="grid-template-columns:1fr 1fr 1fr"><label>Quantité<input type="number" step="0.001" min="0" name="qty" placeholder="Ex. 1,53"></label><label>Unité<select name="unit"><option>kg</option><option>g</option><option>L</option><option>unité</option><option>paquet</option></select></label><label>Prix par unité ($)<input type="number" step="0.01" min="0" name="unitPrice" placeholder="Ex. 32,50"></label></div>
      <label>Montant total ($)<input type="number" step="0.01" min="0.01" name="price" required placeholder="Calculé automatiquement, ou entre un montant"></label>
      <p id="by-h" class="small" style="color:var(--accent-text);min-height:1.2em"></p>
      <div class="row"><button class="btn primary">Ajouter l’achat</button><button type="button" class="btn ghost" onclick="App.close()">Fermer</button></div></form>`}`);
  },
  buyPick(f, rate) { const c = st.pay.cat[slug(f.elements.desc.value)]; if (c) { f.elements.unit.value = c.unit; f.elements.unitPrice.value = c.unit_price; App.buyCalc(f, rate); } },
  buyCalc(f, rate) {
    const qq = parseFloat(f.elements.qty.value), u = parseFloat(f.elements.unitPrice.value); if (qq > 0 && u > 0) f.elements.price.value = (Math.round(qq * u * 100) / 100).toFixed(2);
    const v = parseFloat(f.elements.price.value) || 0; const el = $('#by-h');
    if (el) el.textContent = rate && v ? `${money(v)} = ${(Math.round(v * 100 / rate) / 100).toLocaleString('fr-CA')} h au taux horaire, arrondi à ${(Math.ceil(v * 100 / rate / 25 - 1e-9) * 25 / 100).toLocaleString('fr-CA')} h` : '';
  },
  async buyAdd(ev, id) {
    const f = formData(ev); const p = curTip();
    try {
      await q(sb.from('pay_buys').insert({ period_id: p.id, employee_id: id, item: f.desc.trim(), qty: f.qty ? Number(f.qty) : null, unit: f.qty ? f.unit : '', unit_price: f.unitPrice ? Number(f.unitPrice) : null, amount: Number(f.price) }));
      if (f.unitPrice) await q(sb.from('buy_catalog').upsert({ slug: slug(f.desc), item: f.desc.trim(), unit: f.unit, unit_price: Number(f.unitPrice) }));
      toast('Achat ajouté.'); await loadPage(); App.buyForm(id);
    } catch (e) { fail(e); }
  },
  async buyDel(id, bid) { try { await q(sb.from('pay_buys').delete().eq('id', bid)); await loadPage(); App.buyForm(id); } catch (e) { fail(e); } },
  bankView(id) { const e = empP(id); if (!e) return; modal(`Banque d’heures · ${fullname(e)}`, bankAdmin(e, bankAll()), true); },
  async tipLock() { const p = curTip(); try { await q(sb.from('pay_periods').update({ locked: !p.locked }).eq('id', p.id)); toast(p.locked ? 'Paye déverrouillée.' : 'Paye verrouillée. Les montants ne peuvent plus être modifiés.'); await loadPage(); } catch (e) { fail(e); } },
  tipDelAsk() { const p = curTip(); modal(`Supprimer ${pLabel(p)}?`, `<p>Les montants, les heures et les achats de ${esc(pLabel(p))} (${fs(p.start)} au ${fd(p.end)}) seront effacés définitivement. Les banques d’heures seront recalculées.</p><div class="row"><button class="btn primary" style="background:var(--crit);border-color:var(--crit)" onclick="App.tipDel()">Supprimer</button><button class="btn ghost" onclick="App.close()">Annuler</button></div>`); },
  async tipDel() { const p = curTip(); try { await q(sb.from('pay_periods').delete().eq('id', p.id)); st.tipSel = null; closeModal(); toast('Paye supprimée.'); await loadPage(); } catch (e) { fail(e); } },
  tipCopy() {
    const p = curTip(), c = tipCalc(p); const fmt = n => String(n).replace('.', ',');
    const lines = [['Employé', 'Groupe', 'Heures travaillées', 'Heures à payer', 'Férié (h)', 'Férié ($)', 'Maladie payée ($)', 'Pourboire ($)', 'Banque (+/-)', 'Solde banque', 'Achats (h)'].join('\t'), ...tipRowsList(p).filter(x => x.h > 0 || (c.bk[x.id] && c.bk[x.id].ferH)).map(x => { const b = c.bk[x.id] || { tipH: 0, dep: 0, wd: 0, bal: 0, h: 0, ferH: 0 }; const sk = st.pay.sick.filter(z => z.employee_id === x.id && z.ind && z.start <= p.end && z.end >= p.start).reduce((t, z) => t + z.ind.total, 0); return [x.name, TG_LABEL[x.grp], fmt(x.h), fmt((b.h - b.dep + b.wd - (b.buyPay || 0)) / 100), fmt((b.ferH || 0) / 100), fmt((b.ferH ? ferAmt(x.id, p, b) / 100 : 0).toFixed(2)), fmt((sk / 100).toFixed(2)), fmt(((c.shares[x.id] || { total: 0 }).total / 100).toFixed(2)), fmt((b.dep - b.wd - (b.buyBank || 0)) / 100), fmt(b.bal / 100), fmt((b.buyH || 0) / 100)].join('\t'); }), ['Total', '', fmt(c.worked), fmt(payTotal(c)), fmt(ferTotal(c, p).h / 100), fmt((ferTotal(c, p).m / 100).toFixed(2)), '', fmt((c.dist / 100).toFixed(2)), '', '', ''].join('\t')].join('\n');
    try { navigator.clipboard.writeText(lines).then(() => toast('Tableau copié. Colle-le dans Excel.'), () => toast('La copie a été refusée par le navigateur.')); } catch (e) { toast('La copie a été refusée par le navigateur.'); }
  },
  async bankCap(ev) { const f = formData(ev); const v = Math.max(1, parseFloat(String(f.cap).replace(',', '.')) || 80); try { await q(sb.from('app_settings').update({ bank_cap: v }).eq('id', 1)); toast(`${fmtH(v)} heures normales par paye.`); await loadPage(); } catch (e) { fail(e); } },
  bankAdjForm(eid) {
    const e = empP(eid); const ps = tipPeriods();
    modal('Ajuster la banque d’heures', `<form class="stack" onsubmit="App.bankAdjSave(event,'${eid}')"><p class="muted">${esc(fullname(e))} · solde actuel ${fmtH((bankAll().bal[eid] || 0) / 100)} h</p>
    <div class="two"><label>Heures (+ pour ajouter, − pour retirer)<input type="number" step="0.25" name="hours" required placeholder="Ex. 12 ou -4"></label>${ps.length ? `<label>Appliquer à partir de<select name="payeId">${ps.map((p, i) => `<option value="${p.id}" ${i === 0 ? 'selected' : ''}>${esc(pLabel(p))} · ${fs(p.start)} au ${fd(p.end)}</option>`).join('')}</select></label>` : ''}</div>
    <label>Raison<input name="note" required placeholder="Ex. Solde reporté de l’ancien fichier Excel"></label><p class="small muted">Les heures sont ajoutées à la banque juste avant la paye choisie : elles peuvent donc compléter les heures de cette paye.</p>
    <div class="row"><button class="btn primary">Enregistrer</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
  },
  async bankAdjSave(ev, eid) { const f = formData(ev); try { await q(sb.from('bank_adj').insert({ employee_id: eid, period_id: f.payeId || null, date: TODAY, hours: Number(String(f.hours).replace(',', '.')) || 0, note: f.note.trim() })); closeModal(); toast('Banque ajustée.'); await loadPage(); } catch (e) { fail(e); } },
  async bankAdjDel(id) { if (!confirm('Retirer cet ajustement?')) return; try { await q(sb.from('bank_adj').delete().eq('id', id)); closeModal(); toast('Ajustement retiré.'); await loadPage(); } catch (e) { fail(e); } },

  /* Maladie */
  sickForm(eid, sid) {
    const e = empP(eid); const x = sid ? st.pay.sick.find(y => y.id === sid) : null; const ind = (x && x.ind) || {}; const sug = lastTwoPays(e);
    modal(x ? 'Indemnité de maladie' : 'Inscrire une absence maladie', `<form class="stack" onsubmit="App.sickSave(event,'${eid}','${sid || ''}')" oninput="App.sickCalc(this,'${eid}','${sid || ''}')">
    <p class="muted">Pour <b>${esc(fullname(e))}</b> · ${sickStats(e).left} jour(s) rémunéré(s) restant(s) cette année</p>
    <div class="two"><label>Du<input type="date" name="start" required value="${x ? x.start : TODAY}" ${x ? 'disabled' : ''}></label><label>Au (inclus)<input type="date" name="end" required value="${x ? x.end : TODAY}" ${x ? 'disabled' : ''}></label></div>
    ${x ? '' : '<label>Note (facultatif)<input name="note" placeholder="Ex. a appelé à 6 h"></label>'}
    <div class="panel stack" style="background:var(--blue);border:0;padding:16px"><div class="spread"><h3 style="color:var(--accent-text)">Montant à verser</h3>${sug ? `<button type="button" class="btn sm" style="background:var(--cream)" onclick="App.sickFill('${eid}','${sid || ''}')">Remplir avec les 2 dernières payes</button>` : ''}</div>
      <p class="small" style="color:var(--accent-text)">Salaire brut des 2 dernières payes complètes (4 semaines), sans les heures supplémentaires, divisé par 20.</p>
      <div class="two"><label>Avant-dernière paye ($)<input type="number" step="0.01" min="0" name="p1" value="${ind.p1 ?? ''}" placeholder="0,00"></label><label>Dernière paye ($)<input type="number" step="0.01" min="0" name="p2" value="${ind.p2 ?? ''}" placeholder="0,00"></label></div>
      <div id="sa-calc" class="small" style="color:#1E2A21"></div></div>
    <p id="sa-err" class="err" hidden></p><div class="row"><button class="btn primary">${x ? 'Enregistrer' : 'Inscrire'}</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
    App.sickCalc($('#modal form'), eid, sid || '');
  },
  sickPaidDays(e, start, end, sid) {
    const days = nDays(start, end); const el = eligibleFrom(e); if (start < el) return { days, paid: 0, reason: 'moins de 3 mois de service' };
    const y = +start.slice(0, 4); const al = sickAlloc(e, y); let used = 0; sickYear(e, y).forEach(z => { if (z.id !== sid && z.start < start) used += al[z.id] ? al[z.id].paid : 0; });
    const left = Math.max(0, quota() - used); return { days, paid: Math.min(days, left), left };
  },
  sickCalc(f, eid, sid) {
    if (!f) return; const e = empP(eid); const x = sid ? st.pay.sick.find(y => y.id === sid) : null; const s0 = x ? x.start : f.elements.start.value, s1 = x ? x.end : f.elements.end.value; const out = $('#sa-calc'); if (!out) return;
    if (!s0 || !s1 || s1 < s0) { out.textContent = ''; return; } const pd = App.sickPaidDays(e, s0, s1, sid); const p1 = toC(f.elements.p1.value), p2 = toC(f.elements.p2.value);
    const per = Math.round((p1 + p2) / 20); const tot = per * pd.paid;
    out.innerHTML = `<div class="spread" style="align-items:flex-end"><div>${pd.days} jour${pd.days > 1 ? 's' : ''} d’absence · <b>${pd.paid} jour${pd.paid > 1 ? 's' : ''} rémunéré${pd.paid > 1 ? 's' : ''}</b>${pd.reason ? ` (${pd.reason})` : pd.paid < pd.days ? ' (les autres jours ne sont pas rémunérés)' : ''}<br>${p1 + p2 ? `${fromC(p1 + p2)} ÷ 20 = <b>${fromC(per)} par jour</b>` : 'Entre le salaire des 2 dernières payes.'}</div>${p1 + p2 ? `<div style="text-align:right"><span class="small">À verser</span><br><span class="payh" style="font-size:1.8rem">${fromC(tot)}</span></div>` : ''}</div>`;
  },
  sickFill(eid, sid) { const sug = lastTwoPays(empP(eid)); if (!sug) return; const f = $('#modal form'); f.elements.p1.value = (sug[0] / 100).toFixed(2); f.elements.p2.value = (sug[1] / 100).toFixed(2); App.sickCalc(f, eid, sid); toast('Calculé avec les heures à payer × taux horaire. Vérifie avec ton logiciel de paye.'); },
  async sickSave(ev, eid, sid) {
    const f = formData(ev); const e = empP(eid); const err = m => { const el = $('#sa-err'); el.textContent = m; el.hidden = false; };
    const p1 = toC(f.p1), p2 = toC(f.p2); const per = Math.round((p1 + p2) / 20);
    try {
      if (sid) { const x = st.pay.sick.find(y => y.id === sid); const pd = App.sickPaidDays(e, x.start, x.end, sid); await q(sb.from('sick_days').update({ ind: p1 + p2 ? { p1: f.p1, p2: f.p2, per, paid: pd.paid, total: per * pd.paid } : null }).eq('id', sid)); closeModal(); toast('Indemnité enregistrée.'); return loadPage(); }
      if (f.end < f.start) return err('La date de fin doit suivre la date de début.');
      if (sickOf(e).some(x => x.start <= f.end && x.end >= f.start)) return err('Une absence est déjà inscrite pendant ces dates.');
      const pd = App.sickPaidDays(e, f.start, f.end, null);
      await q(sb.from('sick_days').insert({ employee_id: eid, start_date: f.start, end_date: f.end, note: (f.note || '').trim(), ind: p1 + p2 ? { p1: f.p1, p2: f.p2, per, paid: pd.paid, total: per * pd.paid } : null }));
      closeModal(); toast(p1 + p2 ? `Absence inscrite. À verser : ${fromC(per * pd.paid)}.` : 'Absence inscrite.'); await loadPage();
    } catch (x) { err(errMsg(x)); }
  },
  async sickDel(id) { if (!confirm('Retirer cette absence?')) return; try { await q(sb.from('sick_days').delete().eq('id', id)); toast('Absence retirée.'); await loadPage(); } catch (e) { fail(e); } },
  async sickQuota(ev) { const f = formData(ev); try { await q(sb.from('app_settings').update({ sick_per_year: Math.max(0, Math.min(10, parseInt(f.q, 10) || 0)) }).eq('id', 1)); toast('Enregistré.'); await loadPage(); } catch (e) { fail(e); } },

  /* Coffre */
  async vaultSetup(ev) {
    const f = formData(ev); const err = m => { const el = $('#vs-err'); el.textContent = m; el.hidden = false; };
    if (f.code.length < MIN_CODE) return err('Le code doit avoir au moins 12 caractères. Une phrase de 4 ou 5 mots est facile à retenir et très difficile à deviner.'); if (f.code !== f.code2) return err('Les deux codes ne sont pas identiques.');
    const btn = ev.submitter; if (btn) btn.disabled = true;
    try {
      const existing = await q(sb.from('vault_key').select('id')); if (existing.length) { if (btn) btn.disabled = false; return err('Le coffre est déjà activé. Recharge la page.'); }
      const kp = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
      const pub = await crypto.subtle.exportKey('spki', kp.publicKey), priv = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
      await q(sb.from('vault_key').insert({ id: 1, ...(await wrapPriv(priv, f.code)) }));
      await q(sb.from('vault_pub').insert({ id: 1, pub: b64(pub) }));
      V.key = await crypto.subtle.importKey('pkcs8', priv, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
      await logVault('Coffre activé'); armVault(); toast('Coffre activé. Les employés peuvent maintenant envoyer leurs documents.'); await loadPage();
    } catch (x) { if (btn) btn.disabled = false; err(errMsg(x)); }
  },
  async vaultUnlock(ev, next) {
    const f = formData(ev); const err = m => { const el = $('#vu-err'); el.textContent = m; el.hidden = false; };
    if (Date.now() < V.blocked) return err('Trop d’essais. Réessaie dans une minute.');
    try {
      const vk = (await q(sb.from('vault_key').select('*')))[0]; const priv = await unwrapPriv(vk, f.code);
      V.key = await crypto.subtle.importKey('pkcs8', priv, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']); V.fails = 0; armVault();
      if (next) App.vaultOpen(next); else render();
    } catch (x) {
      V.fails++;
      if (V.fails >= 5) { V.blocked = Date.now() + 60e3; V.fails = 0; err('Trop d’essais. Le coffre est bloqué pendant une minute.'); } else err(`Code incorrect. ${5 - V.fails} essai${5 - V.fails > 1 ? 's' : ''} restant${5 - V.fails > 1 ? 's' : ''}.`);
      logVault('Code erroné');
    }
  },
  vaultLock() { lockVault(); toast('Coffre verrouillé.'); },
  async vaultOpen(eid) {
    try {
      const e = (await q(sb.from('employees').select('id,first_name,last_name').eq('id', eid)))[0]; if (!e) return;
      if (!V.key) { modal('Code du coffre requis', `<p class="muted">Pour consulter les renseignements confidentiels de ${esc(fullname(e))}.</p>${unlockForm(eid)}`); return; }
      armVault(); const order = Object.keys(SECURE_KINDS);
      const items = (await q(sb.from('secure_items').select('*').eq('employee_id', eid))).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
      let html = '';
      for (const it of items) {
        let content = ''; try { const o = await openItem(it); content = it.kind === 'nas' ? `<div class="row"><span class="secret">${esc(fmtNas(o.value))}</span><button class="btn sm" onclick="App.copyText('${esc(o.value)}')">Copier</button></div>` : `<img class="secimg" src="${esc(o.value)}" alt="${esc(SECURE_KINDS[it.kind].label)}">`; } catch (x) { content = '<p class="err">Impossible de déchiffrer ce document.</p>'; }
        html += `<div class="vaultitem"><div class="spread"><div><h3>${SECURE_KINDS[it.kind].label}</h3><span class="muted small">Envoyé le ${fdt(it.created_at)}</span></div><button class="btn sm crit" onclick="App.vaultDestroy('${eid}','${it.id}','${it.kind}')">Détruire</button></div>${content}</div>`;
      }
      logVault('Consultation', e, null);
      modal(`Confidentiel · ${fullname(e)}`, `<div class="banner acc small"><div>Ces renseignements s’effacent de l’écran à la fermeture de cette fenêtre. Ne fais pas de capture d’écran.</div></div><div>${html || '<p class="muted">Aucun document.</p>'}</div>`, true);
    } catch (x) { fail(x); }
  },
  vaultDestroy(eid, id, kind) { modal('Détruire ce document?', `<p>Le document « ${SECURE_KINDS[kind].label} » sera effacé définitivement. L’employé devra l’envoyer de nouveau au besoin.</p><div class="row"><button class="btn primary" style="background:var(--crit);border-color:var(--crit)" onclick="App.vaultDestroyGo('${eid}','${id}','${kind}')">Détruire</button><button class="btn ghost" onclick="App.vaultOpen('${eid}')">Annuler</button></div>`); },
  async vaultDestroyGo(eid, id, kind) { try { const e = (await q(sb.from('employees').select('id,first_name,last_name').eq('id', eid)))[0]; await q(sb.from('secure_items').delete().eq('id', id)); await logVault('Destruction', e, kind); closeModal(); toast('Document détruit.'); await loadPage(); } catch (x) { fail(x); } },
  async vaultChange(ev) {
    const f = formData(ev); const err = m => { const el = $('#vc-err'); el.textContent = m; el.hidden = false; };
    if (f.nw.length < MIN_CODE) return err('Le nouveau code doit avoir au moins 12 caractères.'); if (f.nw !== f.cf) return err('Les deux nouveaux codes ne sont pas identiques.');
    try { const vk = (await q(sb.from('vault_key').select('*')))[0]; let priv; try { priv = await unwrapPriv(vk, f.old); } catch (e) { return err('Le code actuel est incorrect.'); }
      await q(sb.from('vault_key').update({ ...(await wrapPriv(priv, f.nw)), updated_at: new Date().toISOString() }).eq('id', 1)); await logVault('Code du coffre changé'); lockVault(true); toast('Code changé. Le coffre est verrouillé.'); await loadPage();
    } catch (x) { err(errMsg(x)); }
  },
  async togglePermis(eid) { const e = st.data.emp; try { await q(sb.from('employees').update({ needs_permis: !e.needs_permis }).eq('id', eid)); await loadPage(); } catch (x) { fail(x); } },
  copyText(t) { try { navigator.clipboard.writeText(t).then(() => toast('Copié.'), () => toast('Copie impossible. Sélectionne le numéro à la main.')); } catch (e) { toast('Copie impossible. Sélectionne le numéro à la main.'); } },
  logFilter(k, v) { st.logFilter[k] = v; st.logFilter.n = 20; render(); },
  logMore() { st.logFilter.n += 20; render(); },
  secRep(k) { st.secRep = k; render(); },
  previewPhoto(input, id) { const f = input.files[0], img = $('#' + id); if (!f) { img.hidden = true; return; } const r = new FileReader(); r.onload = () => { img.src = r.result; img.hidden = false; }; r.readAsDataURL(f); },
  async secureSend(ev, k) {
    ev.preventDefault(); const form = ev.target; const err = m => { const el = $('#err-' + k); el.textContent = m; el.hidden = false; };
    let value;
    if (k === 'nas') { const d = (form.elements.v.value || '').replace(/\D/g, ''); if (d.length !== 9) return err('Le NAS compte 9 chiffres.'); if (!luhn(d)) return err('Ce NAS ne semble pas valide. Vérifie les chiffres.'); value = d; }
    else { const file = form.elements.f.files[0]; if (!file) return err('Ajoute une photo.'); if (!/^image\//.test(file.type)) return err('Envoie une photo (JPG ou PNG).'); try { value = await resizeImage(file); } catch (x) { return err('Cette photo ne peut pas être lue. Essaie une photo JPG ou PNG.'); } }
    const btn = ev.submitter; if (btn) { btn.disabled = true; btn.textContent = 'Chiffrement en cours…'; }
    try { const sealed = await sealItem(st.data.vpub, { kind: k, value }); value = null; await q(sb.rpc('secure_put', { p_kind: k, p_wk: sealed.wk, p_iv: sealed.iv, p_ct: sealed.ct })); st.secRep = null; toast('Envoyé de façon sécurisée.'); await loadPage(); }
    catch (x) { if (btn) { btn.disabled = false; btn.innerHTML = LOCK_ICON + ' Envoyer de façon sécurisée'; } err(errMsg(x)); }
  },

  /* Accidents */
  accForm(aid) {
    const act = (st.data.emps || []).filter(x => x.active); const a = aid ? st.data.accs.find(x => x.id === aid) : { date: TODAY, kind: 'accident', place: 'Production', off_days: 0 }; const e = aid ? empById(a.employee_id) : null; const v = k => esc(a[k] || '');
    modal(aid ? `Accident · ${fullname(e) || 'Ancien employé'}` : 'Inscrire un accident', `<form class="stack" onsubmit="App.accSave(event,'${aid || ''}')">
    ${aid ? (a.declared_by === 'employé' ? '<div class="banner acc small"><div>Déclaré par l’employé. Complète les champs de la direction puis enregistre.</div></div>' : '') : `<label>Employé<select name="emp" required>${act.map(x => `<option value="${x.id}">${esc(fullname(x))} · ${esc(x.poste)}</option>`).join('')}</select></label>`}
    <div class="two"><label>Date<input type="date" name="date" required max="${TODAY}" value="${v('date')}"></label><label>Heure<input type="time" name="time" value="${v('time')}"></label>
    <label>Lieu<select name="place">${PLACES.map(m => `<option ${a.place === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <label>Type<select name="kind"><option value="incident" ${a.kind === 'incident' ? 'selected' : ''}>Incident sans blessure</option><option value="premiers" ${a.kind === 'premiers' ? 'selected' : ''}>Premiers soins seulement</option><option value="accident" ${a.kind === 'accident' ? 'selected' : ''}>Accident (soins médicaux ou arrêt)</option></select></label></div>
    <label>Blessure et partie du corps<input name="injury" value="${v('injury')}" placeholder="Ex. coupure, index gauche"></label>
    <label>Description des faits<textarea name="descr" required>${v('descr')}</textarea></label>
    <div class="two"><label>Témoins<input name="witness" value="${v('witness')}"></label><label>Premiers soins donnés par<input name="first_aid_by" value="${v('first_aid_by')}"></label>
    <label>Soins reçus<select name="aid">${['', 'Oui, sur place', 'Oui, à la clinique ou à l’hôpital'].map(o => `<option value="${o}" ${a.aid === o ? 'selected' : ''}>${o || 'Aucun'}</option>`).join('')}</select></label>
    <label>Jours d’arrêt de travail (après la journée de l’accident)<input type="number" min="0" name="off_days" value="${a.off_days || 0}"></label></div>
    <label class="check"><input type="checkbox" name="cnesst" ${a.cnesst ? 'checked' : ''}><span>La CNESST a été avisée</span></label>
    <label>Mesures correctives pour éviter que ça se reproduise<textarea name="actions" placeholder="Ex. tapis antidérapant ajouté près de la plonge">${v('actions')}</textarea></label>
    <div class="row"><button class="btn primary">Enregistrer au registre</button>${aid ? `<button type="button" class="btn ghost crit" onclick="App.accDel('${aid}')">Retirer du registre</button>` : ''}<button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`, true);
  },
  async accSave(ev, aid) {
    const f = formData(ev); const data = { date: f.date, time: f.time, place: f.place, kind: f.kind, injury: f.injury.trim(), descr: f.descr.trim(), witness: f.witness.trim(), first_aid_by: f.first_aid_by.trim(), aid: f.aid, off_days: Math.max(0, parseInt(f.off_days, 10) || 0), cnesst: !!f.cnesst, actions: f.actions.trim(), status: 'complété' };
    try { if (aid) await q(sb.from('accidents').update(data).eq('id', aid)); else await q(sb.from('accidents').insert({ ...data, employee_id: f.emp, declared_by: 'admin' })); closeModal(); toast('Registre mis à jour.'); await loadPage(); } catch (e) { fail(e); }
  },
  async accDel(aid) { if (!confirm('Retirer cet événement du registre?')) return; try { await q(sb.from('accidents').delete().eq('id', aid)); closeModal(); toast('Retiré du registre.'); await loadPage(); } catch (e) { fail(e); } },
  async accDeclare(ev) {
    const f = formData(ev); const er = $('#ad-err'); if (!f.desc.trim()) { er.textContent = 'Décris ce qui s’est passé.'; er.hidden = false; return; }
    const kind = f.aid === 'Oui, à la clinique ou à l’hôpital' ? 'accident' : (f.injury.trim() || f.aid) ? 'premiers' : 'incident';
    try { const r = await q(sb.from('accidents').insert({ employee_id: st.me.id, date: f.date, time: f.time, place: f.place, kind, injury: f.injury.trim(), descr: f.desc.trim(), witness: f.witness.trim(), aid: f.aid, declared_by: 'employé', status: 'à traiter' }).select('id').single()); notify('accident', r.id); toast('Déclaration envoyée. Prends soin de toi.'); await loadPage(); } catch (e) { er.textContent = errMsg(e); er.hidden = false; }
  },

  /* Clés */
  keyForm(eid) {
    modal('Inscrire une clé remise', `<form class="stack" onsubmit="App.keySave(event,'${eid}')"><p class="muted">Pour <b>${esc(fullname(st.data.emp))}</b></p>
    <label>Clé ou accès<input name="descr" required list="key-opts" placeholder="Ex. Clé magasin Laval"></label><datalist id="key-opts"><option>Clé magasin Laval</option><option>Clé magasin Montréal</option><option>Clé atelier de production</option><option>Carte d’alarme Laval</option><option>Carte d’alarme Montréal</option><option>Clé du casier</option></datalist>
    <div class="two"><label>Numéro de la clé (facultatif)<input name="number"></label><label>Remise le<input type="date" name="given" required value="${TODAY}"></label></div>
    <div class="row"><button class="btn primary">Inscrire</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
  },
  async keySave(ev, eid) {
    const f = formData(ev);
    try {
      await q(sb.from('keys_held').insert({ employee_id: eid, descr: f.descr.trim(), number: f.number.trim(), given: f.given }));
      const step = (st.data.onbSteps || []).find(t => /clé/i.test(t.label)); if (step && st.data.empOnb) await sb.from('onb_done').upsert({ employee_id: eid, step_id: step.id, done_at: f.given });
      closeModal(); toast('Clé inscrite au dossier.'); await loadPage();
    } catch (e) { fail(e); }
  },
  async keyReturn(id) { try { await q(sb.from('keys_held').update({ returned: TODAY }).eq('id', id)); toast('Clé marquée comme rendue.'); await loadPage(); } catch (e) { fail(e); } },

  /* Anniversaires */
  recogForm(eid, yrs, date) {
    const e = empById(eid); const msg = `Félicitations pour tes ${yrs} an${yrs > 1 ? 's' : ''} parmi nous, ${e.first_name}! Merci pour ton travail et ton engagement.`;
    modal(`Souligner les ${yrs} an${yrs > 1 ? 's' : ''} de ${e.first_name}`, `<form class="stack" onsubmit="App.recogSave(event,'${eid}',${yrs},'${date}')"><label>Message affiché dans son espace<textarea name="msg" required>${esc(msg)}</textarea></label>
    <div class="two"><label>Petite attention (facultatif)<input name="gift" placeholder="Ex. carte-cadeau, journée de congé"></label><label>Valeur ($, facultatif)<input type="number" step="0.01" min="0" name="value"></label></div>
    <p class="small muted">Une attention avec une valeur est ajoutée à ses avantages. ${esc(e.first_name)} recevra un courriel.</p><div class="row"><button class="btn primary">Souligner</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
  },
  async recogSave(ev, eid, yrs, date) {
    const f = formData(ev);
    try {
      const r = await q(sb.from('recognitions').insert({ employee_id: eid, years: yrs, date, msg: f.msg.trim(), gift: f.gift.trim() }).select('id').single());
      if (f.gift.trim() || f.value) await q(sb.from('perks').insert({ employee_id: eid, date: TODAY, descr: `${f.gift.trim() || 'Attention'} — ${yrs} an${yrs > 1 ? 's' : ''} de service`, value: f.value ? Number(f.value) : null }));
      notify('recog', r.id); closeModal(); toast('Anniversaire souligné.'); await loadPage();
    } catch (e) { fail(e); }
  },

  /* Formation */
  trainGo(lid) { st.trainCur = lid; render(); window.scrollTo(0, 0); },
  async trainDone(lid) { try { await q(sb.from('training_done').insert({ employee_id: st.me.id, lesson_id: lid, done_at: TODAY })); await loadPage(); const dm = doneMap(st.me.id); const n = trainFlat(st.me).find(x => !dm[x.l.id]); st.trainCur = n ? n.l.id : lid; render(); window.scrollTo(0, 0); toast(n ? 'Section complétée.' : 'Bravo, ta formation est terminée!'); } catch (e) { fail(e); } },
  trainModForm(id) {
    const m = id ? trainMods().find(x => x.id === id) : { title: '', aud: 'vente' };
    modal(id ? 'Modifier le module' : 'Nouveau module', `<form class="stack" onsubmit="App.trainModSave(event,'${id || ''}')"><div class="two"><label>Nom du module<input name="title" required value="${esc(m.title)}" placeholder="Ex. Nos départements"></label><label>Pour<select name="aud">${[['vente', 'Vente seulement'], ['prod', 'Production seulement'], ['all', 'Tout le monde']].map(([k, v]) => `<option value="${k}" ${m.aud === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div><div class="row"><button class="btn primary">Enregistrer</button>${id ? `<button type="button" class="btn ghost crit" onclick="App.trainModDel('${id}')">Supprimer le module</button>` : ''}<button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
  },
  async trainModSave(ev, id) { const f = formData(ev); try { if (id) await q(sb.from('training_modules').update({ title: f.title.trim(), aud: f.aud }).eq('id', id)); else await q(sb.from('training_modules').insert({ title: f.title.trim(), aud: f.aud, position: (trainMods().at(-1)?.position || 0) + 1 })); closeModal(); toast('Module enregistré.'); await loadPage(); } catch (e) { fail(e); } },
  async trainModDel(id) { if (!confirm('Supprimer ce module et toutes ses sections? La progression des employés sur ce module sera effacée.')) return; try { await q(sb.from('training_modules').delete().eq('id', id)); closeModal(); toast('Module supprimé.'); await loadPage(); } catch (e) { fail(e); } },
  async reorder(table, list, i, d) { const j = i + d; if (j < 0 || j >= list.length) return; const a = [...list];[a[i], a[j]] = [a[j], a[i]]; try { await Promise.all(a.map((x, k) => sb.from(table).update({ position: k + 1 }).eq('id', x.id))); await loadPage(); } catch (e) { fail(e); } },
  trainModMove(i, d) { App.reorder('training_modules', trainMods(), i, d); },
  trainLesMove(mid, i, d) { App.reorder('training_lessons', trainMods().find(m => m.id === mid).lessons, i, d); },
  trainLesForm(mid, lid) {
    const m = trainMods().find(x => x.id === mid); const l = lid ? m.lessons.find(x => x.id === lid) : { title: '', body: '' };
    modal(lid ? 'Modifier la section' : 'Ajouter une section', `<form class="stack" onsubmit="App.trainLesSave(event,'${mid}','${lid || ''}')"><p class="muted" style="margin-top:-6px">Module : ${esc(m.title)}</p><label>Titre<input name="title" required value="${esc(l.title)}" placeholder="Ex. La chocolaterie"></label><label>Contenu<textarea class="big" name="body" required>${esc(l.body)}</textarea></label><p class="small muted">Commence une ligne par un tiret (-) pour une liste. Laisse une ligne vide entre deux paragraphes. Entoure un mot de **deux astérisques** pour le mettre en gras.</p><div class="row"><button class="btn primary">Enregistrer</button>${lid ? `<button type="button" class="btn ghost crit" onclick="App.trainLesDel('${lid}')">Supprimer la section</button>` : ''}<button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`, true);
  },
  async trainLesSave(ev, mid, lid) { const f = formData(ev); const m = trainMods().find(x => x.id === mid); try { if (lid) await q(sb.from('training_lessons').update({ title: f.title.trim(), body: f.body }).eq('id', lid)); else await q(sb.from('training_lessons').insert({ module_id: mid, title: f.title.trim(), body: f.body, position: (m.lessons.at(-1)?.position || 0) + 1 })); closeModal(); toast('Section enregistrée.'); await loadPage(); } catch (e) { fail(e); } },
  async trainLesDel(lid) { if (!confirm('Supprimer cette section?')) return; try { await q(sb.from('training_lessons').delete().eq('id', lid)); closeModal(); await loadPage(); } catch (e) { fail(e); } },

  /* Auto-évaluation */
  evalYearTab(y) { st.evalYear = y; render(); },
  evalLaunchForm() {
    const cy = thisYear(); const n = (st.data.emps || []).filter(e => e.active).length; const due = new Date(); due.setDate(due.getDate() + 21);
    modal(`Lancer l’auto-évaluation ${cy}`, `<form class="stack" onsubmit="App.evalLaunch(event)"><p>Les <b>${n} employés actifs</b> recevront leur auto-évaluation en même temps, par courriel et sur leur page d’accueil.</p><label style="max-width:240px">À remettre avant le<input type="date" name="due" required value="${iso(due)}"></label><div class="row"><button class="btn primary">Envoyer à tout le monde</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
  },
  async evalCreate(ids, due) {
    const cy = thisYear(); const tpl = (await q(sb.from('eval_template').select('ratings,open')))[0];
    const rows = ids.map(id => ({ employee_id: id, year: cy, due: due || null, tpl: { ratings: tpl.ratings, open: tpl.open } }));
    const made = await q(sb.from('evals').insert(rows).select('id')); return made;
  },
  async evalLaunch(ev) {
    const f = formData(ev); const cy = thisYear(); const have = new Set((st.data.evals || []).filter(v => v.year === cy).map(v => v.employee_id));
    const ids = (st.data.emps || []).filter(e => e.active && !have.has(e.id)).map(e => e.id); if (!ids.length) return toast('Tout le monde a déjà son auto-évaluation.');
    try { const made = await App.evalCreate(ids, f.due); if (made[0]) notify('eval_launch', made[0].id); st.evalYear = cy; closeModal(); toast(`${made.length} auto-évaluation${made.length > 1 ? 's' : ''} envoyée${made.length > 1 ? 's' : ''}.`); await loadPage(); } catch (e) { fail(e); }
  },
  evalAddForm() {
    const cy = thisYear(); const list = (st.data.evals || []).filter(v => v.year === cy); const missing = (st.data.emps || []).filter(e => e.active && !list.some(v => v.employee_id === e.id)); const due = list.find(v => v.due)?.due || '';
    modal('Ajouter un employé', `<form class="stack" onsubmit="App.evalAdd(event)"><p class="small muted">Par exemple, un employé embauché après le lancement.</p><div class="list">${missing.map(e => `<label class="item check" style="font-weight:400"><input type="checkbox" name="e_${e.id}"><span class="grow"><b>${esc(fullname(e))}</b> <span class="small muted">· ${esc(e.poste)}</span></span></label>`).join('')}</div><input type="hidden" name="due" value="${due}"><div class="row"><button class="btn primary">Envoyer</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`);
  },
  async evalAdd(ev) {
    const f = formData(ev); const ids = Object.keys(f).filter(k => k.startsWith('e_')).map(k => k.slice(2)); if (!ids.length) return toast('Aucun employé choisi.');
    try { const made = await App.evalCreate(ids, f.due); made.forEach(m => notify('eval_remind', m.id)); closeModal(); toast(`${made.length} auto-évaluation${made.length > 1 ? 's' : ''} envoyée${made.length > 1 ? 's' : ''}.`); await loadPage(); } catch (e) { fail(e); }
  },
  evalRemindAll(y) { const v = (st.data.evals || []).find(x => x.year === y && x.status !== 'remise'); if (!v) return; notify('eval_launch', v.id); toast('Rappel envoyé par courriel aux retardataires.'); },
  evalRemind(id) { notify('eval_remind', id); toast('Rappel envoyé par courriel.'); },
  evalCollect(v) { const f = $('#ev-form'); const fd2 = new FormData(f); const a = { r: {}, o: {} }; v.tpl.ratings.forEach((t, i) => { const r = fd2.get('r' + i); if (r) a.r[i] = Number(r); }); v.tpl.open.forEach((t, i) => { a.o[i] = String(fd2.get('o' + i) || ''); }); return a; },
  async evalDraft(id) { const v = st.data.myEvals.find(x => x.id === id); try { await q(sb.rpc('eval_save', { p_id: id, p_answers: App.evalCollect(v), p_submit: false })); toast('Brouillon enregistré.'); await loadPage(); } catch (e) { fail(e); } },
  async evalSubmit(ev, id) {
    ev.preventDefault(); const v = st.data.myEvals.find(x => x.id === id); const a = App.evalCollect(v); const miss = v.tpl.ratings.filter((t, i) => !a.r[i]);
    if (miss.length) { const el = $('#ev-err'); el.textContent = `Il manque une note pour : ${miss.join(', ')}.`; el.hidden = false; return; }
    try { await q(sb.rpc('eval_save', { p_id: id, p_answers: a, p_submit: true })); notify('eval_done', id); await loadPage(); window.scrollTo(0, 0); toast('Merci! Ton auto-évaluation a été remise à la direction.'); } catch (e) { fail(e); }
  },
  async evalOpen(id) {
    const admin = st.role === 'admin'; const v = [...(st.data.evals || []), ...(st.data.empEvals || []), ...(st.data.myEvals || [])].find(x => x.id === id); if (!v) return;
    let note = '';
    if (admin) { try { if (!v.seen) { await q(sb.from('evals').update({ seen: true }).eq('id', id)); v.seen = true; } note = (await q(sb.from('eval_notes').select('note').eq('eval_id', id)))[0]?.note || ''; } catch (e) { fail(e); } render(); }
    const e = admin ? empById(v.employee_id) || st.data.emp : st.me;
    modal(`Auto-évaluation · ${e ? fullname(e) : ''}`, `${evalAnswers(v)}${admin ? `<form class="stack" onsubmit="App.evalNote(event,'${id}')" style="margin-top:12px"><label>Mes notes pour la révision salariale (visibles seulement par toi)<textarea name="note">${esc(note)}</textarea></label><div class="row"><button class="btn">Enregistrer la note</button><button type="button" class="btn primary" onclick="App.close();App.openEmp('${v.employee_id}','salaire')">Voir son salaire</button></div></form>` : ''}`, true);
  },
  async evalNote(ev, id) { const f = formData(ev); try { await q(sb.from('eval_notes').upsert({ eval_id: id, note: f.note })); toast('Note enregistrée.'); } catch (e) { fail(e); } },
  async evalTplForm() {
    const t = (await q(sb.from('eval_template').select('*')))[0];
    modal('Questions de l’auto-évaluation', `<form class="stack" onsubmit="App.evalTplSave(event)"><label>Points à noter de 1 à 5 (un par ligne)<textarea class="big" name="ratings" style="min-height:180px">${esc(t.ratings.join('\n'))}</textarea></label><label>Questions à développement (une par ligne)<textarea class="big" name="open" style="min-height:150px">${esc(t.open.join('\n'))}</textarea></label><p class="small muted">Les auto-évaluations déjà envoyées gardent leurs questions.</p><div class="row"><button class="btn primary">Enregistrer</button><button type="button" class="btn ghost" onclick="App.close()">Annuler</button></div></form>`, true);
  },
  async evalTplSave(ev) { const f = formData(ev); const L = x => x.split('\n').map(y => y.trim()).filter(Boolean); try { await q(sb.from('eval_template').update({ ratings: L(f.ratings), open: L(f.open) }).eq('id', 1)); closeModal(); toast('Questions enregistrées.'); } catch (e) { fail(e); } },

  /* Liste d'accueil */
  async onbStart(eid) { try { await q(sb.from('onb').insert({ employee_id: eid })); await loadPage(); } catch (e) { fail(e); } },
  async onbToggle(eid, sid, done) { try { if (done) await q(sb.from('onb_done').delete().eq('employee_id', eid).eq('step_id', sid)); else await q(sb.from('onb_done').insert({ employee_id: eid, step_id: sid, done_at: TODAY })); await loadPage(); } catch (e) { fail(e); } },
  async onbClose(eid, close) { try { await q(sb.from('onb').update({ closed: close ? TODAY : null }).eq('employee_id', eid)); toast(close ? 'Liste d’accueil fermée.' : 'Liste rouverte.'); await loadPage(); } catch (e) { fail(e); } },
  onbRemind(eid) { notify('onb_remind', eid); toast('Rappel envoyé par courriel.'); },
  async onbTplForm() {
    const steps = await q(sb.from('onb_steps').select('*').order('position'));
    modal('Étapes de la liste d’accueil', `<p class="small muted">Ces étapes sont faites par toi. Les étapes de l’employé (mot de passe, fiche, documents confidentiels, contrat, cahier) se cochent automatiquement.</p><div class="list">${steps.map(t => `<div class="item"><div class="grow"><b>${esc(t.label)}</b></div><button class="btn sm ghost" onclick="App.onbTplDel('${t.id}')">Retirer</button></div>`).join('') || '<p class="empty">Aucune étape.</p>'}</div>
    <form class="row" onsubmit="App.onbTplAdd(event,${(steps.at(-1)?.position || 0) + 1})" style="align-items:flex-end"><label style="flex:1">Nouvelle étape<input name="label" required placeholder="Ex. Photo pour le babillard"></label><button class="btn primary">Ajouter</button></form>`);
  },
  async onbTplAdd(ev, pos) { const f = formData(ev); try { await q(sb.from('onb_steps').insert({ label: f.label.trim(), position: pos })); await App.onbTplForm(); await loadPage(); } catch (e) { fail(e); } },
  async onbTplDel(id) { if (!confirm('Retirer cette étape de toutes les listes?')) return; try { await q(sb.from('onb_steps').delete().eq('id', id)); await App.onbTplForm(); await loadPage(); } catch (e) { fail(e); } },

  async backup() {
    const btn = $('#bk-btn'); const lbl = btn ? btn.textContent : ''; const out = { app: 'Espace équipe Marius & Fanny', format: 1, created_at: new Date().toISOString(), tables: {}, skipped: [] };
    try {
      let i = 0;
      for (const t of BACKUP_TABLES) {
        i++; if (btn) { btn.disabled = true; btn.textContent = `Préparation… ${Math.round(i / BACKUP_TABLES.length * 100)} %`; }
        const rows = []; let from = 0; let ok = true;
        while (true) { const { data, error } = await sb.from(t).select('*').range(from, from + 999); if (error) { ok = false; break; } rows.push(...data); if (data.length < 1000) break; from += 1000; }
        if (ok) out.tables[t] = rows; else out.skipped.push(t);
      }
      const blob = new Blob([JSON.stringify(out)], { type: 'application/json' }); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `sauvegarde-espace-equipe-${TODAY}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      try { localStorage.setItem('mf-last-backup', new Date().toISOString()); } catch (e) {}
      logVault('Copie de sauvegarde téléchargée');
      const n = Object.values(out.tables).reduce((t, r) => t + r.length, 0);
      toast(`Copie téléchargée (${n} éléments). Range-la dans ton Google Drive.`); render();
    } catch (e) { fail(e); if (btn) { btn.disabled = false; btn.textContent = lbl; } }
  },

  /* Courriels */
  async mailSettings(ev) { const f = formData(ev); const off = Object.keys(MAIL_KINDS).filter(k => !f['k_' + k]); try { await q(sb.from('app_settings').update({ notify_email: (f.notify_email || '').trim(), mail_off: off, updated_at: new Date().toISOString() }).eq('id', 1)); toast('Réglages enregistrés.'); await loadPage(); } catch (e) { fail(e); } },

  async rsvp(id, v) { try { await q(sb.from('news_rsvp').upsert({ news_id: id, employee_id: st.me.id, answer: v, answered_at: new Date().toISOString() })); toast(v === 'oui' ? 'Ta participation est confirmée.' : 'Merci de nous avoir avisés.'); await loadPage(); } catch (e) { fail(e); } },
};
window.App = App;
boot();
