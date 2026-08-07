export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('API key missing from environment variables');
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { parts } = req.body;
  if (!parts || !Array.isArray(parts)) {
    return res.status(400).json({ error: 'Invalid request body parts' });
  }

  try {
    const formattedContent = parts.map(p => {
      if (p.text) return { type: 'text', text: p.text };
      if (p.inlineData) {
        return {
          type: 'image_url',
          image_url: {
            url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`
          }
        };
      }
      return null;
    }).filter(Boolean);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://vercel.com',
        'X-Title': 'BeautyBot'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [{ role: 'user', content: formattedContent }],
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('OpenRouter API error response:', JSON.stringify(data));
      return res.status(500).json({ error: data.error?.message || 'OpenRouter upstream error' });
    }

    const content = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content });
  } catch (err) {
    console.error('Catch block server crash:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
