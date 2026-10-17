const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parts, userId, type } = req.body;
    let memoryContext = "";

    // 1. Fetch past learned insecurities if user is authenticated
    if (supabase && userId) {
      try {
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
      } catch (dbErr) {
        console.warn("Supabase fetch error:", dbErr);
      }
    }

    // 2. Parse parts safely for OpenRouter
    let userContentPayload = [];
    let textSummaryForMemory = "";

    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (typeof p === 'string') {
          userContentPayload.push({ type: 'text', text: p });
          textSummaryForMemory += p + " ";
        } else if (p && typeof p === 'object') {
          if (p.text) {
            let t = p.text;
            if (memoryContext && t.includes('Someone shared this')) {
              t += memoryContext;
            }
            userContentPayload.push({ type: 'text', text: t });
            textSummaryForMemory += t + " ";
          } else if (p.inlineData) {
            const mime = p.inlineData.mimeType || 'image/jpeg';
            const base64 = p.inlineData.data;
            userContentPayload.push({
              type: 'image_url',
              image_url: {
                url: `data:${mime};base64,${base64}`
              }
            });
            textSummaryForMemory += "[Attached Photo] ";
          }
        }
      }
    } else if (typeof parts === 'string') {
      let finalTxt = parts;
      if (memoryContext) finalTxt += memoryContext;
      userContentPayload = finalTxt;
      textSummaryForMemory = finalTxt;
    }

    if (type === 'affirmations') {
      const affirmationPrompt = "\n\nBased on what you know about me and my past insecurities, give me exactly 3 short, deeply personal affirmations to repeat to myself right now. Number them 1, 2, and 3. Make them feel like a close friend talking.";
      if (Array.isArray(userContentPayload)) {
        userContentPayload.push({ type: 'text', text: affirmationPrompt });
      } else {
        userContentPayload += affirmationPrompt;
      }
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      return res.status(500).json({ error: 'Server configuration error: missing OPENROUTER_API_KEY' });
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
        max_tokens: 1000,
        messages: [
          { role: 'system', content: 'You are BeautyBot by Yashal, a deeply empathetic, uplifting, and warm personal assistant.' },
          { role: 'user', content: userContentPayload }
        ]
      })
    });

    const data = await openRouterRes.json();
    if (!openRouterRes.ok) {
      console.error("OpenRouter error response:", data);
      throw new Error(data.error?.message || 'OpenRouter API call failed');
    }

    const reply = data.choices?.[0]?.message?.content || "You are wonderful just as you are.";

    if (supabase && userId && type !== 'affirmations' && textSummaryForMemory) {
      const cleanText = textSummaryForMemory.replace(/\[USER MEMORY:[\s\S]*?\]/g, '').replace(/Someone shared this: "|"\n\nRespond to them./g, '').trim();
      if (cleanText.length > 3) {
        supabase.from('memories').insert({
          user_id: userId,
          content: cleanText
        }).then(({ error }) => {
          if (error) console.error("Failed to insert memory:", error);
        });
      }
    }

    return res.status(200).json({ content: reply });
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate response' });
  }
};
