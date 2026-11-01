// Fonction « invite-employee » — Espace équipe Marius & Fanny
// Crée le dossier d'un employé et lui envoie un courriel d'invitation pour choisir son mot de passe.
// Seule l'administratrice (connectée avec la validation en deux étapes) peut l'appeler.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://rh.mariusetfanny.com";

    // 1) Vérifier que l'appel vient bien de l'administratrice
    const asCaller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: isAdmin, error: e1 } = await asCaller.rpc("is_admin");
    if (e1 || !isAdmin) return json({ error: "Accès refusé." }, 403);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const body = await req.json();
    const action = body.action ?? "invite";

    if (action === "resend") {
      const { data: emp } = await admin.from("employees").select("email").eq("id", body.employee_id).single();
      if (!emp) return json({ error: "Employé introuvable." }, 404);
      const { error } = await admin.auth.admin.inviteUserByEmail(emp.email, { redirectTo: siteUrl });
      if (error) {
        // Compte déjà actif : envoyer plutôt un lien pour choisir un nouveau mot de passe
        const { error: e2 } = await admin.auth.resetPasswordForEmail(emp.email, { redirectTo: siteUrl });
        if (e2) return json({ error: e2.message }, 400);
        return json({ ok: true, mode: "reset" });
      }
      return json({ ok: true, mode: "invite" });
    }

    // 2) Valider les champs
    const email = String(body.email ?? "").trim().toLowerCase();
    const first = String(body.first_name ?? "").trim();
    const last = String(body.last_name ?? "").trim();
    if (!email || !first || !last) return json({ error: "Prénom, nom et courriel sont obligatoires." }, 400);

    // 3) Envoyer l'invitation (crée le compte de connexion)
    const { data: inv, error: e3 } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: siteUrl });
    if (e3) return json({ error: e3.message.includes("already") ? "Ce courriel est déjà utilisé." : e3.message }, 400);
    const userId = inv.user.id;

    // 4) Créer le dossier, le profil et le salaire de départ
    const { data: emp, error: e4 } = await admin.from("employees").insert({
      user_id: userId, first_name: first, last_name: last, email,
      poste: body.poste ?? "", magasin: body.magasin ?? "Laval", tip_group: body.tip_group ?? "laval",
      start_date: body.start_date ?? new Date().toISOString().slice(0, 10),
    }).select().single();
    if (e4) { await admin.auth.admin.deleteUser(userId); return json({ error: e4.message }, 400); }
    await admin.from("profiles").upsert({ id: userId, role: "employee" });
    if (body.rate) await admin.from("salary_history").insert({ employee_id: emp.id, effective: emp.start_date, rate: body.rate, note: "Salaire à l’embauche" });

    return json({ ok: true, employee: emp });
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
