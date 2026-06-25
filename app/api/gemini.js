// ============================================================
// gemini.js — Shuddhikoron AI Engine
// Fixed: removed responseMimeType bug, rebuilt SPELL_CHECK_PROMPT
// ============================================================

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================================
// UTILITY: Robust JSON parser that handles markdown fences
// ============================================================
function cleanAndParse(text) {
  if (!text) throw new Error("Empty response from AI");

  // Strip markdown code fences if present
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  cleaned = cleaned.trim();

  // Find the first { or [ to handle any preamble text
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");

  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx > 0) {
    cleaned = cleaned.slice(startIdx);
  }

  // Find matching end
  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const endIdx = Math.max(lastBrace, lastBracket);
  if (endIdx !== -1 && endIdx < cleaned.length - 1) {
    cleaned = cleaned.slice(0, endIdx + 1);
  }

  return JSON.parse(cleaned);
}

// ============================================================
// SPELL CHECK PROMPT
// Sources:
//   - বাংলা একাডেমি প্রমিত বাংলা বানানের নিয়ম (২০১২)
//   - খটকা বানান অভিধান (ড. মাহবুবুল হক)
//   - ২৬০+ বাংলা সমার্থক শব্দ (embedded below for context)
// ============================================================
const SPELL_CHECK_PROMPT = `
তুমি বাংলা ভাষার একজন বিশেষজ্ঞ বানান পরীক্ষক। তুমি বাংলা একাডেমি প্রমিত বানান রীতি (২০১২) এবং সাংবাদিক লেখার মান অনুসরণ করো।

=== বাংলা একাডেমি প্রমিত বানানের মূল নিয়ম (২০১২) ===

১. ই-কার বনাম ঈ-কার:
- বিদেশি/আগত শব্দে সর্বদা ই-কার ব্যবহার করতে হবে, ঈ-কার নয়।
- সঠিক: আমদানি, আলমারি, চাকরি, ইংরেজি, হিন্দি, উর্দু, জানুয়ারি, ফেব্রুয়ারি, মার্চ, এপ্রিল, জুলাই, আগস্ট, সেপ্টেম্বর, অক্টোবর, নভেম্বর, ডিসেম্বর
- ভুল: আমদানী, আলমারী, চাকরী, ইংরেজী, হিন্দী

- তৎসম শব্দ: শ্রেণি (NOT শ্রেণী), মূর্তি (NOT মূর্তী), শান্তি (NOT শান্তী), পরিণতি (NOT পরিণতী), শক্তি (NOT শক্তী), ব্যক্তি (NOT ব্যক্তী), প্রকৃতি (NOT প্রকৃতী), জাতি (NOT জাতী), রীতি (NOT রীতী), নীতি (NOT নীতী), কীর্তি (NOT কীর্তী), সংগতি, অনুমতি, গতি, স্থিতি, উন্নতি, অবনতি, সমিতি, পরিচিতি

২. ণ-ত্ব বিধান ও ষ-ত্ব বিধান:
- বিদেশি শব্দে ণ ও ষ ব্যবহার বর্জনীয়
- সঠিক: স্টেশন, মাস্টার, পোস্ট, রেস্তোরাঁ, গভর্নর
- ভুল: ষ্টেশন, মাষ্টার, পোষ্ট, রেষ্টুরেন্ট, গভর্ণর

৩. অনুনাসিক:
- সঠিক: অঙ্ক, অঙ্গ, অঙ্গীকার, বাংলা, সংখ্যা, লঙ্কা
- ভুল: অংক, অংগ, অংগীকার (ঙ-এর পরিবর্তে ং বসানো ভুল যেখানে ঙ হওয়া উচিত)

৪. প্রমিত কিছু বিশেষ বানান:
- অদ্ভুত (NOT অদ্ভূত)
- অধঃপতন (NOT অধোপতন)
- সত্যিকার (NOT সত্যিকারের — সাংবাদিক ভাষায়)
- একটু (NOT এক টু)
- আবার (NOT আবারও — যদি না জোর দেওয়া হয়)
- ছাড়া (NOT ছাড়াও — প্রসঙ্গ অনুযায়ী)

৫. সংখ্যা:
- বাংলা পাঠ্যের মধ্যে ইংরেজি সংখ্যা (1, 2, 3 ইত্যাদি) ব্যবহার সঠিক নয়
- বাংলা সংখ্যা ব্যবহার করতে হবে: ১, ২, ৩, ৪, ৫, ৬, ৭, ৮, ৯, ০

=== খটকা বানান অভিধান (ড. মাহবুবুল হক) — নির্বাচিত নিয়ম ===

নিচের বানানগুলো সংবাদপত্রে প্রায়ই ভুল লেখা হয়:

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
| স্বাক্ষী | সাক্ষী |
| স্বাক্ষর | স্বাক্ষর (এটি সঠিক — "নিজের নাম লেখা") |
| সাক্ষর | সাক্ষর (এটি সঠিক — "শিক্ষিত/লিখতে পারে") |
| পূনরায় | পুনরায় |
| পুণরায় | পুনরায় |
| বিভ্রান্তি | বিভ্রান্তি (সঠিক) |
| বিভ্রান্তী | বিভ্রান্তি (সঠিক) |
| গ্রেফতার | গ্রেপ্তার |
| মামলা-মোকদ্দমা | মামলা-মোকাদ্দমা |
| স্থগীত | স্থগিত |
| ঊর্ধে | ঊর্ধ্বে |
| ঊর্দ্ধে | ঊর্ধ্বে |
| শতকরা | শতকরা (সঠিক) |
| প্রতিষেধক | প্রতিষেধক (সঠিক) |
| প্রতিষেধক | প্রতিষেধক (সঠিক) |
| কার্যকরী | কার্যকর (বিশেষণ হিসেবে) |
| পদত্যাগ | পদত্যাগ (সঠিক) |
| প্রয়োজনীয় | প্রয়োজনীয় (সঠিক) |
| নিরাপত্তা | নিরাপত্তা (সঠিক) |
| নিরাপত্তাহীন | নিরাপত্তাহীন (সঠিক) |

=== সাংবাদিক বাংলার বিশেষ নিয়ম ===

১. ক্রিয়া রূপ: সংবাদে সাধু ও চলিত মিশ্রণ করা যাবে না।
২. বিরামচিহ্ন: বাংলায় দাঁড়ি (।) ব্যবহার করতে হবে, ইংরেজি পিরিয়ড (.) নয়।
৩. উদ্ধৃতি চিহ্ন: বাংলায় " " বা ' ' ব্যবহার সমান গ্রহণযোগ্য।
৪. কারক বিভক্তি: "র" ও "এর" — সংবাদে "এর" অধিক প্রচলিত।
৫. তারিখ: বাংলা সংখ্যায় লিখতে হবে। যেমন: ১৫ আগস্ট, ২০২৪।

=== নির্দেশনা ===

তোমাকে যে বাংলা পাঠ্য দেওয়া হবে, তা মনোযোগ দিয়ে পড়ো এবং:
- প্রতিটি বানান ভুল চিহ্নিত করো
- প্রতিটি ভুল শব্দের সঠিক বানান দাও
- কোন নিয়ম লঙ্ঘিত হয়েছে তা বাংলায় সংক্ষেপে ব্যাখ্যা করো

শুধুমাত্র নিচের JSON ফরম্যাটে উত্তর দাও। কোনো preamble, মন্তব্য, বা মার্কডাউন ব্লক (যেমন \`\`\`json) ব্যবহার করবে না। শুধু বিশুদ্ধ JSON রিটার্ন করো:

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

যদি কোনো ভুল না পাওয়া যায়, তাহলে:
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
- বাংলা সংখ্যা ব্যবহার করো

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
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: SPELL_CHECK_PROMPT,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        // ⚠️ DO NOT add responseMimeType: "application/json" here.
        // It silently overrides systemInstruction and breaks everything.
      },
    });

    const result = await model.generateContent(
      `নিচের বাংলা পাঠ্যের বানান পরীক্ষা করো:\n\n${text}`
    );

    const responseText = result.response.text();
    const parsed = cleanAndParse(responseText);

    // Validate structure
    if (!parsed.errors || !Array.isArray(parsed.errors)) {
      return { errors: [], summary: "কোনো বানান ভুল পাওয়া যায়নি।" };
    }

    return parsed;
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
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: REWRITE_PROMPT,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
        // ⚠️ DO NOT add responseMimeType: "application/json" here.
      },
    });

    const result = await model.generateContent(
      `নিচের সংবাদটি পেশাদার মানে পুনর্লিখন করো:\n\n${text}`
    );

    const responseText = result.response.text();
    const parsed = cleanAndParse(responseText);

    // Validate structure
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
// (Used if Gemini fails or quota exceeded)
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
            {
              role: "system",
              content: SPELL_CHECK_PROMPT,
            },
            {
              role: "user",
              content: `নিচের বাংলা পাঠ্যের বানান পরীক্ষা করো:\n\n${text}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;
    const parsed = cleanAndParse(responseText);

    if (!parsed.errors || !Array.isArray(parsed.errors)) {
      return { errors: [], summary: "কোনো বানান ভুল পাওয়া যায়নি।" };
    }

    return parsed;
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
            {
              role: "system",
              content: REWRITE_PROMPT,
            },
            {
              role: "user",
              content: `নিচের সংবাদটি পেশাদার মানে পুনর্লিখন করো:\n\n${text}`,
            },
          ],
          temperature: 0.4,
          max_tokens: 8192,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;
    const parsed = cleanAndParse(responseText);

    if (!parsed.rewritten) {
      throw new Error("Groq থেকে পুনর্লিখিত সংবাদ পাওয়া যায়নি।");
    }

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
