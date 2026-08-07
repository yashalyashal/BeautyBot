export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { parts } = req.body;
  
  // Transform parts format to match OpenRouter/OpenAI content structure supporting text and inline images
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

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openrouter/auto',
        messages: [{ role: 'user', content: formattedContent }],
      }),
    });

    const data = await response.json();
    console.log('OpenRouter response:', JSON.stringify(data));
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'error' });

    const content = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
