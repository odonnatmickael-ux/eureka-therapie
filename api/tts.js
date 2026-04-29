export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { text, voiceId, previous_text, next_text } = req.body;

  const SPEEDS = {
    "4RZ84U1b4WCqpu57LvIq": 0.78,  // Bella
    "9BWtsMINqrJLrRacOk9x": 0.78,  // Aria
    "pNInz6obpgDQGcFmaJgB": 0.78,  // Adam
    "nPczCjzI2devNBz1zQrb": 0.78,  // Brian
    "YV28ox2c5Cuh5rim0LrW": 0.78,  // Marcel
    "cQVn2FWawJsxa2z9X3l1": 0.90,  // Valentin
    "5l4ttmr4SKNgi0HnOelT": 0.78,  // Paul K
    "HeQxwrjIb6zvCa1bt1EE": 0.78,  // Ludovic
    "D8YqJ6FEIaP09qWQcZuN": 0.90,  // Mickaël
  };

  const voice = voiceId || "4RZ84U1b4WCqpu57LvIq";
  const speed = SPEEDS[voice] || 0.78;

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
          voice_settings: { speed: speed },
          ...(previous_text && { previous_text }),
          ...(next_text && { next_text })
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
