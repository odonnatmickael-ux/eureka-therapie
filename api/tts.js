export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { text, voiceId } = req.body;

  const VOICE_SETTINGS = {
    "4RZ84U1b4WCqpu57LvIq": { // Bella
      stability: 0.65, similarity_boost: 0.70, style: 0.20, use_speaker_boost: false, speed: 0.78
    },
    "9BWtsMINqrJLrRacOk9x": { // Aria
      stability: 0.75, similarity_boost: 0.70, style: 0.15, use_speaker_boost: false, speed: 0.78
    },
    "pNInz6obpgDQGcFmaJgB": { // Adam
      stability: 0.82, similarity_boost: 0.60, style: 0.08, use_speaker_boost: false, speed: 0.78
    },
    "nPczCjzI2devNBz1zQrb": { // Brian
      stability: 0.70, similarity_boost: 0.68, style: 0.10, use_speaker_boost: false, speed: 0.78
    },
    "YV28ox2c5Cuh5rim0LrW": { // Marcel
      stability: 0.80, similarity_boost: 0.65, style: 0.10, use_speaker_boost: false, speed: 0.78
    },
    "cQVn2FWawJsxa2z9X3l1": { // Valentin
      stability: 0.82, similarity_boost: 0.65, style: 0.08, use_speaker_boost: false, speed: 0.90
    },
    "5l4ttmr4SKNgi0HnOelT": { // Paul K
      stability: 0.78, similarity_boost: 0.65, style: 0.10, use_speaker_boost: false, speed: 0.78
    },
    "HeQxwrjIb6zvCa1bt1EE": { // Ludovic
      stability: 0.80, similarity_boost: 0.65, style: 0.08, use_speaker_boost: false, speed: 0.78
    },
    "D8YqJ6FEIaP09qWQcZuN": { // Mickaël
      stability: 0.80, similarity_boost: 0.75, style: 0.10, use_speaker_boost: false, speed: 0.90
    },
  };

  const settings = VOICE_SETTINGS[voiceId] || VOICE_SETTINGS["4RZ84U1b4WCqpu57LvIq"];
  const voice = voiceId || "4RZ84U1b4WCqpu57LvIq";



  try {
    const r = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + voice,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": process.env.ELEVEN_API_KEY
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: settings
        })
      }
    );
    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: err });
    }
    const buffer = await r.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
