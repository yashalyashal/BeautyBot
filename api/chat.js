const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, userId, systemPrompt, type } = req.body;
    let memoryContext = "";
    let userPrefContext = "";

    // 1. Fetch user memories and user preferences if logged in
    if (supabase && userId) {
      try {
        // Fetch memories
        const { data: memories } = await supabase
          .from('memories')
          .select('content')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (memories && memories.length > 0) {
          const pastInsecurities = memories.map(m => m.content).join("; ");
          memoryContext = `\n[USER MEMORY: The user has previously mentioned or struggled with: ${pastInsecurities}. Keep this in mind seamlessly without explicitly reciting list format.]`;
        }

        // Fetch custom user preferences
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('preferred_name, communication_style, custom_instructions')
          .eq('user_id', userId)
          .single();

        if (prefs) {
          if (prefs.preferred_name) userPrefContext += `\nThe user prefers to be called "${prefs.preferred_name}".`;
          if (prefs.communication_style) userPrefContext += `\nPreferred style: ${prefs.communication_style}.`;
          if (prefs.custom_instructions) userPrefContext += `\nCustom instructions: ${prefs.custom_instructions}.`;
        }
      } catch (dbErr) {
        console.warn("Supabase fetch error:", dbErr);
      }
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      return res.status(500).json({ error: 'Server configuration error: missing OPENROUTER_API_KEY' });
    }

    // Build complete system instruction
    let fullSystemInstruction = systemPrompt || 'You are BeautyBott by Yashal, a deeply empathetic, uplifting, and warm personal assistant.';
    if (userPrefContext) fullSystemInstruction += userPrefContext;
    if (memoryContext) fullSystemInstruction += memoryContext;

    // Build payload messages for OpenRouter
    let formattedMessages = [
      { role: 'system', content: fullSystemInstruction }
    ];

    if (Array.isArray(messages)) {
      formattedMessages = formattedMessages.concat(messages);
    } else if (req.body.parts) {
      // Fallback compatibility for single-turn requests
      formattedMessages.push({ role: 'user', content: req.body.parts });
    }

    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://beautybott.vercel.app',
        'X-Title': 'BeautyBott by Yashal',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 1000,
        messages: formattedMessages
      })
    });

    const data = await openRouterRes.json();
    if (!openRouterRes.ok) {
      console.error("OpenRouter error response:", data);
      throw new Error(data.error?.message || 'OpenRouter API call failed');
    }

    const reply = data.choices?.[0]?.message?.content || "You are wonderful just as you are.";

    return res.status(200).json({ content: reply });
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate response' });
  }
};
