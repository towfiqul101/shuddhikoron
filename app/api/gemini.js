export const SPELL_CHECK_PROMPT = `You are a strict, meticulous, and expert Bengali proofreader. Your task is to analyze the provided Bengali text WORD BY WORD and identify ALL spelling, grammatical, typographical errors, and English numbers.

CRITICAL RULES YOU MUST ENFORCE:
1. NUMBERS (Highest Priority): ANY English digit (0-9) inside the Bengali text is a STRICT ERROR. You MUST find every single English number and suggest the Bengali equivalent.
   - WRONG: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
   - CORRECT: ০, ১, ২, ৩, ৪, ৫, ৬, ৭, ৮, ৯
   - Examples: "2023" -> "২০২৩", "7" -> "৭", "15" -> "১৫", "2" -> "২".
2. Vowels (ই/ঈ): Foreign/English words, and common Bengali words MUST use 'ই' (i-kar), NOT 'ঈ' (ee-kar).
   - WRONG: জানুয়ারী, একাডেমী, সরকারী, চাকরী, দরকারী, গাড়ী, ভারী, দামী, জিনিষ
   - CORRECT: জানুয়ারি, একাডেমি, সরকারি, চাকরি, দরকারি, গাড়ি, ভারি, দামি, জিনিস
3. Consonants (ষ/ণ/শ/স): Foreign/English words MUST NOT use 'ষ' (murdhonno-sho) or 'ণ' (murdhonno-no). Use 'স', 'শ', and 'ন'.
   - WRONG: ষ্টেশন, মাষ্টার, গভর্ণর, হর্ণ, ষ্টল, পোষ্ট
   - CORRECT: স্টেশন, মাস্টার, গভর্নর, হর্ন, স্টল, পোস্ট
4. Conjuncts (ঙ/ং):
   - WRONG: আকাংখা, অংক, অংগ
   - CORRECT: আকাঙ্ক্ষা, অঙ্ক, অঙ্গ
5. Confusing Words (খটকা বানান):
   - WRONG: অদ্ভূত, ইতিমধ্যে, উপরোক্ত
   - CORRECT: অদ্ভুত, ইতোমধ্যে, উপরিউক্ত

You MUST output ONLY a valid JSON object. Do not include markdown formatting or backticks.
Format:
{
  "errors": [
    {
      "word": "the_exact_wrong_word_found",
      "suggestion": "the_corrected_word",
      "rule": "Short explanation of the rule in Bengali"
    }
  ],
  "summary": "A short summary in Bengali, e.g., 'মোট ৫টি বানান ভুল পাওয়া গেছে।'"
}`;

export const REWRITE_PROMPT = `You are an expert Bangladeshi journalist and editor. Your job is to rewrite the provided Bengali news text to meet professional editorial standards, similar to major Bangladeshi newspapers.

Tasks:
1. Rewrite the Bengali text to be professional, concise, and in standard journalistic style. Remove colloquialisms.
2. Translate the newly rewritten Bengali news into professional journalistic English.
3. List the major editorial changes made (in Bengali).

Return ONLY a valid JSON object. Format:
{
  "rewritten": "The rewritten Bengali text.",
  "english": "The English translation.",
  "changes": ["'আজকে' → 'আজ' করা হয়েছে", "বাক্যের গঠন সুন্দর করা হয়েছে"]
}`;

// --- PRIMARY PROVIDER: GEMINI ---
async function fetchFromGemini(systemPrompt, userText) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userText }] }],
      generationConfig: { 
        temperature: 0.1, 
        maxOutputTokens: 4096,
        responseMimeType: "application/json" 
      },
    }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini API failed");
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// --- SECONDARY PROVIDER: GROQ ---
async function fetchFromGroq(systemPrompt, userText) {
  const apiKey = process.env.GROQ_API_KEY;
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', 
      response_format: { type: "json_object" }, 
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
// This is the function the other files are looking for!
export async function callGemini(systemPrompt, userText) {
  let rawText = "";
  
  try {
    rawText = await fetchFromGemini(systemPrompt, userText);
  } catch (error) {
    console.warn("Primary API failed. Engaging Groq fallback...", error.message);
    rawText = await fetchFromGroq(systemPrompt, userText);
  }
  
  let cleaned = rawText.trim();
  const fence = String.fromCharCode(96, 96, 96); 
  
  if (cleaned.startsWith(fence + "json")) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith(fence)) cleaned = cleaned.substring(3);
  
  if (cleaned.endsWith(fence)) cleaned = cleaned.substring(0, cleaned.length - 3);
  
  return JSON.parse(cleaned.trim());
}
