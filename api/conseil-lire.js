// api/conseil-lire.js
// -----------------------------------------------------------------------------
// EUREKA Thérapie — Lecture publique du « conseil du mois »
// -----------------------------------------------------------------------------
// Appelée par conseils.html au chargement de page.
// Renvoie un JSON minimal : { month, title, body }.
//
// Mode admin : si l'URL contient ?admin=<ADMIN_VIEW_KEY>, on renvoie en plus
// le bloc facebookPost prêt-à-coller (utile pour Mickaël qui poste à la main
// sur son profil Facebook, vu qu'on ne peut pas auto-poster sur un profil perso).
//
// Variables d'environnement Vercel requises :
//   - GITHUB_REPO        (ex: "mickaelodonnat/eureka")
//   - GITHUB_BRANCH      (ex: "main")
//   - ADMIN_VIEW_KEY     (chaîne secrète, utilisée dans l'URL ?admin=...)
// -----------------------------------------------------------------------------

export default async function handler(req, res) {
  try {
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    if (!repo) {
      throw new Error("GITHUB_REPO non configuré.");
    }

    // Cache léger côté Vercel (5 minutes) pour ne pas marteler GitHub
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");

    // Lecture via raw.githubusercontent (pas besoin de token pour repo public)
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/conseils-data.json`;
    const ghRes = await fetch(url, {
      headers: { "User-Agent": "eureka-conseil-reader" },
      // Force fresh: pas de cache côté fetch pour que Vercel garde la main
      cache: "no-store",
    });
    if (!ghRes.ok) {
      throw new Error(`Impossible de lire conseils-data.json (${ghRes.status})`);
    }
    const data = await ghRes.json();
    const c = data.currentConseil || {};

    // Mode admin (révèle le post Facebook prêt-à-coller)
    const adminKey = (req.query && req.query.admin) || "";
    const isAdmin = process.env.ADMIN_VIEW_KEY && adminKey === process.env.ADMIN_VIEW_KEY;

    const payload = {
      month: data.currentMonth || null,
      title: c.title || "",
      themeLabel: c.themeLabel || "",
      body: c.body || [],
      generatedAt: c.generatedAt || null,
    };
    if (isAdmin) {
      payload.facebookPost = c.facebookPost || "";
      payload.theme = c.theme || "";
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error("[conseil-lire] erreur :", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
