import React, { useState, useEffect, useRef } from 'react';
import { Autocomplete, TextField, Typography, Button } from '@mui/material';
import { getCookie } from './utils/cookieHelper';
import Login from './components/Login';
import CaptionWarning from './components/CaptionWarning';
import {
  getSalesCoaching,
  getMeetingSummary,
  Why_Do_Anything_Questions,
  BusinessValue_Questions,
  EconomicBuyer_Questions,
  Champion_Questions,
  DecisionCriteria_Questions,
  DecisionProcess_Questions,
  PaperProcess_Questions,
  CURRENTENVIRONMENT_Questions,
  NextSteps_Questions,
  getMeetingNotes,
  getWrapupAssistant,
} from './services/openai';
import { getOpportunitiesByCustomerId, updateOpportunityData, createOpportunityData } from './services/opportunitiesService';
import OpportunityWarning from './components/OpportunityWarning';

// Group questions by category matching MEDDPICC letters
const CATEGORIES = {
  BusinessValue: BusinessValue_Questions,         // M
  EconomicBuyer: EconomicBuyer_Questions,         // E
  DecisionCriteria: DecisionCriteria_Questions,   // D
  DecisionProcess: DecisionProcess_Questions,     // D
  PaperProcess: PaperProcess_Questions,           // P
  Why_Do_Anything: Why_Do_Anything_Questions,     // I
  Champion: Champion_Questions,                   // C
  CurrentEnvironment: CURRENTENVIRONMENT_Questions, // C
  NextSteps: NextSteps_Questions                  // (Does not map)
};

const MEDDPICC_STAGES = [
  {
    key: 'BusinessValue',
    letter: 'M',
    label: 'Metrics',
    title: 'Value',
    description: 'Understand success metrics, ROI expectations, and economic value.',
    questions: BusinessValue_Questions,
    baseInsight: 'Quantify the financial impact. Focus on metrics like revenue growth, cost reduction, or time saved. Ask: "What would a 10% improvement mean for your bottom line?"'
  },
  {
    key: 'EconomicBuyer',
    letter: 'E',
    label: 'Economic Buyer',
    title: 'Economic Buyer',
    description: 'Identify the person with budget authority and final decision power.',
    questions: EconomicBuyer_Questions,
    baseInsight: 'Locate the decision-maker early. Ensure you understand their personal drivers and how they define success. Ask: "Who ultimately approves initiatives like this?"'
  },
  {
    key: 'DecisionCriteria',
    letter: 'D',
    label: 'Decision Criteria',
    title: 'Decision Criteria',
    description: 'Understand the specific technical, financial, and business requirements.',
    questions: DecisionCriteria_Questions,
    baseInsight: 'Determine the evaluation criteria. Ask: "What business or technical requirements are most important in selecting a solution?"'
  },
  {
    key: 'DecisionProcess',
    letter: 'D',
    label: 'Decision Process',
    title: 'Decision Process',
    description: 'Understand the steps, timeline, and stakeholders involved in making the decision.',
    questions: DecisionProcess_Questions,
    baseInsight: 'Map out the decision steps. Ask: "If we mapped out the path to a final decision, what steps would need to happen and who would be involved?"'
  },
  {
    key: 'PaperProcess',
    letter: 'P',
    label: 'Paper Process',
    title: 'Paper Process',
    description: 'Map out the administrative, legal, and procurement procedures.',
    questions: PaperProcess_Questions,
    baseInsight: 'Understand procurement, legal, and security processes. Ask: "What internal procurement, legal, or security steps should we plan for?"'
  },
  {
    key: 'Why_Do_Anything',
    letter: 'I',
    label: 'Identify Pain',
    title: 'Why Change',
    description: 'Understand why this is a priority now rather than later.',
    questions: Why_Do_Anything_Questions,
    baseInsight: 'Uncover the cost of doing nothing. Understand why this is a priority now rather than later. Ask: "What happens if this problem is not solved by next quarter?"'
  },
  {
    key: 'Champion',
    letter: 'C',
    label: 'Champion',
    title: 'Champion',
    description: 'Identify your internal sponsor who will advocate for your solution.',
    questions: Champion_Questions,
    baseInsight: 'Identify your internal sponsor who will advocate for your solution. Ask: "Who would champion this internally?"'
  },
  {
    key: 'CurrentEnvironment',
    letter: 'C',
    label: 'Competition',
    title: 'Current Environment',
    description: 'Assess the current process, alternative solutions, and competitive risks.',
    questions: CURRENTENVIRONMENT_Questions,
    baseInsight: 'Map the tech stack and competition. Assess if they are considering internal builds or other vendors. Ask: "What other options are you evaluating to solve this?"'
  }
];

// Helper: merge two strings with word overlap
const mergeWords = (s1, s2) => {
  if (!s1) return s2;
  if (!s2) return s1;
  if (s1.endsWith(s2)) return s1;

  const words2 = s2.split(/\s+/);
  for (let i = words2.length; i > 0; i--) {
    const prefix = words2.slice(0, i).join(" ");
    if (s1.endsWith(prefix)) {
      return s1 + " " + words2.slice(i).join(" ");
    }
  }
  return s1 + " " + s2;
};

// Helper: merge two speaker-annotated lines of format "Speaker: text"
const mergeSingleLine = (l1, l2) => {
  const s1 = (l1 || "").trim();
  const s2 = (l2 || "").trim();

  const idx1 = s1.indexOf(":");
  const idx2 = s2.indexOf(":");
  if (idx1 === -1 || idx2 === -1) {
    return mergeWords(s1, s2);
  }

  const speaker1 = s1.substring(0, idx1).trim();
  const speaker2 = s2.substring(0, idx2).trim();
  if (speaker1 !== speaker2) {
    return s1 + "\n" + s2;
  }

  const text1 = s1.substring(idx1 + 1).trim();
  const text2 = s2.substring(idx2 + 1).trim();

  const mergedText = mergeWords(text1, text2);
  return `${speaker1}: ${mergedText}`;
};

// Utility to merge new transcript chunks while removing overlaps and preserving speakers
const mergeTranscript = (existing, newChunk) => {
  const s1 = (existing || "").trim();
  const s2 = (newChunk || "").trim();
  if (!s1) return s2;
  if (!s2) return s1;

  const lines1 = s1.split(/\r?\n/);
  const lines2 = s2.split(/\r?\n/);

  const maxOverlap = Math.min(lines1.length, lines2.length);
  let overlapCount = 0;

  for (let len = maxOverlap; len > 0; len--) {
    let matches = true;
    for (let i = 0; i < len; i++) {
      const l1 = lines1[lines1.length - len + i].trim();
      const l2 = lines2[i].trim();

      if (l1 === l2) {
        continue;
      }

      const idx1 = l1.indexOf(":");
      const idx2 = l2.indexOf(":");
      if (idx1 !== -1 && idx2 !== -1) {
        const speaker1 = l1.substring(0, idx1).trim();
        const speaker2 = l2.substring(0, idx2).trim();
        if (speaker1 === speaker2 && (l2.startsWith(l1) || l1.startsWith(l2))) {
          continue;
        }
      }

      matches = false;
      break;
    }
    if (matches) {
      overlapCount = len;
      break;
    }
  }

  if (overlapCount > 0) {
    const mergedLines = [...lines1.slice(0, lines1.length - overlapCount)];
    for (let i = 0; i < overlapCount; i++) {
      const l1 = lines1[lines1.length - overlapCount + i];
      const l2 = lines2[i];
      mergedLines.push(mergeSingleLine(l1, l2));
    }
    mergedLines.push(...lines2.slice(overlapCount));
    return mergedLines.join("\n");
  }

  const l1 = lines1[lines1.length - 1];
  const l2 = lines2[0];
  const idx1 = l1.indexOf(":");
  const idx2 = l2.indexOf(":");
  if (idx1 !== -1 && idx2 !== -1) {
    const speaker1 = l1.substring(0, idx1).trim();
    const speaker2 = l2.substring(0, idx2).trim();
    if (speaker1 === speaker2) {
      const mergedLine = mergeSingleLine(l1, l2);
      const mergedLines = [...lines1.slice(0, lines1.length - 1), mergedLine, ...lines2.slice(1)];
      return mergedLines.join("\n");
    }
  } else if (idx1 === -1 && idx2 === -1) {
    const mergedLine = mergeWords(l1, l2);
    const mergedLines = [...lines1.slice(0, lines1.length - 1), mergedLine, ...lines2.slice(1)];
    return mergedLines.join("\n");
  }

  return s1 + "\n" + s2;
};

const renderStageIcon = (key) => {
  switch (key) {
    case 'BusinessValue':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case 'EconomicBuyer':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'DecisionCriteria':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      );
    case 'DecisionProcess':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      );
    case 'PaperProcess':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'Why_Do_Anything':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
        </svg>
      );
    case 'Champion':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.969 0 1.371 1.24.588 1.81l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.883a1 1 0 00-1.178 0l-3.97 2.883c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h4.907a1 1 0 00.95-.69l1.519-4.674z" />
        </svg>
      );
    case 'CurrentEnvironment':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    case 'NextSteps':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    default:
      return null;
  }
};

const cleanStringForCompare = (str) => {
  if (!str) return "";
  return str.toLowerCase()
    .replace(/[\u2018\u2019']/g, "'") // normalize straight and curly apostrophes
    .replace(/[\u201C\u201D"]/g, '"') // normalize quotes
    .replace(/[^a-z0-9]/g, "") // remove all non-alphanumeric characters
    .trim();
};

const App = () => {
  const [token, setToken] = useState(undefined);
  const [userInfo, setUserInfo] = useState(null);
  const [isCookieChecked, setIsCookieChecked] = useState(false);

  const getInitialCustomerId = () => {
    if (userInfo && userInfo.userId) {
      return userInfo.userId;
    }
    return 23;
  };

  const userName = userInfo?.name || "";
  const userEmail = userInfo?.email || "";

  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Kolkata" ? "Asia/Calcutta" : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [tips, setTips] = useState([]);
  const [isCcActive, setIsCcActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);

  const [transcriptHistory, setTranscriptHistory] = useState("");
  const [capturedAnswers, setCapturedAnswers] = useState({});
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMeetingActive, setIsMeetingActive] = useState(true);

  // MEDDPICC States
  const [activeCategoryKey, setActiveCategoryKey] = useState('BusinessValue');
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [isMeddpiccCollapsed, setIsMeddpiccCollapsed] = useState(false);

  const [finalSummary, setFinalSummary] = useState(null);
  const [meetingCode, setMeetingCode] = useState(null);
  const [participants, setParticipants] = useState(null);
  const [customerId, setCustomerId] = useState(getInitialCustomerId());
  const [opportunitys, setOpportunitys] = useState([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [newOppName, setNewOppName] = useState('');

  const bottomRef = useRef(null);
  const lastProcessedTranscript = useRef("");
  const intervalRef = useRef(null);
  const transcriptRef = useRef("");
  const answersRef = useRef({});
  const opportunityRef = useRef(null);
  const customerIdRef = useRef(getInitialCustomerId());
  const summaryGeneratedRef = useRef(false);
  const keyContactsBackupRef = useRef([]);
  const isGeneratingSummaryRef = useRef(false);
  const introductionRef = useRef("");
  const [introduction, setIntroduction] = useState("");

  useEffect(() => {
    introductionRef.current = introduction;
  }, [introduction]);

  useEffect(() => {
    const checkCookie = async () => {
      const tokenVal = await getCookie('sales-coach-extension-token');
      const userVal = await getCookie('sales-coach-extension-user-info');

      let parsedUser = null;
      if (userVal) {
        try {
          parsedUser = JSON.parse(userVal);
        } catch (e) {
          console.error("Failed to parse user info cookie:", e);
        }
      }

      if (!tokenVal || !parsedUser) {
        localStorage.removeItem("userInfo");
        setToken(null);
        setUserInfo(null);
      } else {
        setToken(tokenVal);
        setUserInfo(parsedUser);
      }

      setIsCookieChecked(true);
    };
    checkCookie();
  }, []);

  useEffect(() => {
    if (userInfo && userInfo.userId) {
      setCustomerId(userInfo.userId);
      customerIdRef.current = userInfo.userId;
    }
  }, [userInfo]);

  // Keep refs in sync with state for use in stale closures (like event listeners)
  useEffect(() => {
    transcriptRef.current = transcriptHistory;
  }, [transcriptHistory]);

  useEffect(() => {
    answersRef.current = capturedAnswers;
  }, [capturedAnswers]);

  useEffect(() => {
    opportunityRef.current = selectedOpportunity;
  }, [selectedOpportunity]);

  useEffect(() => {
    customerIdRef.current = customerId;
  }, [customerId]);

  // Helper: get captured answer using normalized comparison
  const getAnswerForQuestion = (answers, question) => {
    if (!answers || !question) return undefined;
    const cleanedQuestion = cleanStringForCompare(question);
    const foundKey = Object.keys(answers).find(key => cleanStringForCompare(key) === cleanedQuestion);
    return foundKey ? answers[foundKey] : undefined;
  };

  // Helper: determine unanswered categories
  const getUnansweredCategories = () => {
    const unanswered = new Set(Object.keys(CATEGORIES));
    for (const question in capturedAnswers) {
      const ans = capturedAnswers[question];
      if (ans && ans.trim() !== "") {
        // Find which category this question belongs to and mark it as answered
        for (const [cat, questions] of Object.entries(CATEGORIES)) {
          const hasMatch = questions.some(q => cleanStringForCompare(q) === cleanStringForCompare(question));
          if (hasMatch) {
            unanswered.delete(cat);
            break;
          }
        }
      }
    }
    return Array.from(unanswered);
  };

  // Get answered count and status for a MEDDPICC stage
  const getCategoryStatus = (stage) => {
    const qList = stage.questions;
    const answeredCount = qList.filter(q => {
      const ans = getAnswerForQuestion(capturedAnswers, q);
      return ans && ans.trim() !== "";
    }).length;
    const totalCount = qList.length;
    const isCompleted = answeredCount === totalCount && totalCount > 0;
    return { answeredCount, totalCount, isCompleted };
  };

  useEffect(() => {
    window.parent.postMessage({ type: 'SET_COLLAPSED', collapsed: isCollapsed }, '*');
  }, [isCollapsed]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (!event.data || !event.data.type) return;
      if (event.data.type === 'NEW_CAPTION') {
        const text = event.data.text;
        setTranscriptHistory(prev => mergeTranscript(prev, text));
      } else if (event.data.type === 'SET_MEETING_CODE') {
        setMeetingCode(event.data.meetingCode);
      } else if (event.data.type === 'CC_STATUS') {
        setIsCcActive(event.data.active);
      } else if (event.data.type === 'MEETING_END') {
        // Meeting ended – stop polling and generate final summary
        setIsMeetingActive(false);
        generateFinalSummary("Y");
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const getActiveQuestionsFromRef = () => {
    const unanswered = new Set(Object.keys(CATEGORIES));
    const currentAnswers = answersRef.current || {};
    for (const question in currentAnswers) {
      const ans = currentAnswers[question];
      if (ans && ans.trim() !== "") {
        for (const [cat, questions] of Object.entries(CATEGORIES)) {
          const hasMatch = questions.some(q => cleanStringForCompare(q) === cleanStringForCompare(question));
          if (hasMatch) {
            unanswered.delete(cat);
            break;
          }
        }
      }
    }
    const active = [];
    for (const cat of Array.from(unanswered)) {
      active.push(...CATEGORIES[cat]);
    }
    return active;
  };

  // Polling every 5 seconds – only if meeting active
  useEffect(() => {
    if (!isMeetingActive) return;
    intervalRef.current = setInterval(() => {
      const activeQuestions = getActiveQuestionsFromRef();
      const currentTranscript = transcriptRef.current || "";

      const cleanTranscript = currentTranscript.split(/[.!?]+\s+/)
        .map(s => s.trim())
        .filter((s, i, arr) => s && arr.indexOf(s) === i) // Simple de-duplicate of sentences
        .join(". ");

      if (cleanTranscript.trim() && cleanTranscript !== lastProcessedTranscript.current) {
        processTranscript(cleanTranscript, activeQuestions);
        lastProcessedTranscript.current = cleanTranscript;
      }
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [isMeetingActive]);

  // Polling for participants until found
  useEffect(() => {
    const logParticipants = async () => {
      const currentId = getInitialCustomerId();
      setIsLoadingInfo(true);
      setCustomerId(currentId);
      const oppData = await getOpportunitiesByCustomerId(currentId);
      if (oppData?.data.status === 200) {
        setOpportunitys(oppData?.data?.result[0]?.opportunitiesNameOptions);
        setIsLoadingInfo(false);
      } else {
        setIsLoadingInfo(false);
      }
    };

    if (isMeetingActive && token) {
      logParticipants();
    }
  }, [isMeetingActive, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tips]);

  const handleCreateOpportunity = async () => {
    if (!newOppName.trim()) return;
    try {
      setIsLoadingInfo(true);
      const res = await createOpportunityData({ customerId: customerIdRef.current, oppName: newOppName, timeZone: userTimeZone });
      if (res?.data?.status === 200 || res?.data?.status === 201) {
        if (customerIdRef.current) {
          const oppData = await getOpportunitiesByCustomerId(customerIdRef.current);
          if (oppData?.data?.status === 200) {
            const newOptions = oppData?.data?.result[0]?.opportunitiesNameOptions || [];
            setOpportunitys(newOptions);
            setNewOppName('');
            const createdId = res?.data?.result;
            const newlyCreatedOpp = newOptions.find(o => o.id === createdId);
            setSelectedOpportunity(newlyCreatedOpp || null);
          }
        }
      }

    } catch (err) {
      console.error("Error creating opportunity:", err);
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const processTranscript = async (text, activeQuestions) => {
    if (summaryGeneratedRef.current) return;
    if (activeQuestions.length === 0) return;
    setIsLoading(true);
    try {
      const result = await getSalesCoaching(text, activeQuestions);
      if (summaryGeneratedRef.current) return;
      if (result) {
        // if (result.coaching) {
        //   setTips(prev => [...prev, result.coaching]);
        // }
        if (result.extracted_answers && result?.extracted_answers?.length > 0) {
          let updatedAnswers;
          setCapturedAnswers(prev => {
            const next = { ...prev };
            const allQuestionsList = Object.values(CATEGORIES).flat();
            result.extracted_answers.forEach(item => {
              // Update with latest answer (overwrite if we have new detail)
              if (item.answer && item.answer.trim()) {
                const matchedQuestion = allQuestionsList.find(q =>
                  cleanStringForCompare(q) === cleanStringForCompare(item.question)
                );
                if (matchedQuestion) {
                  next[matchedQuestion] = item.answer;
                } else {
                  next[item.question] = item.answer;
                }
              }
            });
            updatedAnswers = next;
            return next;
          });
          if (!summaryGeneratedRef.current) {
            generateFinalSummary("N", updatedAnswers);
          }
        }
      }
    } catch (err) {
      console.error("Error processing transcript:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateFinalSummary = async (storeNote = "N", currentAnswers = null) => {
    if (storeNote === "N" && summaryGeneratedRef.current) return;
    if (storeNote === "Y") {
      summaryGeneratedRef.current = true;
    }
    // if (isGeneratingSummaryRef.current) return;
    // isGeneratingSummaryRef.current = true;
    try {
      // Final cut: Ensure the transcript is clean of any stray repeats
      const rawTranscript = transcriptRef.current;
      const cleanTranscript = rawTranscript.split(/[.!?]+\s+/)
        .map(s => s.trim())
        .filter((s, i, arr) => s && arr.indexOf(s) === i) // Simple de-duplicate of sentences
        .join(". ");
      const activeAnswers = currentAnswers || answersRef.current;
      if (cleanTranscript) {
        setIsLoading(true);
        if (storeNote === "Y") {
          const response = await getWrapupAssistant(cleanTranscript, activeAnswers)
          if (response) {
            // Map structured wrap-up response to standard DB fields for compatibility
            const mappedWhyChange = `
              <p><strong>Pain Points:</strong></p>
              <ul>${(response.whyChange?.painPoints || []).map(p => `<li>${p}</li>`).join('')}</ul>
              <p><strong>Business Drivers:</strong></p>
              <ul>${(response.whyChange?.businessDrivers || []).map(d => `<li>${d}</li>`).join('')}</ul>
              <p><strong>Urgency:</strong> ${response.whyChange?.urgency || ''}</p>
            `;

            const mappedValue = `
              <p><strong>Desired Outcomes:</strong></p>
              <ul>${(response.value?.desiredOutcomes || []).map(o => `<li>${o}</li>`).join('')}</ul>
              <p><strong>Metrics Discussed:</strong></p>
              <ul>${(response.value?.metricsDiscussed || []).map(m => `<li>${m}</li>`).join('')}</ul>
              <p><strong>Expected Impact:</strong> ${response.value?.expectedImpact || ''}</p>
            `;

            const mappedDecisionMap = `
              Evaluation Criteria:
              - ${(response.decisionMap?.evaluationCriteria || []).join('\n              - ')}
              
              Decision Process:
              - ${(response.decisionMap?.decisionProcess || []).join('\n              - ')}
              
              Procurement Requirements:
              - ${(response.decisionMap?.procurementRequirements || []).join('\n              - ')}
            `;

            const mappedCurrentEnv = `
              Existing Tools:
              - ${(response.currentEnvironment?.existingTools || []).join('\n              - ')}
              
              Existing Processes:
              - ${(response.currentEnvironment?.existingProcesses || []).join('\n              - ')}
              
              Current Challenges:
              - ${(response.currentEnvironment?.currentChallenges || []).join('\n              - ')}
            `;

            const mappedKeyContacts = [];
            if (response.keyContacts) {
              const kc = response.keyContacts;
              if (kc.economicBuyer && kc.economicBuyer !== 'Not discussed') {
                mappedKeyContacts.push({ name: kc.economicBuyer, title: 'Economic Buyer' });
              }
              if (kc.champion && kc.champion !== 'Not discussed') {
                mappedKeyContacts.push({ name: kc.champion, title: 'Champion' });
              }
              if (Array.isArray(kc.decisionMakers)) {
                kc.decisionMakers.forEach(name => {
                  if (name && name !== 'Not discussed') mappedKeyContacts.push({ name, title: 'Decision Maker' });
                });
              }
              if (Array.isArray(kc.influencers)) {
                kc.influencers.forEach(name => {
                  if (name && name !== 'Not discussed') mappedKeyContacts.push({ name, title: 'Influencer' });
                });
              }
            }

            const mappedNextSteps = (response.nextSteps || [])
              .map(ns => `${ns.action} (Owner: ${ns.owner || 'N/A'}, Due: ${ns.dueDate || 'N/A'})`)
              .join('\n');

            let finalSummaryData = {
              ...response,
              Why_Do_Anything: mappedWhyChange,
              BusinessValue: mappedValue,
              DecisionMap: mappedDecisionMap,
              CurrentEnvironment: mappedCurrentEnv,
              KeyContacts: mappedKeyContacts,
              NextSteps: mappedNextSteps,
              opportunityId: opportunityRef.current?.id,
              customerId: customerIdRef.current,
              cleanTranscript: cleanTranscript,
              introduction: introductionRef.current,
              storeNote: storeNote
            };

            setFinalSummary(finalSummaryData);

            // if (opportunityRef.current?.id && customerIdRef.current) {
            //   const dbResponse = await updateOpportunityData(finalSummaryData);
            //   if (dbResponse.data.status !== 200) {
            //     console.log("Failed to update opportunity data:", dbResponse.data.message);
            //   }
            // }
          }
          const res = await getMeetingNotes(cleanTranscript, activeAnswers);
          console.log("[Q4Magic] Meeting Notes:", res);
          let payload = {
            ...res,
            cleanTranscript: cleanTranscript,
            opportunityId: opportunityRef.current?.id,
            customerId: customerIdRef.current,
            introduction: introductionRef.current,
            storeNote: storeNote
          }
          if (opportunityRef.current?.id && customerIdRef.current) {
            const summaryStore = await updateOpportunityData(payload)
            if (summaryStore.data.status !== 200) {
              console.log("Failed to update opportunity data:", summaryStore.data.message);
            }
          }
        } else {
          const summary = await getMeetingSummary(cleanTranscript, activeAnswers);
          if (summary) {
            let processedKeyContacts = [];
            if (Array.isArray(summary.KeyContacts)) {
              summary?.KeyContacts?.forEach(contact => {
                const cleanName = (contact.name || "").replace(/^(Mr\.|Mrs\.|Ms\.|Mr|Mrs|Ms)\s+/i, "").trim();
                const cleanTitle = (contact.title || "").trim();

                // Check if contact with same name and title already exists in the backup
                const isDuplicate = keyContactsBackupRef?.current?.some(backupContact => {
                  const backupCleanName = (backupContact.name || "").replace(/^(Mr\.|Mrs\.|Ms\.|Mr|Mrs|Ms)\s+/i, "").trim();
                  const backupCleanTitle = (backupContact.title || "").trim();
                  return backupCleanName.toLowerCase() === cleanName.toLowerCase() &&
                    backupCleanTitle.toLowerCase() === cleanTitle.toLowerCase();
                });

                if (!isDuplicate) {
                  const nameParts = cleanName.split(/\s+/);
                  const processedContact = {
                    ...contact,
                    firstName: nameParts[0] || "",
                    lastName: nameParts.slice(1).join(" ") || "",
                  };
                  processedKeyContacts.push(processedContact);
                  // Store in backup copy
                  keyContactsBackupRef.current.push(processedContact);
                }
              });
            } else {
              processedKeyContacts = summary?.KeyContacts;
            }

            // if (storeNote === "Y" && Array.isArray(keyContactsBackupRef.current)) {
            //   processedKeyContacts = keyContactsBackupRef.current;
            // }

            let finalSummaryData = {
              ...summary,
              Why_Do_Anything: `<p>${summary?.Why_Do_Anything || ""}</p>`,
              BusinessValue: `<p>${summary.BusinessValue || ""}</p>`,
              DecisionMap: `${summary.DecisionMap || ""}`,
              CurrentEnvironment: `${summary.CurrentEnvironment || ""}`,
              KeyContacts: processedKeyContacts,
              opportunityId: opportunityRef.current?.id,
              customerId: customerIdRef.current,
              cleanTranscript: cleanTranscript,
              introduction: introductionRef.current,
              storeNote: storeNote
            }
            // setFinalSummary(finalSummaryData);
            setTips([]);
            if (opportunityRef.current?.id && customerIdRef.current) {
              const response = await updateOpportunityData(finalSummaryData)
              if (response.data.status !== 200) {
                console.log("Failed to update opportunity data:", response.data.message);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Final summary failed:", err);
    } finally {
      isGeneratingSummaryRef.current = false;
      setIsLoading(false);
    }
  };

  if (!isCookieChecked) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      </div>
    );
  }

  if (!token) {
    return <Login onLoginSuccess={(newToken, newUserData) => { setToken(newToken); setUserInfo(newUserData); }} />;
  }

  if (isCollapsed) {
    return (
      <div className="h-screen w-full bg-premium-900 flex flex-col items-center py-6 cursor-pointer hover:bg-premium-800 transition-colors" onClick={() => setIsCollapsed(false)}>
        <button className="text-white mb-8 hover:scale-110 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex flex-col items-center space-y-4">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
          <p className="text-[10px] text-premium-400 font-bold uppercase tracking-widest [writing-mode:vertical-lr] rotate-180">Sales Coach Active</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-screen bg-premium-50 font-sans text-premium-900 border-l border-premium-100 relative overflow-hidden transition-all duration-300">
        {/* Premium Header */}
        <header className="px-6 py-4 bg-white border-b border-premium-100 flex items-center justify-between shadow-sm z-10">
          <div className="flex-1">
            <img src="/images/logo/360Pipe_logo.png" alt="360Pipe Logo" className="h-7" />
          </div>

          <div className="flex items-center space-x-3">
            {userInfo && (
              <div className="flex flex-col items-end mr-2 text-right">
                <span className="text-[10.5px] font-bold text-premium-800 leading-tight">{userName || userInfo.username}</span>
                <span className="text-[9px] font-medium text-premium-400 leading-tight">{userEmail}</span>
              </div>
            )}
            {!isMeetingActive && (
              <>
                <button
                  onClick={() => window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*')}
                  className="p-2 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-all border border-transparent hover:border-red-100 cursor-pointer"
                  title="Close Permanently"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            )}

            {isMeetingActive && (
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-2 rounded-lg hover:bg-premium-100 text-premium-400 hover:text-premium-900 transition-all"
                title="Collapse Panel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </header>

        {isLoadingInfo ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-premium-900 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-[9px] font-bold text-premium-400 uppercase tracking-[0.3em] animate-pulse">Loading Info.....</p>
          </div>
        ) : (
          <>
            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-6 flex flex-col space-y-8 custom-scrollbar">
              {selectedOpportunity?.title?.includes("+ New Opportunity") ? (
                <div className="flex flex-col space-y-4">
                  <h2 className="text-sm font-black tracking-tighter text-premium-900 uppercase">Create New Opportunity</h2>
                  <TextField
                    label="Opportunity Name"
                    variant="outlined"
                    fullWidth
                    value={newOppName}
                    onChange={(e) => setNewOppName(e.target.value)}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '12px',
                        backgroundColor: 'white',
                      }
                    }}
                  />
                  <div className="flex space-x-4 mt-4 gap-4">
                    <Button
                      variant="contained"
                      onClick={handleCreateOpportunity}
                      disabled={!newOppName.trim()}
                      sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 'bold', backgroundColor: '#3b82f6', color: 'white', '&:hover': { backgroundColor: '#2563eb' } }}
                    >
                      Submit
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setSelectedOpportunity(null);
                        setNewOppName('');
                      }}
                      sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 'bold' }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <label className="text-[10px] font-bold text-premium-400 uppercase tracking-widest mb-2 block">
                      Select Opportunity
                    </label>
                    <Autocomplete
                      options={[{ title: '+ New Opportunity', id: 'new_opp' }, ...(opportunitys || [])]}
                      getOptionLabel={(option) => option.title || ""}
                      value={selectedOpportunity}
                      onChange={(event, newValue) => {
                        setSelectedOpportunity(newValue);
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          variant="outlined"
                          placeholder="Choose an opportunity..."
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              backgroundColor: 'white',
                              '& fieldset': {
                                borderColor: '#e5e7eb', // premium-200
                              },
                              '&:hover fieldset': {
                                borderColor: '#d1d5db', // premium-300
                              },
                              '&.Mui-focused fieldset': {
                                borderColor: '#3b82f6', // blue-500
                              },
                            },
                          }}
                        />
                      )}
                      className="w-full"
                    />
                  </div>

                  {/* MEDDPICC Qualification Section */}
                  {isMeetingActive && (
                    <>
                      {/* <div className="mb-6">
                        <label className="text-[10px] font-bold text-premium-400 uppercase tracking-widest mb-2 block">
                           Introduction
                        </label>
                        <TextField
                           variant="outlined"
                           placeholder="Enter introduction..."
                           sx={{
                             '& .MuiOutlinedInput-root': {
                               borderRadius: '12px',
                               fontSize: '0.75rem',
                               backgroundColor: 'white',
                               '& fieldset': {
                                 borderColor: '#e5e7eb', // premium-200
                               },
                               '&:hover fieldset': {
                                 borderColor: '#d1d5db', // premium-300
                               },
                               '&.Mui-focused fieldset': {
                                 borderColor: '#3b82f6', // blue-500
                               },
                             },
                           }}
                           value={introduction}
                           onChange={(e) => {
                             setIntroduction(e.target.value);
                           }}
                           multiline
                           rows={3}
                           fullWidth
                           className="w-full"
                         />
                       </div> */}
                      <section className="bg-white rounded-2xl border border-premium-100 shadow-sm">
                        {/* Section Header */}
                        <div
                          className="px-5 py-4 flex items-center justify-between border-b border-premium-50 bg-slate-50/50 cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => setIsMeddpiccCollapsed(prev => !prev)}
                        >
                          <div className="flex items-center space-x-2">
                            <h2 className="text-xs font-black text-premium-900 uppercase tracking-wider flex items-center">
                              MEDDPICC Qualification
                            </h2>
                            <div
                              className="text-premium-400 hover:text-premium-600 transition-colors cursor-pointer flex items-center"
                              title="MEDDPICC is a sales qualification framework focused on Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain, Champion, and Competition."
                              onClick={(e) => e.stopPropagation()}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                          </div>

                          <button className="text-premium-400 hover:text-premium-600 transition-transform duration-200 cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transform transition-transform ${isMeddpiccCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                        </div>

                        {/* Expandable MEDDPICC Section */}
                        {!isMeddpiccCollapsed && (
                          <div className="p-5 space-y-6">
                            {/* Circular Tabs Row */}
                            <div className="relative flex items-center justify-between w-full px-2 py-4">
                              {/* Dash Connector Line */}
                              <div className="absolute top-1/2 left-4 right-4 h-0.5 border-t border-dashed border-slate-200 -translate-y-1/2 z-0"></div>

                              {MEDDPICC_STAGES.map((stage) => {
                                const { answeredCount, totalCount, isCompleted } = getCategoryStatus(stage);
                                const isActive = activeCategoryKey === stage.key;

                                let buttonClass = "";
                                if (isActive) {
                                  buttonClass = "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 scale-110";
                                } else if (isCompleted) {
                                  buttonClass = "bg-white text-indigo-600 border-indigo-600";
                                } else if (answeredCount > 0) {
                                  buttonClass = "bg-indigo-50 text-indigo-500 border-indigo-200";
                                } else {
                                  buttonClass = "bg-slate-50 text-slate-400 border-slate-200";
                                }

                                return (
                                  <button
                                    key={stage.key}
                                    onClick={() => {
                                      setActiveCategoryKey(stage.key);
                                      setExpandedQuestion(null); // reset expanded question on tab switch
                                    }}
                                    className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full font-black text-sm border-2 transition-all duration-200 cursor-pointer ${buttonClass}`}
                                  >
                                    {stage.letter}

                                    {/* Small badge for completion / progress */}
                                    {isCompleted && (
                                      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] text-white border border-white font-bold">
                                        ✓
                                      </span>
                                    )}
                                    {!isCompleted && answeredCount > 0 && (
                                      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] text-white border border-white font-bold">
                                        {answeredCount}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Selected Tab Label Name */}
                            <div className="text-center -mt-2">
                              <span className="text-[11px] font-black text-indigo-600 uppercase tracking-widest">
                                {MEDDPICC_STAGES.find(s => s.key === activeCategoryKey)?.label}
                              </span>
                            </div>

                            {/* Active Stage Details Card */}
                            {(() => {
                              const activeStage = MEDDPICC_STAGES.find(s => s.key === activeCategoryKey);
                              if (!activeStage) return null;

                              const { answeredCount, totalCount, isCompleted } = getCategoryStatus(activeStage);
                              const indexPrefix = MEDDPICC_STAGES.indexOf(activeStage) + 1;

                              return (
                                <div className="space-y-5 animate-slide-in">
                                  {/* Header Info */}
                                  <div className="flex items-start space-x-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                      {renderStageIcon(activeStage.key)}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                      <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black text-premium-900">
                                          {indexPrefix}. {activeStage.title}
                                        </h3>
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${isCompleted
                                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                          : answeredCount > 0
                                            ? 'bg-amber-50 text-amber-600 border border-amber-100'
                                            : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                                          }`}>
                                          {isCompleted
                                            ? 'Completed'
                                            : answeredCount > 0
                                              ? `In Progress (${answeredCount}/${totalCount})`
                                              : 'Active'}
                                        </span>
                                      </div>
                                      <p className="text-[10px] font-medium text-premium-400 leading-normal">
                                        {activeStage.description}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Questions List */}
                                  <div className="space-y-3">
                                    <h4 className="text-[9px] font-black text-premium-400 uppercase tracking-widest">
                                      TOP QUESTIONS
                                    </h4>

                                    <div className="space-y-2.5">
                                      {activeStage.questions
                                        .filter((question) => {
                                          const answer = getAnswerForQuestion(capturedAnswers, question);
                                          return !(answer && answer.trim());
                                        })
                                        .map((question, qIdx) => {
                                          const answer = getAnswerForQuestion(capturedAnswers, question);
                                          const isAnswered = !!(answer && answer.trim());

                                          return (
                                            <div
                                              key={qIdx}
                                              className={`rounded-xl border transition-all duration-200 overflow-hidden ${isAnswered
                                                ? 'border-emerald-100 bg-emerald-50/5 hover:border-emerald-200'
                                                : 'border-slate-100 bg-white hover:border-slate-200'
                                                }`}
                                            >
                                              {/* Question Row */}
                                              <div
                                                className="p-3.5 flex items-center justify-between select-none"
                                              >
                                                <div className="flex items-center space-x-3 pr-4">
                                                  <div className={`flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-bold ${isAnswered
                                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                                    : 'bg-indigo-50/50 text-indigo-600 border-indigo-200'
                                                    }`}>
                                                    {qIdx + 1}
                                                  </div>
                                                  <p className={`text-xs font-semibold leading-relaxed ${isAnswered ? 'text-slate-800' : 'text-slate-500 font-medium'
                                                    }`}>
                                                    {question}
                                                  </p>
                                                </div>

                                                <div className="shrink-0 flex items-center space-x-1.5">
                                                  {/* Checkbox to mark as answered */}
                                                  <input
                                                    type="checkbox"
                                                    checked={isAnswered}
                                                    onChange={(e) => {
                                                      e.stopPropagation();
                                                      if (e.target.checked) {
                                                        const nextAnswers = { ...capturedAnswers, [question]: "Checked" };
                                                        setCapturedAnswers(nextAnswers);
                                                        generateFinalSummary("N", nextAnswers);
                                                      }
                                                    }}
                                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer"
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </section>
                    </>
                  )}

                  {/* Coaching Insights Section */}
                  <section className={`${!isMeetingActive ? 'flex-1' : ''} flex flex-col min-h-0 overflow-y-auto custom-scrollbar pr-2`}>
                    {(!isMeetingActive && finalSummary === null) && (
                      <div className="mb-6 p-4 bg-premium-100/50 rounded-xl border border-premium-200 animate-pulse">
                        <p className="text-[10px] font-bold text-premium-600 uppercase tracking-widest text-center">Preparing Final Meeting Summary...</p>
                      </div>
                    )}

                    {(!isMeetingActive && finalSummary) && (
                      <div className="mb-8 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {finalSummary.storeNote === "Y" ? (
                          <div className="space-y-6">
                            {/* Meeting Summary */}
                            <div className="p-5 bg-white rounded-2xl border border-premium-100 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600"></div>
                              <h4 className="text-[10px] font-black text-premium-900 uppercase tracking-widest mb-2 flex items-center">
                                <span className="mr-1.5">📊</span> Meeting Summary
                              </h4>
                              <p className="text-xs text-premium-700 leading-relaxed font-semibold">
                                {finalSummary.meetingSummary || 'No summary available.'}
                              </p>
                            </div>

                            {/* Why Change */}
                            <div className="p-5 bg-white rounded-2xl border border-premium-100 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>
                              <h4 className="text-[10px] font-black text-premium-900 uppercase tracking-widest mb-3 flex items-center">
                                <span className="mr-1.5">🎯</span> Why Change (Identify Pain)
                              </h4>
                              <div className="space-y-3">
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Pain Points</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.whyChange?.painPoints || []).map((point, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{point}</li>
                                    ))}
                                    {(!finalSummary.whyChange?.painPoints || finalSummary.whyChange.painPoints.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Business Drivers</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.whyChange?.businessDrivers || []).map((driver, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{driver}</li>
                                    ))}
                                    {(!finalSummary.whyChange?.businessDrivers || finalSummary.whyChange.businessDrivers.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-0.5">Urgency</span>
                                  <p className="text-xs text-premium-700 font-bold">{finalSummary.whyChange?.urgency || 'Not discussed'}</p>
                                </div>
                              </div>
                            </div>

                            {/* Value */}
                            <div className="p-5 bg-white rounded-2xl border border-premium-100 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
                              <h4 className="text-[10px] font-black text-premium-900 uppercase tracking-widest mb-3 flex items-center">
                                <span className="mr-1.5">💲</span> Value & Impact (Metrics)
                              </h4>
                              <div className="space-y-3">
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Desired Outcomes</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.value?.desiredOutcomes || []).map((outcome, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{outcome}</li>
                                    ))}
                                    {(!finalSummary.value?.desiredOutcomes || finalSummary.value.desiredOutcomes.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Metrics Discussed</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.value?.metricsDiscussed || []).map((metric, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{metric}</li>
                                    ))}
                                    {(!finalSummary.value?.metricsDiscussed || finalSummary.value.metricsDiscussed.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-0.5">Expected Impact</span>
                                  <p className="text-xs text-premium-700 font-bold">{finalSummary.value?.expectedImpact || 'Not discussed'}</p>
                                </div>
                              </div>
                            </div>

                            {/* Key Contacts */}
                            <div className="p-5 bg-white rounded-2xl border border-premium-100 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-500"></div>
                              <h4 className="text-[10px] font-black text-premium-900 uppercase tracking-widest mb-3 flex items-center">
                                <span className="mr-1.5">👥</span> Key Contacts (Buying Team)
                              </h4>
                              <div className="grid grid-cols-1 gap-4">
                                <div className="p-3.5 bg-slate-50/50 rounded-xl border border-slate-100">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1 tracking-wider">Economic Buyer</span>
                                  <p className="text-xs text-premium-900 font-bold">{finalSummary.keyContacts?.economicBuyer || 'Not discussed'}</p>
                                </div>
                                <div className="p-3.5 bg-slate-50/50 rounded-xl border border-slate-100">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1 tracking-wider">Champion</span>
                                  <p className="text-xs text-premium-900 font-bold">{finalSummary.keyContacts?.champion || 'Not discussed'}</p>
                                </div>
                                <div className="p-3.5 bg-slate-50/50 rounded-xl border border-slate-100">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase block mb-2 tracking-wider">Decision Makers</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.keyContacts?.decisionMakers || []).map((name, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{name}</li>
                                    ))}
                                    {(!finalSummary.keyContacts?.decisionMakers || finalSummary.keyContacts.decisionMakers.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                                <div className="p-3.5 bg-slate-50/50 rounded-xl border border-slate-100">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase block mb-2 tracking-wider">Influencers</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.keyContacts?.influencers || []).map((name, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{name}</li>
                                    ))}
                                    {(!finalSummary.keyContacts?.influencers || finalSummary.keyContacts.influencers.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                              </div>
                            </div>

                            {/* Decision Map */}
                            <div className="p-5 bg-white rounded-2xl border border-premium-100 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                              <h4 className="text-[10px] font-black text-premium-900 uppercase tracking-widest mb-3 flex items-center">
                                <span className="mr-1.5">🗺️</span> Decision Map
                              </h4>
                              <div className="space-y-3">
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Evaluation Criteria</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.decisionMap?.evaluationCriteria || []).map((item, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{item}</li>
                                    ))}
                                    {(!finalSummary.decisionMap?.evaluationCriteria || finalSummary.decisionMap.evaluationCriteria.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Decision Process</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.decisionMap?.decisionProcess || []).map((item, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{item}</li>
                                    ))}
                                    {(!finalSummary.decisionMap?.decisionProcess || finalSummary.decisionMap.decisionProcess.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Procurement Requirements</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.decisionMap?.procurementRequirements || []).map((item, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{item}</li>
                                    ))}
                                    {(!finalSummary.decisionMap?.procurementRequirements || finalSummary.decisionMap.procurementRequirements.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                              </div>
                            </div>

                            {/* Current Environment */}
                            <div className="p-5 bg-white rounded-2xl border border-premium-100 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                              <h4 className="text-[10px] font-black text-premium-900 uppercase tracking-widest mb-3 flex items-center">
                                <span className="mr-1.5">💻</span> Current Environment (Competition)
                              </h4>
                              <div className="space-y-3">
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Existing Tools</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.currentEnvironment?.existingTools || []).map((tool, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{tool}</li>
                                    ))}
                                    {(!finalSummary.currentEnvironment?.existingTools || finalSummary.currentEnvironment.existingTools.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Existing Processes</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.currentEnvironment?.existingProcesses || []).map((proc, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{proc}</li>
                                    ))}
                                    {(!finalSummary.currentEnvironment?.existingProcesses || finalSummary.currentEnvironment.existingProcesses.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Current Challenges</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.currentEnvironment?.currentChallenges || []).map((chal, i) => (
                                      <li key={i} className="text-xs text-premium-700 font-semibold">{chal}</li>
                                    ))}
                                    {(!finalSummary.currentEnvironment?.currentChallenges || finalSummary.currentEnvironment.currentChallenges.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">None identified.</li>
                                    )}
                                  </ul>
                                </div>
                              </div>
                            </div>

                            {/* Next Steps */}
                            <div className="p-5 bg-white rounded-2xl border border-premium-100 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-500"></div>
                              <h4 className="text-[10px] font-black text-premium-900 uppercase tracking-widest mb-3 flex items-center">
                                <span className="mr-1.5">📋</span> Next Steps
                              </h4>
                              <ul className="space-y-3 pl-1">
                                {(finalSummary.nextSteps || []).map((step, idx) => (
                                  <li key={idx} className="text-xs text-premium-700 font-semibold flex items-start gap-2">
                                    <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                                    <div className="flex-1">
                                      <p>{step.action}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        {step.owner && (
                                          <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md text-[9px] font-bold">
                                            Owner: {step.owner}
                                          </span>
                                        )}
                                        {step.dueDate && (
                                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[9px] font-bold">
                                            Due: {step.dueDate}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </li>
                                ))}
                                {(!finalSummary.nextSteps || finalSummary.nextSteps.length === 0) && (
                                  <li className="text-xs text-slate-400 italic">No actions defined.</li>
                                )}
                              </ul>
                            </div>

                            {/* Risks & Gaps */}
                            <div className="p-5 bg-white rounded-2xl border border-premium-100 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500"></div>
                              <h4 className="text-[10px] font-black text-premium-900 uppercase tracking-widest mb-3 flex items-center">
                                <span className="mr-1.5">⚠️</span> Risks & Gaps
                              </h4>
                              <div className="space-y-3">
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Deal Risks</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.risksGaps?.dealRisks || []).map((risk, i) => (
                                      <li key={i} className="text-xs text-red-700 font-semibold">{risk}</li>
                                    ))}
                                    {(!finalSummary.risksGaps?.dealRisks || finalSummary.risksGaps.dealRisks.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">No immediate risks identified.</li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <span className="text-[9px] font-bold text-premium-400 uppercase tracking-wider block mb-1">Missing Information</span>
                                  <ul className="list-disc list-inside space-y-1 pl-1">
                                    {(finalSummary.risksGaps?.missingInformation || []).map((info, i) => (
                                      <li key={i} className="text-xs text-amber-700 font-semibold">{info}</li>
                                    ))}
                                    {(!finalSummary.risksGaps?.missingInformation || finalSummary.risksGaps.missingInformation.length === 0) && (
                                      <li className="text-xs text-slate-400 italic list-none">No missing information identified.</li>
                                    )}
                                  </ul>
                                </div>
                              </div>
                            </div>

                            {/* MEDDPICC Mapping */}
                            <div className="p-5 bg-white rounded-2xl border border-premium-100 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-500"></div>
                              <h4 className="text-[10px] font-black text-premium-900 uppercase tracking-widest mb-3 flex items-center">
                                <span className="mr-1.5">🎯</span> MEDDPICC Mapping
                              </h4>
                              <div className="grid grid-cols-1 gap-4">
                                {[
                                  { label: 'Metrics', value: finalSummary.meddpiccMapping?.metrics, letter: 'M', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                                  { label: 'Economic Buyer', value: finalSummary.meddpiccMapping?.economicBuyer, letter: 'E', color: 'bg-blue-50 text-blue-700 border-blue-100' },
                                  { label: 'Decision Criteria', value: finalSummary.meddpiccMapping?.decisionCriteria, letter: 'D', color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
                                  { label: 'Decision Process', value: finalSummary.meddpiccMapping?.decisionProcess, letter: 'D', color: 'bg-purple-50 text-purple-700 border-purple-100' },
                                  { label: 'Paper Process', value: finalSummary.meddpiccMapping?.paperProcess, letter: 'P', color: 'bg-pink-50 text-pink-700 border-pink-100' },
                                  { label: 'Identify Pain', value: finalSummary.meddpiccMapping?.identifyPain, letter: 'I', color: 'bg-amber-50 text-amber-700 border-amber-100' },
                                  { label: 'Champion', value: finalSummary.meddpiccMapping?.champion, letter: 'C', color: 'bg-teal-50 text-teal-700 border-teal-100' }
                                ].map((item, idx) => (
                                  <div key={idx} className="p-4 bg-white rounded-xl border border-premium-100 shadow-xs flex items-start gap-3">
                                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-black text-xs border ${item.color}`}>
                                      {item.letter}
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-[9px] font-black text-premium-400 uppercase tracking-wider block">{item.label}</span>
                                      <p className="text-[11px] font-semibold text-premium-700 leading-normal">{item.value || 'Not discussed'}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-5 bg-white rounded-2xl border border-premium-100 shadow-xl relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-linear-to-b from-blue-500 to-indigo-600"></div>
                            <h3 className="text-[10px] font-black text-premium-900 uppercase tracking-[0.2em] mb-4 flex items-center">
                              <span className="mr-2">📊</span> Meeting Summary
                            </h3>

                            {Object.entries(finalSummary)?.map(([key, value]) => {
                              if (!value || ['opportunityId', 'customerId', "cleanTranscript", "introduction", "storeNote"].includes(key)) return null;

                              let content;
                              if (key === 'KeyContacts' && Array.isArray(value)) {
                                content = (
                                  <ul className="list-none space-y-1">
                                    {value.map((contact, idx) => (
                                      <li key={idx} className="text-xs text-premium-700 font-medium">
                                        • {contact.name} {contact.title ? `(${contact.title})` : ''}
                                      </li>
                                    ))}
                                  </ul>
                                );
                              } else if (typeof value === 'string' && value.includes('<p>')) {
                                content = <div className="text-xs text-premium-700 leading-relaxed font-medium summary-html-content" dangerouslySetInnerHTML={{ __html: value }} />;
                              } else {
                                content = <p className="text-xs text-premium-700 leading-relaxed font-medium">{value}</p>;
                              }

                              const keyLabels = {
                                Why_Do_Anything: 'Why Change (Identify Pain)',
                                BusinessValue: 'Metrics (Business Value)',
                                KeyContacts: 'Key Contacts (Economic Buyer + Champion)',
                                NextSteps: 'Next Steps',
                                DecisionMap: 'Decision Map (Process + Criteria)',
                                CurrentEnvironment: 'Current Environment (Competition)'
                              };

                              return (
                                <div key={key} className="mb-4 last:mb-0">
                                  <h4 className="text-[9px] font-bold text-premium-400 uppercase tracking-wider mb-1">
                                    {keyLabels[key] || key.replace(/_/g, ' ')}
                                  </h4>
                                  {content}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* {isLoading && (
                      <div className="flex flex-col items-center justify-center py-12">
                        <div className="w-6 h-6 border-2 border-premium-900 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-[9px] font-bold text-premium-400 uppercase tracking-[0.3em] animate-pulse">Analyzing Meeting...</p>
                      </div>
                    )} */}
                    <div ref={bottomRef} />
                  </section>
                </>
              )}
              {opportunitys?.length > 0 && !selectedOpportunity && (
                <div className="h-24 flex-shrink-0" />
              )}
            </main>
          </>
        )}

        {/* Warning Overlay */}
        <CaptionWarning active={isCcActive} />
        {opportunitys?.length > 0 && !selectedOpportunity && (
          <OpportunityWarning />
        )}
      </div>
    </>
  );
};

export default App;