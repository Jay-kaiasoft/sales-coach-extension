import OpenAI from "openai";

const ENV_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: ENV_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const Why_Do_Anything_Questions = [
  "What are the reasons you’re looking to do anything?",
  "What do you envision as the ideal solution?",
  "What happens if you don’t improve?"
];

export const BusinessValue_Questions = [
  "How will you measure success (are there key metrics such as saving time, money etc. that will be impacted)?",
  "Have you calculated an ROI?",
  "What prompted you to look at our solution? Is there any particular area we stand out from the competition?"
];

export const KeyContacts_Questions = [
  "Who are the participants and what are their titles/roles?",
  "Who else needs to be involved in making this decision?",
  "Who will champion this project internally?",
  "Who is your economic buyer?",
  "Who will make the final decision?"
];

export const NextSteps_Questions = [
  "What are the next steps?",
  "When do you expect a decision to be made?",
  "What is the timeline for implementation?",
  "What are the next steps for us to move forward?"
];

export const ALL_QUESTIONS = [
  ...Why_Do_Anything_Questions,
  ...BusinessValue_Questions,
  ...KeyContacts_Questions,
  ...NextSteps_Questions
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
  "NextSteps": "Summarize agreed next steps, decision timeline, and implementation plan."
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