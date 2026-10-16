import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parts, userId, type } = req.body;
    let memoryContext = "";

    // Fetch past learned insecurities if user is authenticated
    if (supabase && userId) {
      const { data: memories } = await supabase
        .from('memories')
        .select('content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (memories && memories.length > 0) {
        const pastInsecurities = memories.map(m => m.content).join("; ");
        memoryContext = `\n\n[USER MEMORY: The user has previously struggled with or mentioned: ${pastInsecurities}. Keep this in mind to make your response feel deeply personal and continuous without explicitly listing their past struggles.]`;
      }
    }

    // Inject memory context into prompt
    if (parts && parts.length > 0 && memoryContext) {
      if (typeof parts[0] === 'object' && parts[0].text) {
        parts[0].text += memoryContext;
      }
    }

    // Handle Affirmation mode request
    if (type === 'affirmations' && parts) {
      parts.push({
        text: "Based on what you know about me and my past insecurities, give me exactly 3 short, deeply personal affirmations to repeat to myself right now. Number them 1, 2, and 3. Make them feel like a close friend talking."
      });
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      return res.status(500).json({ error: 'Server configuration error: missing API key' });
    }

    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://beautybotbyyashal.vercel.app',
        'X-Title': 'BeautyBot by Yashal',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: parts }]
      })
    });

    const data = await openRouterRes.json();
    if (!openRouterRes.ok) {
      throw new Error(data.error?.message || 'OpenRouter API call failed');
    }

    const reply = data.choices?.[0]?.message?.content || "You are wonderful just as you are.";

    // Store new input to user memory
    if (supabase && userId && type !== 'affirmations') {
      const userText = parts.find(p => typeof p.text === 'string' && !p.text.includes('You are BeautyBot'))?.text;
      if (userText && userText.length > 5) {
        const cleanText = userText.replace(/Someone shared this: "|"\n\nRespond to them./g, '').trim();
        await supabase.from('memories').insert({
          user_id: userId,
          content: cleanText
        });
      }
    }

    return res.status(200).json({ content: reply });
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: 'Failed to generate response' });
  }
}
