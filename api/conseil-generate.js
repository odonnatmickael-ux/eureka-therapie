// api/conseil-generate.js
// -----------------------------------------------------------------------------
// EUREKA Thérapie — Génération mensuelle automatique du « conseil du mois »
// -----------------------------------------------------------------------------
// Appelée par GitHub Action le 1er lundi du mois à 6h UTC.
// Fait 4 choses :
//   1. Lit conseils-data.json depuis GitHub (pour les 6 derniers thèmes)
//   2. Choisit un thème (option: forcé via ?theme=<tag>, sinon saisonnier ou aléatoire)
//   3. Appelle Claude API avec le prompt EUREKA (4-paragraphes problème-focus)
//   4. Modère via regex BANLIST → retry 1 fois si échec
//   5. Pousse le nouveau JSON sur GitHub via Contents API
//
// Variables d'environnement Vercel requises :
//   - CLAUDE_API_KEY ou ANTHROPIC_API_KEY  (clé Claude)
//   - GITHUB_TOKEN                          (PAT scope `repo`)
//   - GITHUB_REPO                           (ex: "odonnatmickael-ux/eureka-therapie")
//   - GITHUB_BRANCH                         (ex: "main")
//   - CRON_SECRET                           (chaîne partagée avec le workflow)
// -----------------------------------------------------------------------------

const CLAUDE_MODEL = "claude-sonnet-4-6";
const MAX_RECENT_THEMES = 6;

const BANLIST = [
  /\bscientifiquement\b/i,
  /\b21\s*jours?\b.{0,40}(habitude|cerveau|ancr|science|neuro)/is,
  /(habitude|cerveau|ancr|neuro).{0,40}\b21\s*jours?\b/is,
  /\bneuroplasticit[ée]\b/i,
  /\brewir(e|ing)\b/i,
  /cerveau.{0,20}ancre/is,
  /\bdeuil\b/i,
  /\btrauma(tisme)?\b/i,
  /\bd[ée]pression\b/i,
  /\bburn[\s-]?out\b/i,
  /\bgu[ée]rit\b/i,
  /\bgu[ée]rir\s+(l[ae'])\s*\w+/i,
  /\bgu[ée]rison\b/i,
  /\bsoigne\b/i,
  /\bsupprime\b.{0,30}(anxi|stress|d[ée]press|peur)/is,
  /\b100\s*%\b/,
  /\b[àa]\s*coup\s*s[ûu]r\b/i,
  /\bgaranti(e|t)?\b/i,
  /\bremplace\s+(un|le|votre)\s+(m[ée]decin|th[ée]rapeute|psy)/is,
];

const THEMES = [
  { tag: "sommeil",                 theme: "Retrouver un sommeil réparateur" },
  { tag: "anxiete",                 theme: "Calmer l'anxiété du quotidien" },
  { tag: "confiance",               theme: "Renforcer la confiance en soi" },
  { tag: "lacher_prise",            theme: "Lâcher prise sur ce qu'on ne contrôle pas" },
  { tag: "stress_pro",              theme: "Mieux gérer le stress au travail" },
  { tag: "fatigue",                 theme: "Mieux vivre avec la fatigue persistante" },
  { tag: "paix",                    theme: "Trouver un peu de paix intérieure" },
  { tag: "concentration",           theme: "Améliorer sa concentration" },
  { tag: "corps",                   theme: "Se réconcilier avec son corps" },
  { tag: "peur_jugement",           theme: "Surmonter la peur du jugement des autres" },
  { tag: "resilience",              theme: "Développer sa résilience face aux épreuves" },
  { tag: "joie",                    theme: "Renouer avec la joie simple" },
  { tag: "bienveillance_soi",       theme: "Prendre soin de soi sans culpabilité" },
  { tag: "tensions",                theme: "Libérer les tensions physiques accumulées" },
  { tag: "energie",                 theme: "Retrouver de l'énergie au quotidien" },
  { tag: "emotions",                theme: "Mieux accueillir ses émotions" },
  { tag: "procrastination",         theme: "Dépasser la procrastination en douceur" },
  { tag: "gratitude",               theme: "Cultiver la gratitude au quotidien" },
  { tag: "relations",               theme: "Améliorer ses relations aux autres" },
  { tag: "changement",              theme: "Accepter le changement sereinement" },
  { tag: "equilibre",               theme: "Trouver son équilibre vie pro / vie perso" },
  { tag: "perfectionnisme",         theme: "Se libérer du perfectionnisme" },
  { tag: "intuition",               theme: "Réapprendre à s'écouter intérieurement" },
  { tag: "respiration",             theme: "Mieux respirer pour mieux vivre" },
  { tag: "perte",                   theme: "Traverser une perte ou un chagrin" },
  { tag: "motivation",              theme: "Renouer avec sa motivation" },
  { tag: "rumination",              theme: "Calmer les pensées envahissantes" },
  { tag: "affirmation",             theme: "S'affirmer sans agressivité" },
  { tag: "saison_ete",              theme: "Préparer son corps et son esprit à l'été" },
  { tag: "pleine_conscience",       theme: "Vivre pleinement le moment présent" },
  { tag: "incertitude",             theme: "Traverser une période d'incertitude" },
  { tag: "sante_mental",            theme: "Soutenir sa santé par le mental" },
  { tag: "blessures_anciennes",     theme: "Apaiser les blessures émotionnelles anciennes" },
  { tag: "routine",                 theme: "Créer une routine bien-être qui tient" },
  { tag: "patience",                theme: "Développer la patience" },
  { tag: "communication",           theme: "Mieux communiquer avec ses proches" },
  { tag: "solitude",                theme: "Apprivoiser la solitude" },
  { tag: "creativite",              theme: "Réveiller sa créativité" },
  { tag: "rentree",                 theme: "Aborder la rentrée avec sérénité" },
  { tag: "sens",                    theme: "Retrouver un sens à ses actions" },
  { tag: "surcharge",               theme: "Mieux vivre avec le bruit et l'agitation" },
  { tag: "isolement",               theme: "Sortir de l'isolement intérieur" },
  { tag: "coherence",               theme: "Réconcilier tête et cœur" },
  { tag: "peurs",                   theme: "Apprivoiser ses peurs profondes" },
  { tag: "fetes",                   theme: "Traverser les fêtes sans stress" },
  { tag: "estime",                  theme: "Renforcer l'estime de soi" },
  { tag: "nature",                  theme: "Se reconnecter à la nature" },
  { tag: "transition",              theme: "Préparer une transition de vie" },
  { tag: "douceur",                 theme: "Cultiver la douceur envers soi-même" },
  { tag: "bilan",                   theme: "Faire le bilan de l'année avec bienveillance" },
  { tag: "renouveau",               theme: "Lâcher l'ancienne année, accueillir la nouvelle" },
  { tag: "intentions",              theme: "Poser ses intentions pour l'année à venir" },
];

const SEASONAL_PREF = {
  1:  ["intentions", "renouveau"],
  6:  ["saison_ete"],
  9:  ["rentree"],
  12: ["fetes", "bilan"],
};

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

function pickTheme(currentMonth, recentTags, forcedTag) {
  if (forcedTag) {
    const forced = THEMES.find((t) => t.tag === forcedTag);
    if (forced) return forced;
    console.warn(`[conseil] forceTag inconnu : "${forcedTag}" — fallback auto`);
  }
  const seasonal = SEASONAL_PREF[currentMonth] || [];
  const seasonalCandidates = THEMES.filter(
    (t) => seasonal.includes(t.tag) && !recentTags.includes(t.tag)
  );
  if (seasonalCandidates.length > 0) {
    return seasonalCandidates[Math.floor(Math.random() * seasonalCandidates.length)];
  }
  const candidates = THEMES.filter((t) => !recentTags.includes(t.tag));
  const pool = candidates.length > 0 ? candidates : THEMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildPrompt(theme) {
  const lines = [
    "Tu rediges le Conseil du mois pour EUREKA Therapie, une application web qui propose des seances de sophrologie audio personnalisees par IA. Le porteur du projet est Mickael Odonnat, triple-certifie : Sophrologie Caycedienne (CFFS 2017), Hypnose Ericksonienne (EFH 2017), Methode Silva (Mindvalley 2020). Son serieux editorial est non-negociable.",
    "",
    "PUBLIC : adultes francophones qui vivent reellement le probleme ci-dessous dans leur quotidien. Ils sont fatigues des conseils superficiels (\"respire et tout ira mieux\"). Ils veulent un texte qui les comprenne sans les diagnostiquer, et qui leur propose un geste concret a essayer.",
    "",
    "THEME DU MOIS : " + theme.theme,
    "",
    "STRUCTURE OBLIGATOIRE — exactement 4 paragraphes courts (2 a 4 phrases chacun) :",
    "",
    "PARA 1 — RECONNAISSANCE",
    "Decris la situation telle qu'elle se vit de l'interieur. Le lecteur doit se dire \"oui, c'est exactement ca\". Vouvoiement bienveillant. Pas de diagnostic, pas d'etiquette clinique. Aborde le probleme comme une experience humaine universelle, pas une pathologie.",
    "",
    "PARA 2 — COMPREHENSION",
    "Explique brievement, en termes simples et accessibles, pourquoi ce vecu est legitime (mecanisme corporel ou emotionnel). Pas de jargon, pas de pseudo-science. L'objectif : apaiser par la comprehension.",
    "",
    "PARA 3 — UN GESTE PRECIS",
    "Propose UN seul exercice concret inspire de la sophrologie ou de la respiration consciente. Decris-le en 2 ou 3 etapes simples. Le lecteur doit pouvoir le faire en moins d'une minute apres lecture, la ou il est, sans materiel. Sois precis (\"inspirez 4 secondes, expirez 6 secondes\") mais sans surcharger.",
    "",
    "PARA 4 — OUVERTURE",
    "Evoque la possibilite d'aller plus loin avec une seance EUREKA personnalisee — comme un outil possible, sans pression commerciale. Une phrase suffit. Termine par une phrase douce qui laisse le lecteur en paix.",
    "",
    "REGLES ABSOLUES :",
    "1. AUCUNE pseudo-science. Pas de \"neuroplasticite\", \"21 jours = science\", \"ancre dans le cerveau\", \"rewire\", \"duree scientifique\".",
    "2. AUCUN vocabulaire clinique direct comme etiquette : pas de \"deuil\", \"depression\", \"trauma\", \"burn-out\", \"anxiete generalisee\". Preferer : \"ce poids\", \"cette charge\", \"ce que vous traversez\", \"cette tension\". Le mot \"anxiete\" peut apparaitre mais SANS l'etiqueter sur le lecteur.",
    "3. AUCUNE promesse de guerison : pas de \"guerit\", \"supprime\", \"100%\", \"garanti\", \"a coup sur\".",
    "4. AUCUNE extrapolation : ne pas deviner age, situation familiale, metier, contexte du lecteur.",
    "5. AUCUNE substitution medicale : ne jamais suggerer de remplacer un medecin, therapeute ou traitement.",
    "6. Ton adulte, pose, vouvoiement, pas d'emojis dans le corps du texte, pas d'exclamations enthousiastes, pas de superlatifs.",
    "",
    "LIVRE UNIQUEMENT UN OBJET JSON VALIDE, sans markdown autour, sans preambule :",
    "{",
    "  \"title\": \"Titre 5 a 9 mots, en lien direct avec le theme, sans point final\",",
    "  \"body\": [",
    "    \"Paragraphe 1 — reconnaissance\",",
    "    \"Paragraphe 2 — comprehension\",",
    "    \"Paragraphe 3 — un geste precis pas-a-pas\",",
    "    \"Paragraphe 4 — ouverture EUREKA + phrase douce\"",
    "  ],",
    "  \"facebookPost\": \"Texte FB 120 a 200 mots, ton chaleureux mais sobre. Resume l'esprit du conseil sans tout devoiler. Pas plus de 2 emojis discrets. Termine imperativement par les deux lignes :\\n\\nLe conseil du mois ↓\\nhttps://eureka-therapie.vercel.app/conseils.html\"",
    "}",
    "",
    "Reponds UNIQUEMENT par le JSON. Pas un mot avant, pas un mot apres.",
  ];
  return lines.join("\n");
}

async function callClaude(theme, apiKey) {
  const prompt = buildPrompt(theme);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude API → ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Claude n'a pas renvoyé de JSON exploitable.");
  }
  return JSON.parse(text.slice(firstBrace, lastBrace + 1));
}

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

export default async function handler(req, res) {
  const auth = req.headers["authorization"] || "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const token = process.env.GITHUB_TOKEN;
    const claudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!repo || !token || !claudeKey) {
      throw new Error("Variables d'env manquantes (GITHUB_REPO / GITHUB_TOKEN / CLAUDE_API_KEY).");
    }

    const forcedTag =
      (req.query && (req.query.theme || req.query.tag)) ||
      (req.body && (req.body.theme || req.body.tag)) ||
      null;

    const path = "conseils-data.json";
    const { sha, json } = await ghReadJson(repo, branch, token, path);
    const recentTags = json.recentThemes || [];

    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const chosen = pickTheme(currentMonth, recentTags, forcedTag);

    let conseil = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      conseil = await callClaude(chosen, claudeKey);
      const mod = checkModeration(conseil);
      if (mod.ok) break;
      if (attempt === 2) {
        return res.status(422).json({
          error: "Modération a rejeté le contenu après 2 essais.",
          lastHit: mod.hit,
          theme: chosen.tag,
        });
      }
    }

    const month = `${now.getUTCFullYear()}-${String(currentMonth).padStart(2, "0")}`;
    const newRecent = [chosen.tag, ...recentTags.filter((t) => t !== chosen.tag)].slice(0, MAX_RECENT_THEMES);
    const newJson = {
      version: 1,
      currentMonth: month,
      currentConseil: {
        title: conseil.title,
        theme: chosen.tag,
        themeLabel: chosen.theme,
        body: conseil.body,
        facebookPost: conseil.facebookPost,
        generatedAt: now.toISOString(),
      },
      recentThemes: newRecent,
    };

    const commitMsg = `Conseil mensuel ${month} — ${chosen.theme}`;
    await ghWriteJson(repo, branch, token, path, sha, newJson, commitMsg);

    return res.status(200).json({ ok: true, month, theme: chosen.tag, title: conseil.title });
  } catch (err) {
    console.error("[conseil-generate] erreur :", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
