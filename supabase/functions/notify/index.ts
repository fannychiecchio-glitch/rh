// Fonction « notify » — Espace équipe Marius & Fanny
// Envoie les avis par courriel (demande de vacances, réponse, avertissement, contrat, message, nouvelle).
// Le site indique seulement QUEL événement vient d'arriver (type + identifiant). La fonction vérifie
// que la personne connectée a le droit de le signaler, trouve elle-même le destinataire dans la base
// et envoie un courriel court qui ne contient aucun renseignement confidentiel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Mail = { to: string[]; bcc?: boolean; subject: string; lines: string[]; empId?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const site = Deno.env.get("SITE_URL") ?? "https://rh.mariusetfanny.com/";
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpUser || !smtpPass) return json({ error: "Courriels non configurés (secrets SMTP_USER et SMTP_PASS)." }, 503);

    const asCaller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await asCaller.auth.getUser();
    if (!user) return json({ error: "Accès refusé." }, 401);
    const { data: isAdmin } = await asCaller.rpc("is_admin");
    const db = createClient(url, service, { auth: { persistSession: false } });

    const { kind, id } = await req.json();
    if (typeof kind !== "string" || typeof id !== "string") return json({ error: "Requête invalide." }, 400);

    // Employé connecté (s'il y a lieu)
    const { data: meRow } = await db.from("employees").select("id").eq("user_id", user.id).eq("active", true).maybeSingle();
    const myEmp = meRow?.id as string | undefined;

    // Réglages : adresse de la direction et types désactivés
    const { data: set } = await db.from("app_settings").select("notify_email, mail_off").eq("id", 1).maybeSingle();
    const off: string[] = set?.mail_off ?? [];
    let adminTo = (set?.notify_email ?? "").trim();
    if (!adminTo) {
      const { data: adm } = await db.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
      if (adm) { const { data: u } = await db.auth.admin.getUserById(adm.id); adminTo = u?.user?.email ?? ""; }
    }

    const emp = async (empId: string) => {
      const { data: e } = await db.from("employees").select("id, first_name, last_name, email, active").eq("id", empId).single();
      const { data: i } = await db.from("employee_info").select("email_perso").eq("employee_id", empId).maybeSingle();
      return { ...e, to: (i?.email_perso || e?.email) as string, name: `${e?.first_name} ${e?.last_name}` };
    };
    const deny = () => json({ error: "Accès refusé." }, 403);

    let mail: Mail | null = null;
    switch (kind) {
      case "leave_request": { // employé → direction
        const { data: l } = await db.from("leave_requests").select("employee_id, type, start_date, end_date").eq("id", id).single();
        if (!l || l.employee_id !== myEmp) return deny();
        const e = await emp(l.employee_id);
        mail = { to: [adminTo], subject: `Demande de vacances de ${e.name}`, lines: [`Bonjour,`, `${e.name} a fait une demande (${String(l.type).toLowerCase()}) du ${fr(l.start_date)} au ${fr(l.end_date)}.`] };
        break;
      }
      case "leave_answer": { // direction → employé
        if (!isAdmin) return deny();
        const { data: l } = await db.from("leave_requests").select("employee_id, status").eq("id", id).single();
        if (!l) return deny();
        const e = await emp(l.employee_id);
        const sub = l.status === "contre-proposition" ? "D’autres dates te sont proposées" : "Réponse à ta demande de vacances";
        const txt = l.status === "contre-proposition" ? "La direction te propose d’autres dates pour ta demande de vacances. Accepte-les ou refuse-les dans ton espace." : "Ta demande de vacances a reçu une réponse.";
        mail = { to: [e.to], subject: sub, lines: [`Bonjour ${e.first_name},`, txt], empId: e.id };
        break;
      }
      case "warning": {
        if (!isAdmin) return deny();
        const { data: w } = await db.from("warnings").select("employee_id").eq("id", id).single();
        if (!w) return deny();
        const e = await emp(w.employee_id);
        mail = { to: [e.to], subject: "Un document important t’attend", lines: [`Bonjour ${e.first_name},`, "La direction a déposé un document dans ton dossier. Tu dois le lire et confirmer en avoir pris connaissance."], empId: e.id };
        break;
      }
      case "contract": {
        if (!isAdmin) return deny();
        const { data: c } = await db.from("contracts").select("employee_id").eq("id", id).single();
        if (!c) return deny();
        const e = await emp(c.employee_id);
        mail = { to: [e.to], subject: "Ton contrat de travail est prêt", lines: [`Bonjour ${e.first_name},`, "Ton contrat de travail est prêt. Lis-le attentivement et signe-le électroniquement dans la section « Mon contrat »."], empId: e.id };
        break;
      }
      case "contract_signed": { // employé → direction
        const { data: c } = await db.from("contracts").select("employee_id, title, admin_sig_at, emp_sig_at").eq("id", id).single();
        if (!c || c.employee_id !== myEmp || !c.emp_sig_at) return deny();
        const e = await emp(c.employee_id);
        mail = { to: [adminTo], subject: `${e.name} a signé son contrat`, lines: ["Bonjour,", `${e.name} a signé son contrat (${c.title}).${c.admin_sig_at ? " Le contrat est maintenant signé par les deux parties." : " Il reste ta signature."}`] };
        break;
      }
      case "message_new": { // employé → direction (nouvelle conversation ou nouveau message)
        const { data: t } = await db.from("threads").select("employee_id, subject").eq("id", id).single();
        if (!t || t.employee_id !== myEmp) return deny();
        const e = await emp(t.employee_id);
        mail = { to: [adminTo], subject: `Nouveau message de ${e.name}`, lines: ["Bonjour,", `${e.name} t’a écrit au sujet de « ${t.subject} ».`] };
        break;
      }
      case "message_reply": { // direction → employé
        if (!isAdmin) return deny();
        const { data: t } = await db.from("threads").select("employee_id").eq("id", id).single();
        if (!t) return deny();
        const e = await emp(t.employee_id);
        mail = { to: [e.to], subject: "La direction a répondu à ton message", lines: [`Bonjour ${e.first_name},`, "La direction a répondu à ton message dans l’espace équipe."], empId: e.id };
        break;
      }
      case "news": { // direction → tous les employés actifs (en copie cachée)
        if (!isAdmin) return deny();
        const { data: n } = await db.from("news").select("title").eq("id", id).single();
        if (!n) return deny();
        const { data: all } = await db.from("employees").select("id, email").eq("active", true).not("user_id", "is", null);
        const { data: infos } = await db.from("employee_info").select("employee_id, email_perso");
        const to = (all ?? []).map((e) => infos?.find((i) => i.employee_id === e.id)?.email_perso || e.email).filter(Boolean);
        mail = { to, bcc: true, subject: `Nouvelle : ${n.title}`, lines: ["Bonjour,", `Une nouvelle a été publiée dans l’espace équipe : « ${n.title} ».`] };
        break;
      }
      case "accident": { // employé → direction
        const { data: a } = await db.from("accidents").select("employee_id, date, place").eq("id", id).single();
        if (!a || a.employee_id !== myEmp) return deny();
        const e = await emp(a.employee_id);
        mail = { to: [adminTo], subject: `Accident déclaré par ${e.name}`, lines: ["Bonjour,", `${e.name} a déclaré un accident de travail survenu le ${fr(a.date)} (${a.place}). Complète la fiche dans le registre.`] };
        break;
      }
      case "eval_launch": { // direction → tous ceux qui n'ont pas remis l'auto-évaluation de l'année (copie cachée)
        if (!isAdmin) return deny();
        const { data: v } = await db.from("evals").select("year").eq("id", id).single();
        if (!v) return deny();
        const { data: list } = await db.from("evals").select("employee_id, due").eq("year", v.year).neq("status", "remise");
        const to: string[] = [];
        for (const x of list ?? []) { const e = await emp(x.employee_id); if (e.active && e.to) to.push(e.to); }
        const due = list?.find((x) => x.due)?.due;
        mail = { to, bcc: true, subject: "Ton auto-évaluation annuelle", lines: ["Bonjour,", `La direction t’invite à remplir ton auto-évaluation annuelle${due ? ` avant le ${fr(due)}` : ""}. Elle se trouve dans ton espace, section « Auto-évaluation ».`] };
        break;
      }
      case "eval_remind": {
        if (!isAdmin) return deny();
        const { data: v } = await db.from("evals").select("employee_id, due").eq("id", id).single();
        if (!v) return deny();
        const e = await emp(v.employee_id);
        mail = { to: [e.to], subject: "Rappel : ton auto-évaluation", lines: [`Bonjour ${e.first_name},`, `Petit rappel : ton auto-évaluation est à remplir${v.due ? ` avant le ${fr(v.due)}` : ""}.`], empId: e.id };
        break;
      }
      case "eval_done": { // employé → direction
        const { data: v } = await db.from("evals").select("employee_id, status").eq("id", id).single();
        if (!v || v.employee_id !== myEmp || v.status !== "remise") return deny();
        const e = await emp(v.employee_id);
        mail = { to: [adminTo], subject: `Auto-évaluation remise par ${e.name}`, lines: ["Bonjour,", `${e.name} a remis son auto-évaluation.`] };
        break;
      }
      case "recog": {
        if (!isAdmin) return deny();
        const { data: r } = await db.from("recognitions").select("employee_id, years").eq("id", id).single();
        if (!r) return deny();
        const e = await emp(r.employee_id);
        mail = { to: [e.to], subject: "Joyeux anniversaire de service!", lines: [`Bonjour ${e.first_name},`, `On souligne tes ${r.years} an${r.years > 1 ? "s" : ""} dans l’équipe. Un petit mot t’attend dans ton espace.`], empId: e.id };
        break;
      }
      case "onb_remind": { // id = identifiant de l'employé
        if (!isAdmin) return deny();
        const e = await emp(id);
        if (!e?.id) return deny();
        mail = { to: [e.to], subject: "Il te reste des étapes à faire", lines: [`Bonjour ${e.first_name},`, "Pour compléter ton arrivée, il te reste quelques étapes à faire dans ton espace (fiche d’embauche, contrat, documents confidentiels ou cahier de l’employé)."], empId: e.id };
        break;
      }
      default: return json({ error: "Type inconnu." }, 400);
    }

    if (off.includes(kind)) return json({ ok: true, skipped: "désactivé" });
    if (!mail.to.length || !mail.to[0]) return json({ ok: true, skipped: "aucun destinataire" });

    // Anti-doublon : pas deux fois le même avis en moins d'une minute
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await db.from("notify_log").select("id", { count: "exact", head: true }).eq("kind", kind).eq("ref_id", id).gte("at", since);
    if ((count ?? 0) > 0) return json({ ok: true, skipped: "doublon" });

    const text = `${mail.lines.join("\n\n")}\n\nConnecte-toi pour voir les détails :\n${site}\n\n— Espace équipe Marius & Fanny\nCe courriel est automatique. N’y réponds pas.`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1E2A21;max-width:520px">${mail.lines.map((l) => `<p>${escH(l)}</p>`).join("")}<p><a href="${site}" style="display:inline-block;background:#34513A;color:#FFF5E1;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Ouvrir l’espace équipe</a></p><p style="color:#6b6b6b;font-size:12px">— Espace équipe Marius &amp; Fanny<br>Ce courriel est automatique. N’y réponds pas.</p></div>`;

    const transport = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com",
      port: Number(Deno.env.get("SMTP_PORT") ?? 465),
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });
    const from = `${Deno.env.get("SMTP_FROM_NAME") ?? "Espace équipe Marius & Fanny"} <${Deno.env.get("SMTP_FROM") ?? smtpUser}>`;
    const toLog = mail.bcc ? `${mail.to.length} employés` : mail.to.join(", ");
    try {
      await transport.sendMail(mail.bcc ? { from, to: from, bcc: mail.to, subject: mail.subject, text, html } : { from, to: mail.to, subject: mail.subject, text, html });
      await db.from("notify_log").insert({ kind, ref_id: id, to_addr: toLog, subject: mail.subject });
      return json({ ok: true });
    } catch (err) {
      await db.from("notify_log").insert({ kind, ref_id: id, to_addr: toLog, subject: mail.subject, ok: false, error: String((err as Error)?.message ?? err).slice(0, 300) });
      return json({ error: "L’envoi du courriel a échoué." }, 502);
    }
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});

function fr(d: string) {
  return new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
}
function escH(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
