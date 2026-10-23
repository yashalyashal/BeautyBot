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
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!openRouterKey) {
      return res.status(500).json({ error: 'Server configuration error: missing OPENROUTER_API_KEY' });
    }

    // Special handler for auto-generating thread titles
    if (type === 'generate-title') {
      const titlePrompt = [
        { role: 'system', content: 'You are an assistant that creates concise 3-5 word titles for chat conversations. Return ONLY the title text with no quotes or punctuation.' },
        { role: 'user', content: `Generate a short title for a chat starting with: "${messages[0]?.content || 'Hello'}"` }
      ];

      const titleRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': 'https://beautybott.vercel.app',
          'X-Title': 'BeautyBott Title Generator',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          max_tokens: 20,
          messages: titlePrompt
        })
      });

      const titleData = await titleRes.json();
      const generatedTitle = titleData.choices?.[0]?.message?.content?.trim() || 'New Conversation';
      return res.status(200).json({ title: generatedTitle });
    }

    let memoryContext = "";
    let userPrefContext = "";

    // Fetch user memories and preferences if logged in
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
          memoryContext = `\n[USER MEMORY: The user has previously mentioned or struggled with: ${pastInsecurities}. Keep this in mind seamlessly.]`;
        }

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

    let fullSystemInstruction = systemPrompt || 'You are BeautyBott by Yashal, a deeply empathetic, uplifting, and warm personal assistant.';
    if (userPrefContext) fullSystemInstruction += userPrefContext;
    if (memoryContext) fullSystemInstruction += memoryContext;

    let formattedMessages = [{ role: 'system', content: fullSystemInstruction }];
    if (Array.isArray(messages)) {
      formattedMessages = formattedMessages.concat(messages);
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
      throw new Error(data.error?.message || 'OpenRouter API call failed');
    }

    const reply = data.choices?.[0]?.message?.content || "You are wonderful just as you are.";
    return res.status(200).json({ content: reply });
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate response' });
  }
};
