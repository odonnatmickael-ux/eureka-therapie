// api/conseil-generate.js
// -----------------------------------------------------------------------------
// EUREKA Thérapie — Génération mensuelle automatique du « conseil du mois »
// -----------------------------------------------------------------------------
// Appelée par GitHub Action le 1er lundi du mois à 6h UTC.
// Fait 4 choses :
//   1. Lit conseils-data.json depuis GitHub (pour connaître les 6 derniers thèmes)
//   2. Appelle Claude API avec un prompt qui exclut ces thèmes
//   3. Applique une modération regex (rejette si mots interdits → retry une fois)
//   4. Pousse le nouveau JSON sur GitHub (auto-commit signé par le bot)
//
// Variables d'environnement Vercel requises :
//   - ANTHROPIC_API_KEY    (clé Claude API, déjà existante chez Vercel)
//   - GITHUB_TOKEN         (Personal Access Token, scope `repo`)
//   - GITHUB_REPO          (ex: "mickaelodonnat/eureka")
//   - GITHUB_BRANCH        (ex: "main")
//   - CRON_SECRET          (chaîne aléatoire, partagée avec le workflow)
// -----------------------------------------------------------------------------

const CLAUDE_MODEL = "claude-sonnet-4-6";
const MAX_RECENT_THEMES = 6;

// Liste de mots/expressions interdits dans le contenu généré.
// Si l'un d'eux apparaît, on retry une fois ; si ça échoue encore, on abandonne.
const BANLIST = [
  // Pseudo-science
  /\bscientifiquement\b/i,
  /\b21\s*jours?\b.{0,40}(habitude|cerveau|ancr|science|neuro)/is,
  /(habitude|cerveau|ancr|neuro).{0,40}\b21\s*jours?\b/is,
  /\bneuroplasticit[ée]\b/i,
  /\brewir(e|ing)\b/i,
  /cerveau.{0,20}ancre/is,
  // Vocabulaire clinique direct (anti-extrapolation)
  /\bdeuil\b/i,
  /\btrauma(tisme)?\b/i,
  /\bd[ée]pression\b/i,
  /\bburn[\s-]?out\b/i,
  // Promesses de guérison
  /\bgu[ée]rit\b/i,
  /\bgu[ée]rir\s+(l[ae'])\s*\w+/i,
  /\bgu[ée]rison\b/i,
  /\bsoigne\b/i,
  /\bsupprime\b.{0,30}(anxi|stress|d[ée]press|peur)/is,
  /\b100\s*%\b/,
  /\b[àa]\s*coup\s*s[ûu]r\b/i,
  /\bgaranti(e|t)?\b/i,
  // Référence médicale risquée
  /\bremplace\s+(un|le|votre)\s+(m[ée]decin|th[ée]rapeute|psy)/is,
];

// 36 thèmes de réservoir, neutres et alignés sur sophrologie / hypnose
// ericksonienne / méthode Silva (le porteur du projet est triple-certifié).
const THEME_POOL = [
  "respiration_apaisement",
  "ancrage_corporel_simple",
  "transition_jour_nuit",
  "matin_premiers_gestes",
  "ralentir_avant_chaos",
  "attention_au_sensoriel",
  "presence_aux_personnes_proches",
  "marcher_consciemment",
  "boire_un_verre_deau_en_pleine_presence",
  "ecouter_le_silence",
  "la_pause_de_trois_minutes",
  "le_geste_des_epaules",
  "regarder_loin_pour_se_reposer",
  "le_temps_du_souffle_long",
  "deposer_les_charges_invisibles",
  "remarquer_ce_qui_va_bien",
  "le_visage_qui_se_detend",
  "la_voix_interieure_bienveillante",
  "accueillir_une_emotion_sans_lutter",
  "le_pas_de_cote_mental",
  "la_main_qui_se_pose_sur_le_coeur",
  "la_nuque_qui_relache",
  "le_petit_rituel_du_soir",
  "redecouvrir_la_lenteur",
  "le_corps_comme_repere",
  "la_chaleur_des_paumes",
  "sentir_le_poids_du_corps",
  "le_seuil_de_la_porte",
  "trois_choses_qui_apaisent",
  "le_regard_qui_se_repose",
  "la_respiration_ventrale",
  "le_pied_qui_touche_le_sol",
  "ecouter_un_son_familier",
  "le_silence_partagé",
  "la_lumiere_du_matin",
  "la_pause_avant_de_parler",
];

// -----------------------------------------------------------------------------
//                              GITHUB HELPERS
// -----------------------------------------------------------------------------

async function ghReadJson(repo, branch, token, path) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "eureka-conseil-bot",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub read ${path} → ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const decoded = Buffer.from(data.content, "base64").toString("utf-8");
  return { sha: data.sha, json: JSON.parse(decoded) };
}

async function ghWriteJson(repo, branch, token, path, sha, json, commitMessage) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const body = {
    message: commitMessage,
    branch,
    sha,
    content: Buffer.from(JSON.stringify(json, null, 2), "utf-8").toString("base64"),
    committer: {
      name: "eureka-conseil-bot",
      email: "bot@eureka-therapie.com",
    },
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "eureka-conseil-bot",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub write ${path} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// -----------------------------------------------------------------------------
//                              CLAUDE API CALL
// -----------------------------------------------------------------------------

function buildPrompt(theme, recentThemes) {
  return `Tu rédiges « Le conseil du mois » pour EUREKA Thérapie, une application web qui propose des séances de sophrologie personnalisées par IA. Le porteur du projet est triple-certifié (Sophrologie Caycedienne, Méthode Silva, Hypnose Ericksonienne) — son sérieux éditorial est non-négociable.

PUBLIC : grand public francophone adulte. Personnes curieuses, ouvertes au bien-être, mais qui détestent le baratin et la pseudo-science.

THÈME DU MOIS : ${theme}

RÈGLES ABSOLUES :
1. AUCUNE pseudo-science. Ne JAMAIS dire que quelque chose « ancre une habitude dans le cerveau en 21 jours », ne pas évoquer « neuroplasticité », ne pas affirmer une durée précise sans source réelle.
2. AUCUN vocabulaire clinique direct : pas de « deuil », « dépression », « trauma », « burn-out », « anxiété généralisée » comme étiquette du lecteur. Préférer : « ce que vous traversez », « une période difficile », « une charge », « un poids ».
3. AUCUNE promesse de guérison. Ne pas dire « guérit », « supprime », « 100% », « garanti », « à coup sûr ».
4. Pas d'extrapolation : ne pas deviner âge, situation, contexte du lecteur. Parler d'expériences universelles.
5. Ton : posé, doux, adulte. Pas de tutoiement familier, pas d'emojis dans le corps du texte, pas d'exclamations. Style proche d'un guide qui invite, jamais d'un coach qui injoncte.
6. Pas de référence à EUREKA dans le corps (sauf naturellement dans le post Facebook).

THÈMES DÉJÀ TRAITÉS RÉCEMMENT (À ÉVITER) : ${recentThemes.join(", ") || "aucun"}

LIVRE UNIQUEMENT UN OBJET JSON VALIDE, sans markdown autour, sans préambule, avec exactement ces clés :
{
  "title": "Titre du conseil — phrase courte, 4 à 9 mots, pas de point final",
  "body": [
    "Paragraphe 1 — 2 à 4 phrases. Introduit l'idée doucement.",
    "Paragraphe 2 — 2 à 4 phrases. Propose un geste ou une observation concrète.",
    "Paragraphe 3 — 2 à 4 phrases. Ouvre, sans conclure de manière prescriptive."
  ],
  "facebookPost": "Texte Facebook 90 à 180 mots, ton chaleureux mais sobre. Pas plus de 2 emojis discrets. Termine impérativement par les deux lignes :\\n\\nLes conseils du mois ↓\\nhttps://eureka-therapie.com/conseils.html"
}

Réponds UNIQUEMENT par le JSON. Pas un mot avant, pas un mot après.`;
}

async function callClaude(theme, recentThemes, apiKey) {
  const prompt = buildPrompt(theme, recentThemes);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude API → ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  // Trim accolades extérieures au cas où.
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Claude n'a pas renvoyé de JSON exploitable.");
  }
  const jsonText = text.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonText);
}

// -----------------------------------------------------------------------------
//                              MODERATION
// -----------------------------------------------------------------------------

function checkModeration(conseil) {
  const fullText = [
    conseil.title || "",
    ...(conseil.body || []),
    conseil.facebookPost || "",
  ].join(" \n ");
  for (const re of BANLIST) {
    if (re.test(fullText)) {
      return { ok: false, hit: re.toString() };
    }
  }
  return { ok: true };
}

// -----------------------------------------------------------------------------
//                              MAIN HANDLER
// -----------------------------------------------------------------------------

export default async function handler(req, res) {
  // 1. Authentification du cron
  const auth = req.headers["authorization"] || "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const token = process.env.GITHUB_TOKEN;
    // Accepte les deux noms : CLAUDE_API_KEY (nom utilisé sur ce projet Vercel)
    // ou ANTHROPIC_API_KEY (nom standard chez Anthropic) — l'un OU l'autre suffit.
    const claudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!repo || !token || !claudeKey) {
      throw new Error("Variables d'env manquantes (GITHUB_REPO / GITHUB_TOKEN / CLAUDE_API_KEY).");
    }

    // 2. Lecture du JSON courant
    const path = "conseils-data.json";
    const { sha, json } = await ghReadJson(repo, branch, token, path);
    const recentThemes = json.recentThemes || [];

    // 3. Choix d'un thème non-récent (au hasard parmi le pool moins recentThemes)
    const candidates = THEME_POOL.filter((t) => !recentThemes.includes(t));
    const theme = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : THEME_POOL[Math.floor(Math.random() * THEME_POOL.length)];

    // 4. Appel Claude + modération + retry max 1
    let conseil = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      conseil = await callClaude(theme, recentThemes, claudeKey);
      const mod = checkModeration(conseil);
      if (mod.ok) break;
      if (attempt === 2) {
        return res.status(422).json({
          error: "Modération a rejeté le contenu après 2 essais.",
          lastHit: mod.hit,
        });
      }
    }

    // 5. Construction nouveau JSON
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const newRecent = [theme, ...recentThemes.filter((t) => t !== theme)].slice(0, MAX_RECENT_THEMES);
    const newJson = {
      version: 1,
      currentMonth: month,
      currentConseil: {
        title: conseil.title,
        theme,
        body: conseil.body,
        facebookPost: conseil.facebookPost,
        generatedAt: now.toISOString(),
      },
      recentThemes: newRecent,
    };

    // 6. Push GitHub
    const commitMsg = `Conseil mensuel ${month} — thème ${theme}`;
    await ghWriteJson(repo, branch, token, path, sha, newJson, commitMsg);

    return res.status(200).json({ ok: true, month, theme, title: conseil.title });
  } catch (err) {
    console.error("[conseil-generate] erreur :", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
