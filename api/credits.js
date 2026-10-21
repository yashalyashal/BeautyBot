export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch credit status from OpenRouter');
    }

    const data = await response.json();
    return res.status(200).json({
      status: 'active',
      data: data.data || data
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error checking credits' });
  }
}
