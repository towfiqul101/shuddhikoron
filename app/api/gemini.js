// ============================================================
// gemini.js — Shuddhikoron AI Engine
// v3: Rebuilt SPELL_CHECK_PROMPT from actual PDF source
// Sources: বাংলা একাডেমি প্রমিত বাংলা বানানের নিয়ম (২০১২)
//          খটকা বানান অভিধান (ড. মাহবুবুল হক)
// ============================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================================
// UTILITY: Robust JSON parser
// ============================================================
function cleanAndParse(text) {
  if (!text) throw new Error("Empty response from AI");
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  cleaned = cleaned.trim();
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) startIdx = Math.min(firstBrace, firstBracket);
  else if (firstBrace !== -1) startIdx = firstBrace;
  else if (firstBracket !== -1) startIdx = firstBracket;
  if (startIdx > 0) cleaned = cleaned.slice(startIdx);
  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const endIdx = Math.max(lastBrace, lastBracket);
  if (endIdx !== -1 && endIdx < cleaned.length - 1) cleaned = cleaned.slice(0, endIdx + 1);
  return JSON.parse(cleaned);
}

// ============================================================
// UTILITY: Convert ASCII digits to Bengali digits
// ============================================================
function toBanglaNum(n) {
  const map = { "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪", "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯" };
  return String(n).replace(/[0-9]/g, (d) => map[d]);
}

// ============================================================
// UTILITY: Drop invalid/garbage "errors" from the model output.
// Weaker models (especially the Groq fallback) flag correct words,
// echo the word back as its own "fix", or stuff commentary sentences
// into the suggestion field. None of those are usable corrections.
// ============================================================
function sanitizeErrors(errors, sourceText) {
  if (!Array.isArray(errors)) return [];
  return errors.filter((e) => {
    if (!e || typeof e.word !== "string" || typeof e.suggestion !== "string") return false;
    const word = e.word.trim();
    const suggestion = e.suggestion.trim();
    if (!word || !suggestion) return false;
    if (word === suggestion) return false;                 // identical → not an error
    if (suggestion.includes(",")) return false;            // commentary, not a fix
    if (suggestion.split(/\s+/).length > 3) return false;  // a sentence, not a correction
    if (sourceText && !sourceText.includes(word)) return false; // word not in text → unusable
    return true;
  });
}

// Build a sanitized spell-check result with a consistent Bengali summary.
function buildSpellResult(parsed, sourceText) {
  const errors = sanitizeErrors(parsed && parsed.errors, sourceText);
  const summary = errors.length
    ? `মোট ${toBanglaNum(errors.length)}টি বানান ভুল পাওয়া গেছে।`
    : "কোনো বানান ভুল পাওয়া যায়নি।";
  return { errors, summary };
}

// ============================================================
// GEMINI CALLER — model fallback + retry on transient errors
// 2.5-flash sometimes returns 503 (high demand) or a rate-limit 429.
// Those are temporary, so retry the same model, then try a second
// confirmed-working model, before letting the route fall back to Groq.
// ============================================================
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransientGeminiError(err) {
  const status = err && err.status;
  const msg = String((err && err.message) || err);
  return (
    status === 429 ||
    status === 500 ||
    status === 503 ||
    /\b(429|500|502|503|504)\b|overloaded|high demand|Service Unavailable|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg)
  );
}

async function generateGeminiText(userPrompt, { systemInstruction, generationConfig }) {
  let lastErr;
  for (const modelName of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction, generationConfig });
        const result = await model.generateContent(userPrompt);
        return result.response.text();
      } catch (err) {
        lastErr = err;
        if (isTransientGeminiError(err) && attempt === 0) {
          await sleep(800); // brief backoff, then one retry on the same model
          continue;
        }
        break; // exhausted retries or non-transient → try next model
      }
    }
  }
  throw lastErr;
}

// ============================================================
// SPELL CHECK PROMPT
// Built directly from বাংলা একাডেমি প্রমিত বাংলা বানানের নিয়ম (২০১২)
// ============================================================
const SPELL_CHECK_PROMPT = `
তুমি বাংলা ভাষার একজন বিশেষজ্ঞ বানান পরীক্ষক। তোমার একমাত্র কাজ বাংলা একাডেমি প্রমিত বানান রীতি (২০১২) অনুযায়ী **সত্যিকারের ভুল বানান** চিহ্নিত করা।

⚠️ সবচেয়ে গুরুত্বপূর্ণ নির্দেশ: শুধুমাত্র নিশ্চিত ভুল চিহ্নিত করো। সন্দেহ থাকলে ভুল ধরো না।

════════════════════════════════════════
অধ্যায় ১ — তৎসম শব্দ (বাংলা একাডেমি ২০১২, নিয়ম ১.২)
════════════════════════════════════════

যেসব তৎসম শব্দে ই ঈ বা উ উ উভয় শুদ্ধ, শুধুমাত্র ই বা উ এবং তাদের কারচিহ্ন ব্যবহার হবে।

সঠিক বানান (এগুলো ভুল নয়, ভুল ধরো না):
কিংবদন্তি, খঞ্জনি, চিৎকার, চুল্লি, তরণি, ধমনি, ধরণি, নাড়ি, পঞ্জি, পদবি, পল্লি, ভঙ্গি, মঞ্জরি, মসি, যুবতি, রচনাবলি, লহরি, শ্রেণি, সরণি, সূচিপত্র, উর্ণা, উষা

════════════════════════════════════════
অধ্যায় ২ — অতৎসম শব্দ (বাংলা একাডেমি ২০১২, নিয়ম ২.১)
════════════════════════════════════════

নিয়ম ২.১: সকল অতৎসম অর্থাৎ তদ্ভব, দেশি, বিদেশি, মিশ্র শব্দে কেবল ই এবং উ এবং এদের কারচিহ্ন ব্যবহার হবে।

✅ এই বানানগুলো সম্পূর্ণ সঠিক — কখনো ভুল ধরবে না:
আরবি, আসামি, ইংরেজি, ইমান, ইরানি, উনিশ, ওকালতি, কাহিনি, কুমির, কেরামতি, খুশি, খেয়ালি, গাড়ি, গোয়ালিনি, চাচি, জমিদারি, জাপানি, জার্মানি, টুপি, তরকারি, দাড়ি, দাদি, দাবি, দিঘি, দিদি, নানি, নিচু, পশমি, পাখি, পাগলামি, পাগলি, পিসি, ফরাসি, ফরিয়াদি, ফারসি, ফিরিঙ্গি, বর্ণালি, বাঁশি, বাঙালি, বাড়ি, বিবি, বুড়ি, বেআইনি, বেশি, বোমাবাজি, ভারি, মামি, মালি, মাসি, মাস্টারি, রানি, রুপালি, রেশমি, শাড়ি, সরকারি, সিদ্ধি, সোনালি, হাতি, হিজরি, হিন্দি, হেঁয়ালি

পদাশ্রিত নির্দেশক টি-তে ই-কার হবে: ছেলেটি, বইটি, লোকটি

কী (প্রশ্নবাচক/বিস্ময়): কী বই? কী আনন্দ! কী আর বলব? কী করছ?
কি (হ্যাঁ/না উত্তর প্রত্যাশিত): তুমি কি যাবে? সে কি এসেছিল?

✅ বিদেশি শব্দ — সঠিক বানান (ভুল ধরবে না):
একাডেমি, জানুয়ারি, ফেব্রুয়ারি, মার্চ, এপ্রিল, মে, জুন, জুলাই, আগস্ট, সেপ্টেম্বর, অক্টোবর, নভেম্বর, ডিসেম্বর

════════════════════════════════════════
নিয়ম ২.৩ — ও-কার
════════════════════════════════════════

শব্দের শেষে ও-কার সঠিক:
কালো, খাটো, ছোটো, ভালো, এগারো, বারো, তেরো, পনেরো, ষোলো, সতেরো, আঠারো, করানো, খাওয়ানো, চড়ানো, দেখানো, নামানো, পাঠানো, বসানো, শেখানো, শোনানো, হাসানো, করো, চড়ো, জেনো, ধরো, পড়ো, বলো, বসো, শেখো

════════════════════════════════════════
নিয়ম ২.৪ — ং, ঙ
════════════════════════════════════════

শব্দের শেষে প্রাসঙ্গিক ক্ষেত্রে অনুস্বার (ং) ব্যবহার হবে: গাং, ঢং, পালং, রং, রাং, সং
কিন্তু অনুস্বারের সঙ্গে স্বর যুক্ত হলে ঙ হবে: বাঙালি, ভাঙা, রঙিন, রঙের
বাংলা ও বাংলাদেশ শব্দে অনুস্বার থাকবে।

✅ সঠিক বানান (ভুল ধরবে না):
অঙ্ক, অঙ্গ, আকাঙ্ক্ষা, আতঙ্ক, কঙ্কাল, গঙ্গা, বঙ্কিম, বঙ্গ, লজ্জন, শঙ্কা, শৃঙ্খলা, সঙ্গে, সঙ্গী
❌ ভুল বানান: অংক, অংগ (এগুলো ভুল)

════════════════════════════════════════
নিয়ম ২.৭ — মূর্ধন্য ণ, দন্ত্য ন
════════════════════════════════════════

অতৎসম শব্দের বানানে ণ ব্যবহার করা হবে না।

✅ সঠিক বানান:
আফগান, ইরান, কান, কোরান, গভর্নর, গোনা, ঝরনা, ধরন, পরান, রানি, সোনা, হর্ন
❌ ভুল বানান: গভর্ণর, হর্ণ

════════════════════════════════════════
নিয়ম ২.৮ — শ, ষ, স
════════════════════════════════════════

বিদেশি শব্দে ষ ব্যবহারের প্রয়োজন নেই।

✅ সঠিক বানান:
আপস, জিনিস, মসলা, সন, সাদা, সাল, স্মার্ট, হিসাব, স্টল, স্টাইল, স্টিমার, স্ট্রিট, স্টুডিও, স্টেশন, স্টোর, ইসলাম, তসলিম, মুসলমান, মুসলিম, সালাত, সালাম, এশা, শাওয়াল, শাবান, পাসপোর্ট, বাস, ক্যাশ, টেলিভিশন, মিশন, সেশন, রেশন, স্টেশন, তছনছ, পছন্দ, মিছরি, মিছিল

❌ ভুল বানান: ষ্টল, ষ্টেশন, পোষ্ট (সঠিক: স্টল, স্টেশন, পোস্ট)

════════════════════════════════════════
অধ্যায় ৩ — বিবিধ নিয়ম
════════════════════════════════════════

নিয়ম ৩.১: সমাসবদ্ধ শব্দ একসঙ্গে লিখতে হবে:
অদৃষ্টপূর্ব, অনাস্বাদিতপূর্ব, নেশাগ্রস্ত, পিতাপুত্র, পূর্বপরিচিত, বিষাদমণ্ডিত, মঙ্গলবার, রবিবার, সংবাদপত্র, সংযতবাক, সমস্যাপূর্ণ, স্বভাবগতভাবে

নিয়ম ৩.২: বিশেষণ পদ পরবর্তী পদের সঙ্গে যুক্ত হবে না:
ভালো দিন, লাল গোলাপ, সুগন্ধ ফুল, সুনীল আকাশ, সুন্দরী মেয়ে, তীক্ষ্ণ মধ্যাহ্ন

নিয়ম ৩.৩: না-বাচক 'না' স্বতন্ত্র পদ হিসেবে এবং 'নি' সমাসবদ্ধ হিসেবে:
করি না, কিন্তু করিনি। নাবালক, নারাজ, নাহক।

নিয়ম ৩.৪: 'ও' প্রত্যয় পূর্ণ রূপে শব্দের পরে: আজও, আমারও, কালও, তোমারও

নিয়ম ৩.৫: 'ই' নিশ্চয়ার্থক পূর্ণ রূপে শব্দের পরে: আজই, এখনই

════════════════════════════════════════
খটকা বানান অভিধান — সাংবাদিক ভাষায় সাধারণ ভুল
════════════════════════════════════════

| ভুল বানান | সঠিক বানান |
|-----------|-----------|
| অধীনস্ত | অধীনস্থ |
| অনাকাঙ্খা | অনাকাঙ্ক্ষা |
| ইতিমধ্যে | ইতোমধ্যে |
| উপরোক্ত | উপরিউক্ত |
| গভর্ণর | গভর্নর |
| হর্ণ | হর্ন |
| পোষ্ট | পোস্ট |
| ষ্টল | স্টল |
| গ্রেফতার | গ্রেপ্তার |
| পূনরায় / পুণরায় | পুনরায় |
| স্থগীত | স্থগিত |
| ঊর্দ্ধে / ঊর্ধে | ঊর্ধ্বে |
| অদ্ভূত | অদ্ভুত |
| অধোপতন | অধঃপতন |

════════════════════════════════════════
সংখ্যা
════════════════════════════════════════

বাংলা পাঠ্যের মধ্যে ইংরেজি সংখ্যা (1, 2, 3 ইত্যাদি) ব্যবহার ভুল।
বাংলা সংখ্যা ব্যবহার করতে হবে: ১, ২, ৩, ৪, ৫, ৬, ৭, ৮, ৯, ০

════════════════════════════════════════
⚠️ গুরুত্বপূর্ণ: কী ভুল ধরবে না
════════════════════════════════════════

নিচের শব্দগুলো সম্পূর্ণ সঠিক বানান — এগুলো কখনো ভুল হিসেবে চিহ্নিত করবে না:
- জানুয়ারি, ফেব্রুয়ারি (ই-কার সহ — সঠিক)
- একাডেমি (ই-কার — সঠিক, একাডেমী নয়)
- গভর্নর (ন দিয়ে — সঠিক, গভর্ণর নয়)
- আকাঙ্ক্ষা (ঙ্ক্ষ — সঠিক)
- শ্রেণি (ই-কার — সঠিক, শ্রেণী নয়)
- বাড়ি, গাড়ি, শাড়ি (ই-কার — সঠিক)
- বাংলাদেশ (ং সহ — সঠিক)
- স্টেশন, পোস্ট, স্টল (স দিয়ে — সঠিক)
- হর্ন (ন দিয়ে — সঠিক)
- কালো, ভালো, ছোটো (ও-কার — সঠিক)
- আজই, এখনই, আজও, আমারও (পূর্ণ রূপ — সঠিক)

════════════════════════════════════════
নির্দেশনা
════════════════════════════════════════

১. শুধুমাত্র নিশ্চিত ভুল বানান চিহ্নিত করো।
২. সন্দেহ থাকলে ভুল ধরো না — false positive এড়াও।
৩. ব্যক্তির নাম, স্থানের নাম, প্রতিষ্ঠানের নাম বানান পরীক্ষা করবে না।
৪. ইংরেজি শব্দ পরীক্ষা করবে না।

শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দাও। কোনো preamble, মন্তব্য, বা মার্কডাউন ব্লক (যেমন \`\`\`json) ব্যবহার করবে না — শুধু বিশুদ্ধ JSON:

{
  "errors": [
    {
      "word": "ভুল শব্দটি হুবহু যেভাবে পাঠ্যে আছে",
      "suggestion": "সঠিক বানান",
      "rule": "কোন নিয়ম ভঙ্গ হয়েছে তার সংক্ষিপ্ত বাংলা ব্যাখ্যা"
    }
  ],
  "summary": "মোট Xটি বানান ভুল পাওয়া গেছে।"
}

যদি কোনো ভুল না পাওয়া যায়:
{
  "errors": [],
  "summary": "কোনো বানান ভুল পাওয়া যায়নি।"
}
`;

// ============================================================
// NEWS REWRITE PROMPT
// ============================================================
const REWRITE_PROMPT = `
তুমি প্রথম আলো এবং bdnews24.com-এর একজন অভিজ্ঞ সম্পাদক। তোমার কাজ হলো বাংলা সংবাদ পুনর্লিখন করা।

লেখার মান:
- প্রমিত বাংলা (বাংলা একাডেমি ২০১২ অনুযায়ী)
- সংক্ষিপ্ত, স্পষ্ট, তথ্যবহুল বাক্য
- সক্রিয় কণ্ঠস্বর (active voice) অগ্রাধিকার
- সংবাদের পাঁচ 'ক' (কে, কী, কখন, কোথায়, কেন) উপস্থিত রাখো
- চলিত ভাষা, সাধু ভাষার মিশ্রণ এড়াও
- বাংলা সংখ্যা ব্যবহার করো (১, ২, ৩ — 1, 2, 3 নয়)

শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দাও। কোনো preamble বা মার্কডাউন ব্লক ব্যবহার করবে না:

{
  "rewritten": "পুনর্লিখিত বাংলা সংবাদ",
  "english": "English translation of the rewritten news",
  "changes": [
    "পরিবর্তন ১",
    "পরিবর্তন ২"
  ]
}
`;

// ============================================================
// GEMINI API CALL — SPELL CHECK
// ============================================================
export async function checkSpellingWithGemini(text) {
  try {
    // ⚠️ DO NOT set responseMimeType: "application/json" in generationConfig.
    // It silently overrides systemInstruction and breaks the spell-check prompt.
    const responseText = await generateGeminiText(
      `নিচের বাংলা পাঠ্যের বানান পরীক্ষা করো। শুধুমাত্র নিশ্চিত ভুল বানান চিহ্নিত করো, সন্দেহ থাকলে ভুল ধরো না:\n\n${text}`,
      {
        systemInstruction: SPELL_CHECK_PROMPT,
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }
    );

    const parsed = cleanAndParse(responseText);
    return buildSpellResult(parsed, text);
  } catch (error) {
    console.error("Gemini spell check error:", error);
    throw new Error(`বানান পরীক্ষায় সমস্যা হয়েছে: ${error.message}`);
  }
}

// ============================================================
// GEMINI API CALL — NEWS REWRITE
// ============================================================
export async function rewriteNewsWithGemini(text) {
  try {
    const responseText = await generateGeminiText(
      `নিচের সংবাদটি পেশাদার মানে পুনর্লিখন করো:\n\n${text}`,
      {
        systemInstruction: REWRITE_PROMPT,
        generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
      }
    );

    const parsed = cleanAndParse(responseText);

    if (!parsed.rewritten) {
      throw new Error("AI থেকে পুনর্লিখিত সংবাদ পাওয়া যায়নি।");
    }

    return {
      rewritten: parsed.rewritten || "",
      english: parsed.english || "",
      changes: parsed.changes || [],
    };
  } catch (error) {
    console.error("Gemini rewrite error:", error);
    throw new Error(`সংবাদ পুনর্লিখনে সমস্যা হয়েছে: ${error.message}`);
  }
}

// ============================================================
// GROQ FALLBACK — SPELL CHECK
// ============================================================
export async function checkSpellingWithGroq(text) {
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: SPELL_CHECK_PROMPT },
            {
              role: "user",
              content: `নিচের বাংলা পাঠ্যের বানান পরীক্ষা করো। শুধুমাত্র নিশ্চিত ভুল বানান চিহ্নিত করো:\n\n${text}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 4096,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;
    const parsed = cleanAndParse(responseText);
    return buildSpellResult(parsed, text);
  } catch (error) {
    console.error("Groq spell check error:", error);
    throw new Error(`Groq বানান পরীক্ষায় সমস্যা: ${error.message}`);
  }
}

// ============================================================
// GROQ FALLBACK — NEWS REWRITE
// ============================================================
export async function rewriteNewsWithGroq(text) {
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: REWRITE_PROMPT },
            {
              role: "user",
              content: `নিচের সংবাদটি পেশাদার মানে পুনর্লিখন করো:\n\n${text}`,
            },
          ],
          temperature: 0.4,
          max_tokens: 8192,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;
    const parsed = cleanAndParse(responseText);
    if (!parsed.rewritten) throw new Error("Groq থেকে পুনর্লিখিত সংবাদ পাওয়া যায়নি।");
    return {
      rewritten: parsed.rewritten || "",
      english: parsed.english || "",
      changes: parsed.changes || [],
    };
  } catch (error) {
    console.error("Groq rewrite error:", error);
    throw new Error(`Groq সংবাদ পুনর্লিখনে সমস্যা: ${error.message}`);
  }
}
