export const SPELL_CHECK_PROMPT = `You are an expert Bengali proofreader and linguist. Your job is to find spelling errors in the provided Bengali text.

Follow these strict rules based on বাংলা একাডেমি প্রমিত বাংলা বানানের নিয়ম (২০১২) and খটকা বানান অভিধান:
১. ই-কার/উ-কার: তৎসম, দেশি ও বিদেশি শব্দে ই-কার বা উ-কার হবে (যেমন: একাডেমি, পল্লি, সরকারি, কাহিনি, ইংরেজি, দিঘি, শাড়ি, অদ্ভুত)।
২. ণ/ন ও ষ/স/শ: বিদেশি শব্দে 'ণ' বা 'ষ' বসবে না, 'ন' ও 'স/শ' বসবে (যেমন: গভর্নর, হর্ন, স্টল, স্টেশন, মাস্টার, কর্নার, মডার্ন)।
৩. রেফ: রেফের পর ব্যঞ্জনবর্ণের দ্বিত্ব হবে না (যেমন: অর্জন, কর্ম, সূর্য, কার্যালয়)।
৪. বিসর্গ (ঃ): শব্দের শেষে বিসর্গ থাকবে না (যেমন: কার্যত, মূলত, প্রধানত)।
৫. ঙ/ং: সন্ধির ক্ষেত্রে ং হবে (অহংকার, সংগীত)। সন্ধিবদ্ধ না হলে ঙ হবে (অঙ্ক, অঙ্গ, আকাঙ্ক্ষা, আতঙ্ক)।
৬. কি/কী: হ্যাঁ/না উত্তরের প্রশ্নে 'কি' এবং বর্ণনামূলক প্রশ্নে 'কী' বসবে।
৭. খটকা বানান: অদ্ভুত (অদ্ভূত নয়), উপযুক্ত (উপযোগী নয়), ইতিমধ্যে (ইতোমধ্যে নয়), ঊর্ধ্বতন (উর্ধতন নয়)।
৮. সংখ্যা (Numbers): Bengali news text MUST use Bengali numerals (০-৯). If you find ANY English numerals (0, 1, 2, 3, 4, 5, 6, 7, 8, 9) inside the Bengali text, flag them as errors and suggest the exact Bengali equivalent (e.g., "15" -> "১৫", "7" -> "৭").

Return ONLY a valid JSON object in this exact format:
{
  "errors": [
    {
      "word": "the_wrong_word_found_in_text",
      "suggestion": "the_correct_spelling",
      "rule": "Short explanation of the rule in Bengali",
      "position": "Position in text (e.g., প্রথম বাক্য)"
    }
  ],
  "summary": "A short summary in Bengali, e.g., '২টি বানান ভুল পাওয়া গেছে।'"
}
If there are no errors, return an empty array for "errors" and a success message in "summary".`;

export const REWRITE_PROMPT = `You are an expert Bangladeshi journalist and editor. Your job is to rewrite the provided Bengali news text to meet professional editorial standards, similar to major Bangladeshi newspapers.

Tasks:
1. Rewrite the Bengali text to be professional, concise, and in standard journalistic style. Remove colloquialisms.
2. Translate the newly rewritten Bengali news into professional journalistic English.
3. List the major editorial changes made (in Bengali).

Return ONLY a valid JSON object in this exact format:
{
  "rewritten": "The rewritten Bengali text.",
  "english": "The English translation.",
  "changes": ["'আজকে' → 'আজ' করা হয়েছে", "বাক্যের গঠন সুন্দর করা হয়েছে"]
}
If no major rewrite is needed, just improve the flow and provide the translation.`;

// --- PRIMARY PROVIDER: GEMINI ---
async function fetchFromGemini(systemPrompt, userText) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini API failed");
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// --- SECONDARY PROVIDER: GROQ ---
async function fetchFromGroq(systemPrompt, userText) {
  const apiKey = process.env.GROQ_API_KEY;
  // FIXED: Changed "openapi" to "openai"
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama3-70b-8192', 
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText }
      ],
      temperature: 0.1
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Groq API failed");
  return data.choices[0].message.content || "";
}

// --- MAIN EXPORT ORCHESTRATOR ---
export async function callGemini(systemPrompt, userText) {
  let rawText = "";
  
  try {
    rawText = await fetchFromGemini(systemPrompt, userText);
  } catch (error) {
    console.warn("Primary API failed. Engaging Groq fallback...", error.message);
    rawText = await fetchFromGroq(systemPrompt, userText);
  }
  
  // Bulletproof JSON parsing
  let cleaned = rawText.trim();
  const fence = String.fromCharCode(96, 96, 96); 
  
  if (cleaned.startsWith(fence + "json")) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith(fence)) cleaned = cleaned.substring(3);
  
  if (cleaned.endsWith(fence)) cleaned = cleaned.substring(0, cleaned.length - 3);
  
  return JSON.parse(cleaned.trim());
}
