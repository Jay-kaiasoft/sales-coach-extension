import OpenAI from "openai";

const ENV_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: ENV_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const Why_Do_Anything_Questions = [
  "What’s driving the urgency to solve this now?",
  "How is this issue impacting the business today?",
  "What happens if this problem is not addressed?"
];

export const BusinessValue_Questions = [
  "If this were solved, what measurable business improvement would you expect?",
  "How is this impacting revenue, productivity, time, or cost today?",
  "What key business metrics are you hoping to improve?",
  "What business outcomes matter most to the executive sponsor?"
];

export const EconomicBuyer_Questions = [
  "Who ultimately approves initiatives like this?"
];

export const Champion_Questions = [
  "Who is most motivated to solve this problem?",
  "Who would champion this internally?"
];

export const DecisionCriteria_Questions = [
  "What business or technical requirements are most important in selecting a solution?"
];

export const DecisionProcess_Questions = [
  "If we mapped out the path to a final decision, what steps would need to happen and who would be involved?"
];

export const PaperProcess_Questions = [
  "What internal procurement, legal, or security steps should we plan for?",
  "What typically slows down or delays the purchasing process?"
];

export const CURRENTENVIRONMENT_Questions = [
  "What solutions or processes are in place today?",
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
  ...EconomicBuyer_Questions,
  ...Champion_Questions,
  ...DecisionCriteria_Questions,
  ...DecisionProcess_Questions,
  ...PaperProcess_Questions,
  ...CURRENTENVIRONMENT_Questions,
  ...NextSteps_Questions
];

// Helper to generate SHA-256 hash for prompt cache key
async function getHash(string) {
  try {
    const utf8 = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let hash = 0;
    for (let i = 0; i < string.length; i++) {
      const char = string.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return "fallback-" + Math.abs(hash);
  }
}

// Updated to accept a custom list of questions to track
export async function getSalesCoaching(transcriptChunk, questionsToTrack = ALL_QUESTIONS) {
  if (!ENV_API_KEY) {
    console.error("[Q4Magic] No API Key found in .env file!");
    return null;
  }

  const systemPrompt = `
  # 360Pipe Discovery Intelligence Framework

## Purpose

360Pipe is a real-time sales intelligence platform designed to analyze discovery conversations, identify completed discovery areas, map information to MEDDPICC, generate executive summaries, and provide actionable next steps.

The platform should only use information explicitly provided by the buyer/prospect/customer.

---

# Discovery Question Library Examples bellow

## Why Change

Category: Identify Pain

## Business Value

Category: Metrics

## Economic Buyer

Category: Economic Buyer

## Champion

Category: Champion

## Decision Criteria

Category: Decision Criteria

## Decision Process

Category: Decision Process

## Paper Process

Category: Paper Process

## Current Environment

Category: Current State

Category: Competition

Category: Risk Assessment

## Next Steps

Category: Next Steps

# End of Call Summary Sections

1. Meeting Summary
2. Why Change
3. Business Value
4. Buying Team
5. Decision Framework
6. Current Environment
7. Risks
8. Next Steps
9. Discovery Coverage
10. MEDDPICC Scorecard

# Executive Brief Sections

1. Executive Summary
2. Business Problem
3. Desired Outcomes
4. Buying Team
5. Decision Framework
6. Current Environment
7. Deal Assessment
8. Recommended Strategy
9. Next Meeting Objective
10. MEDDPICC Assessment

    Note: 
      1) If a question is unanswered, partially answered, or the provided answer is insufficient, leave the answer field blank and set the status to "pending"
      2) AI should not answer the question.  It should only take the answer from the communication transcript.

    QUESTIONS TO TRACK (Verify if these specific questions are answered in the transcript):
    ${questionsToTrack.map((q, idx) => `${idx + 1}. "${q}"`).join('\n    ')}

    RESPONSE FORMAT:
    You MUST return a valid JSON object with this exact structure:
    {
      "extracted_answers": [
        {
          "question": "The exact question text from the tracking list",
          "answer": "A concise summary of the participant's answer (max 40 words)",
          "status": "answered"
        }
      ]
    }
    If no answers are found, "extracted_answers" should be an empty array [].
  `;

  try {
    const cacheKey = await getHash(systemPrompt);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Transcript Context: ${transcriptChunk}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      prompt_cache_retention: "24h",
      prompt_cache_key: cacheKey,
    });

    const responseText = completion.choices[0].message.content;
    const responseJson = JSON.parse(responseText);
    // Log prompt caching details to verify it is working


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
You are an expert Sales Coach. Given the full meeting transcript and the answers already captured during the conversation, produce a final MEDDPICC‑compliant summary.

CRITICAL RULES:
1. DO NOT ADD ANY DEMO, PLACEHOLDER, OR DEFAULT DUMMY DATA.
2. If there are no key contacts mentioned in the transcript or captured answers, set "KeyContacts" to null. Do NOT invent names (such as "John Doe", "Jane Smith") or placeholder roles (such as "Champion" or "Economic Buyer").
3. For all other fields (Why_Do_Anything, BusinessValue, NextSteps, DecisionMap, CurrentEnvironment), only provide a summary if the topic was actually discussed or present in the transcript/captured answers. Otherwise, set the value to null.
4. Use professional, concise language. Max 40 words per category.

Structured output required:

{
  "Why_Do_Anything": "Summarize the customer's pain points, desired outcomes, and consequences of inaction (Identify Pain). Use captured answers and transcript. Set to null if not mentioned.",
  "BusinessValue": "Summarize success metrics, ROI expectations, and what prompted the search for a solution (Metrics). Set to null if not mentioned.",
  "KeyContacts": [
    {
      "name": "Full Name",
      "title": "Title/Role (Champion, Economic Buyer, etc.)"
    }
  ],
  "NextSteps": "Summarize agreed next steps, decision timeline, and implementation plan. Set to null if not mentioned.",
  "DecisionMap": "Summarize the decision process, timeline, procurement, security or legal steps and evaluation criteria (Decision Criteria + Decision Process + Paper Process). Set to null if not mentioned.",
  "CurrentEnvironment": "Summarize the customer's current environment, process, tech stack, and any alternative solutions or competitors considered (Competition). Set to null if not mentioned."
}
`;

  try {
    const cacheKey = await getHash(systemPrompt);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Full Transcript: ${fullTranscript}\n\nPreviously Captured Answers (JSON): ${JSON.stringify(capturedAnswers)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      prompt_cache_retention: "24h",
      prompt_cache_key: cacheKey,
    });

    const summaryJson = JSON.parse(completion.choices[0].message.content);


    return summaryJson;
  } catch (error) {
    console.error("Final summary error:", error);
    return null;
  }
}

export async function getMeetingNotes(fullTranscript, capturedAnswers) {
  if (!ENV_API_KEY) {
    console.error("[Q4Magic] No API Key found for summary!");
    return null;
  }

  const systemPrompt = `
You are the 360Pipe Executive Brief Generator.
Analyze the complete meeting transcript and all captured discovery data.
Rules:
Use only information discussed.
Do not invent facts.
Clearly identify assumptions and gaps.
Write for executives and sales leadership.
Focus on deal strategy, business value, and next actions.
Return JSON only.
Generate:
Executive Summary
5-7 sentence overview of the opportunity.
Business Problem
Key pain points driving change.
Business impact of maintaining the status quo.
Desired Outcomes
Business goals and success criteria.
Metrics discussed.
Buying Team
Economic Buyer
Champion
Decision Makers
Influencers
Decision Process
Evaluation criteria
Approval process
Procurement, legal, and security requirements
Deal Assessment
Strengths
Risks
Missing information
Recommended Strategy
Key messages for the next meeting
Stakeholders to engage
Questions that must be answered
Next Meeting Objective
Desired outcome
Recommended agenda
Success criteria
Return:
{
"executiveSummary":"",
"businessProblem":[],
"desiredOutcomes":[],
"buyingTeam":{},
"decisionProcess":{},
"dealAssessment":{
"strengths":[],
"risks":[],
"gaps":[]
},
"recommendedStrategy":[],
"nextMeetingObjective":{}
}

`;

  try {
    const cacheKey = await getHash(systemPrompt);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Full Transcript: ${fullTranscript}\n\nPreviously Captured Answers (JSON): ${JSON.stringify(capturedAnswers)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      prompt_cache_retention: "24h",
      prompt_cache_key: cacheKey,
    });

    const summaryJson = JSON.parse(completion.choices[0].message.content);


    return summaryJson;
  } catch (error) {
    console.error("Final summary error:", error);
    return null;
  }
}

export async function getWrapupAssistant(fullTranscript, capturedAnswers) {
  if (!ENV_API_KEY) {
    console.error("[Q4Magic] No API Key found for summary!");
    return null;
  }
  const systemPrompt = `
You are the 360Pipe Align & End Call Engine.
Analyze the complete meeting transcript and captured answers.
Rules:
- Use only information discussed.
- Do not invent facts.
- Identify assumptions separately.
- Be concise and actionable.
- Return valid JSON only containing the exact structure below.

JSON Schema Output:
{
  "meetingSummary": "High-level summary of the meeting",
  "whyChange": {
    "painPoints": ["list of identified pain points"],
    "businessDrivers": ["list of business drivers"],
    "urgency": "Urgency description"
  },
  "value": {
    "desiredOutcomes": ["list of desired outcomes"],
    "metricsDiscussed": ["list of metrics discussed"],
    "expectedImpact": "Expected impact/ROI"
  },
  "keyContacts": {
    "economicBuyer": "Name of Economic Buyer, or 'Not discussed'",
    "champion": "Name of Champion, or 'Not discussed'",
    "decisionMakers": ["List of other decision makers"],
    "influencers": ["List of influencers"]
  },
  "decisionMap": {
    "evaluationCriteria": ["list of criteria"],
    "decisionProcess": ["list of process steps"],
    "procurementRequirements": ["list of procurement requirements"]
  },
  "currentEnvironment": {
    "existingTools": ["list of existing tools"],
    "existingProcesses": ["list of existing processes"],
    "currentChallenges": ["list of current challenges"]
  },
  "nextSteps": [
    {
      "action": "Description of action item",
      "owner": "Who is responsible",
      "dueDate": "When it is due"
    }
  ],
  "risksGaps": {
    "missingInformation": ["list of missing details"],
    "dealRisks": ["list of risks"]
  },
  "meddpiccMapping": {
    "metrics": "How Metrics are mapped",
    "economicBuyer": "How Economic Buyer is mapped",
    "decisionCriteria": "How Decision Criteria is mapped",
    "decisionProcess": "How Decision Process is mapped",
    "paperProcess": "How Paper Process is mapped",
    "identifyPain": "How Identify Pain is mapped",
    "champion": "How Champion is mapped"
  }
}
`;

  try {
    const cacheKey = await getHash(systemPrompt);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Full Transcript: ${fullTranscript}\n\nPreviously Captured Answers (JSON): ${JSON.stringify(capturedAnswers)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      prompt_cache_retention: "24h",
      prompt_cache_key: cacheKey,
    });

    const summaryJson = JSON.parse(completion.choices[0].message.content);


    return summaryJson;
  } catch (error) {
    console.error("Final summary error:", error);
    return null;
  }
}

export async function extractCurrentEnvironment(answersText) {
  if (!ENV_API_KEY) {
    console.error("[Q4Magic] No API Key found for dynamic extraction!");
    return null;
  }

  const systemPrompt = `
You are an AI assistant that extracts software/process solutions and their vendors from sales conversation notes.
Analyze the text provided and identify:
1. The general category of solutions mentioned (e.g., "CRM", "Notes", "Competitors", "Database", "Calendar").
2. The specific vendors or tools mentioned under each category (e.g., "HubSpot", "Excel", "Word", "Facebook").

Rules:
- Group vendors under their respective solution category.
- For all vendors that are explicitly mentioned as used, being considered, or discussed, set isChecked to true by default.
- Return a JSON object with a single key "result" which is an array of solution objects.
- Only include solutions and vendors that are explicitly mentioned in the text.
- Do NOT invent or add any placeholder solutions or vendors if they are not in the text.
- If no tools or vendors are mentioned, return {"result": []}.

JSON Output Format:
{
  "result": [
    {
      "solution": "CRM",
      "vendors": [
        { "isChecked": true, "value": "HubSpot" },
        { "isChecked": true, "value": "Salesforce" }
      ]
    },
    {
      "solution": "Notes",
      "vendors": [
        { "isChecked": true, "value": "Excel" },
        { "isChecked": true, "value": "Word" }
      ]
    }
  ]
}
`;

  try {
    const cacheKey = await getHash(systemPrompt);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Text: ${answersText}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      prompt_cache_retention: "24h",
      prompt_cache_key: cacheKey,
    });

    const responseText = completion.choices[0].message.content;
    const responseJson = JSON.parse(responseText);
    return responseJson;
  } catch (error) {
    console.error("Dynamic extraction error:", error);
    return null;
  }
}

// {
//   "error": {
//     "message": "'messages' must contain the word 'json' in some form, to use 'response_format' of type 'json_object'.",
//     "type": "invalid_request_error",
//     "param": "messages",
//     "code": null
//   }
// }

// QUESTIONS TO TRACK:
// ${questionsToTrack.map(q => `- ${q}`).join('\n')}
// TASK:
// Analyze the transcript chunk and identify any information that directly answers the QUESTIONS TO TRACK.
// IMPORTANT:
// - Capture information as concise factual bullet points.
// - Preserve the prospect's meaning as closely as possible.
// - Do NOT create high-level summaries or generic interpretations.
// - Do NOT combine multiple facts into one bullet.
// - Each distinct problem, requirement, metric, stakeholder, timeline, or process detail should be its own bullet.
// - Use the prospect's terminology whenever possible.
// - If new details expand on a previously captured answer, append the new bullet(s) rather than replacing existing information.
// - Ignore statements made by the seller unless they reveal customer-confirmed information.

// RESPONSE FORMAT:
// You MUST return a valid JSON object with this exact structure:
// {
//   "extracted_answers": [
//     {
//       "question": "The exact question text from the tracking list",
//       "answer": "A concise summary of the participant's answer (max 40 words)",
//       "status": "answered"
//     }
//   ],
//   "coaching": "Your MEDDPICC coaching tip here"
// }
// If no new information is found for a question, do not include that question.
// MEDDPICC COACHING:
// Provide 1-2 coaching tips (maximum 20 words each) focused on uncovering missing information.

// If no answers are found, "extracted_answers" should be an empty array [].