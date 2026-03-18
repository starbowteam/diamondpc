export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set' });
  }
  res.status(200).json({ key });
}