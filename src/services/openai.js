import OpenAI from "openai";

const ENV_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: ENV_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const Why_Do_Anything_Questions = [
  "What’s driving the urgency to solve this now?",
  "Why has this become a priority now?",
  "What happens if this problem is not addressed?"
];

export const BusinessValue_Questions = [
  "If this were solved, what measurable improvement would you expect?",
  "How much time, revenue, or productivity is being impacted today?",
  "What business metrics are you hoping to improve?"
];

export const KeyContacts_Questions = [
  "Who is most motivated to solve this problem?",
  "Who would champion this internally?",
  "Who ultimately approves initiatives like this?"  
];

export const DECISIONMAP_Questions = [
  "If we mapped out the path to a final decision, what steps would need to happen and who would be involved?",
  "What are the most important evaluation criteria?",
  "What does the approval process look like?",
  "What internal procurement, legal, or security steps should we plan for?"
];

export const CURRENTENVIRONMENT_Questions = [
  "What does the current process look like?",
  "What other solutions are being considered?",
  "What concerns or risks do you see with moving forward?"  
];

export const NextSteps_Questions = [
  "What would make sense as a next step from here?",
  "What additional information would be helpful for your team?",
  "Who should be involved in the next conversation?"  
];

export const ALL_QUESTIONS = [
  ...Why_Do_Anything_Questions,
  ...BusinessValue_Questions,
  ...KeyContacts_Questions,
  ...NextSteps_Questions,
  ...DECISIONMAP_Questions,
  ...CURRENTENVIRONMENT_Questions
];

// Updated to accept a custom list of questions to track
export async function getSalesCoaching(transcriptChunk, questionsToTrack = ALL_QUESTIONS) {
  if (!ENV_API_KEY) {
    console.error("[Q4Magic] No API Key found in .env file!");
    return null;
  }

  const systemPrompt = `
You are an expert Sales Coach specializing in the MEDDIC methodology.
Your goal is to analyze a live meeting transcript and provide coaching.

QUESTIONS TO TRACK:
${questionsToTrack.map(q => `- ${q}`).join('\n')}

TASK:
1. Analyze the provided transcript chunk.
2. If you find information that answers any of the "QUESTIONS TO TRACK", provide a **concise summary** of what was said.
   - **DO NOT** use direct quotes or copy-paste dialogue.
   - **Summarize** the core intent, specific details, and context provided by the participants in a professional tone.
   - If a question has already been answered in previous chunks but the new chunk provides **additional details**, update the answer accordingly.
3. Provide 1-2 brief, high-impact MEDDIC coaching tips (max 20 words).

RESPONSE FORMAT:
You MUST return a valid JSON object with this exact structure:
{
  "extracted_answers": [
    {
      "question": "The exact question text from the tracking list",
      "answer": "A concise summary of the participant's answer (max 40 words)",
      "status": "answered"
    }
  ],
  "coaching": "Your MEDDIC coaching tip here"
}

If no answers are found, "extracted_answers" should be an empty array [].
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Transcript Context: ${transcriptChunk}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
    });

    const responseText = completion.choices[0].message.content;
    const responseJson = JSON.parse(responseText);
    // console.log("[Q4Magic] AI JSON Response:", responseJson);
    return responseJson;
  } catch (error) {
    console.error("OpenAI SDK Error:", error);
    return null;
  }
}

// New function: final meeting summary
export async function getMeetingSummary(fullTranscript, capturedAnswers) {
  if (!ENV_API_KEY) {
    console.error("[Q4Magic] No API Key found for summary!");
    return null;
  }

  const systemPrompt = `
You are an expert Sales Coach. Given the full meeting transcript and the answers already captured during the conversation, produce a final MEDDIC‑compliant summary.

Structured output required:

{
  "Why_Do_Anything": "Summarize the customer's pain points, desired outcomes, and consequences of inaction. Use captured answers and transcript.",
  "BusinessValue": "Summarize success metrics, ROI expectations, and what prompted the search for a solution.",
  "KeyContacts": [
    {
      "name": "Full Name",
      "title": "Title/Role (Champion, Economic Buyer, etc.)"
    }
  ],
  "NextSteps": "Summarize agreed next steps, decision timeline, and implementation plan.",
  "DecisionMap": "Summarize the decision process, timeline, procurement, security or legal steps and evaluation criteria.",
  "CurrentEnvironment": "Summarize the customer's current environment, process, tech stack, and any alternative solutions or competitors considered."
}

If a category has no information, set its value to null.
Use professional, concise language. Max 40 words per category.
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Full Transcript: ${fullTranscript}\n\nPreviously Captured Answers (JSON): ${JSON.stringify(capturedAnswers)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const summaryJson = JSON.parse(completion.choices[0].message.content);
    return summaryJson;
  } catch (error) {
    console.error("Final summary error:", error);
    return null;
  }
}