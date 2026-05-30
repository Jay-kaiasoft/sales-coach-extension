import React, { useState, useEffect, useRef } from 'react';
import { Autocomplete, TextField, Typography, Button } from '@mui/material';
import { getCookie } from './utils/cookieHelper';
import Login from './components/Login';
import CoachTips from './components/CoachTips';
import CaptionWarning from './components/CaptionWarning';
import { googleMeetService } from './services/googleMeet';
import {
  getSalesCoaching,
  getMeetingSummary,
  Why_Do_Anything_Questions,
  BusinessValue_Questions,
  KeyContacts_Questions,
  NextSteps_Questions,
  DECISIONMAP_Questions,
  CURRENTENVIRONMENT_Questions,
} from './services/openai';
import { getCustomerByEmail } from './services/customersService';
import { getOpportunitiesByCustomerId, updateOpportunityData, createOpportunityData } from './services/opportunitiesService';
import OpportunityWarning from './components/OpportunityWarning';

// Group questions by category matching MEDDIC letters
const CATEGORIES = {
  BusinessValue: BusinessValue_Questions,     // M
  KeyContacts: KeyContacts_Questions,         // E
  NextSteps: NextSteps_Questions,             // D
  DecisionMap: DECISIONMAP_Questions,         // D
  Why_Do_Anything: Why_Do_Anything_Questions, // I
  CurrentEnvironment: CURRENTENVIRONMENT_Questions // C
};

const MEDDIC_STAGES = [
  {
    key: 'BusinessValue',
    letter: 'M',
    label: 'Metrics',
    title: 'Metrics',
    description: 'Understand success metrics, ROI expectations, and economic value.',
    questions: BusinessValue_Questions,
    baseInsight: 'Quantify the financial impact. Focus on metrics like revenue growth, cost reduction, or time saved. Ask: "What would a 10% improvement mean for your bottom line?"'
  },
  {
    key: 'KeyContacts',
    letter: 'E',
    label: 'Economic Buyer + Champion',
    title: 'Key Contacts',
    description: 'Identify the Economic Buyer, Champion, and key decision influencers.',
    questions: KeyContacts_Questions,
    baseInsight: 'Locate the decision-maker early. Ensure you understand their personal drivers and how they define success. Ask: "Who is ultimately responsible for signing off on this initiative?"'
  },
  {
    key: 'NextSteps',
    letter: 'D',
    label: 'Next Steps',
    title: 'Next Steps',
    description: 'Establish the roadmap, immediate action items, and timelines.',
    questions: NextSteps_Questions,
    baseInsight: 'Keep momentum high. Agree on a specific date and objective for the next meeting. Ask: "What would make sense as a next step from here to keep this moving?"'
  },
  {
    key: 'DecisionMap',
    letter: 'D',
    label: 'Decision Process + Criteria',
    title: 'Decision Map',
    description: 'Map out the decision process, criteria, and internal approval steps.',
    questions: DECISIONMAP_Questions,
    baseInsight: 'Understand the criteria and process. Clarify procurement, legal, and security timelines. Ask: "Can you walk me through the typical process for selecting and onboarding a vendor?"'
  },
  {
    key: 'Why_Do_Anything',
    letter: 'I',
    label: 'Identify Pain',
    title: 'Why Change',
    description: 'Understand the customer\'s business challenges, drivers, and urgency.',
    questions: Why_Do_Anything_Questions,
    baseInsight: 'Uncover the cost of doing nothing. Understand why this is a priority now rather than later. Ask: "What happens if this problem is not solved by next quarter?"'
  },
  {
    key: 'CurrentEnvironment',
    letter: 'C',
    label: 'Competition + Pain',
    title: 'Current Environment',
    description: 'Assess the current process, alternative solutions, and competitive risks.',
    questions: CURRENTENVIRONMENT_Questions,
    baseInsight: 'Map the tech stack and competition. Assess if they are considering internal builds or other vendors. Ask: "What other options are you evaluating to solve this?"'
  }
];

// Utility to merge new transcript chunks while removing overlaps
const mergeTranscript = (existing, newChunk) => {
  const s1 = (existing || "").trim();
  const s2 = (newChunk || "").trim();
  if (!s1) return s2;
  if (!s2) return s1;

  // If s2 is already at the end of s1, just return s1
  if (s1.endsWith(s2)) return s1;

  // Split s2 into words to find the longest overlapping prefix
  const words2 = s2.split(/\s+/);
  for (let i = words2.length; i > 0; i--) {
    const prefix = words2.slice(0, i).join(" ");
    if (s1.endsWith(prefix)) {
      return s1 + " " + words2.slice(i).join(" ");
    }
  }

  return s1 + " " + s2;
};

const renderStageIcon = (key) => {
  switch (key) {
    case 'BusinessValue':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case 'KeyContacts':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'NextSteps':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'DecisionMap':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      );
    case 'Why_Do_Anything':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
        </svg>
      );
    case 'CurrentEnvironment':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    default:
      return null;
  }
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

  // MEDDIC States
  const [activeCategoryKey, setActiveCategoryKey] = useState('BusinessValue');
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [isMeddicCollapsed, setIsMeddicCollapsed] = useState(false);

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

  // Helper: determine unanswered categories
  const getUnansweredCategories = () => {
    const unanswered = new Set(Object.keys(CATEGORIES));
    for (const question in capturedAnswers) {
      if (capturedAnswers[question] && capturedAnswers[question].trim() !== "") {
        // Find which category this question belongs to and mark it as answered
        for (const [cat, questions] of Object.entries(CATEGORIES)) {
          if (questions.includes(question)) {
            unanswered.delete(cat);
            break;
          }
        }
      }
    }
    return Array.from(unanswered);
  };

  // Build list of active questions (only from categories that still have no answers)
  const getActiveQuestions = () => {
    const unansweredCategories = getUnansweredCategories();
    let active = [];
    for (const cat of unansweredCategories) {
      active.push(...CATEGORIES[cat]);
    }
    return active;
  };

  // Get answered count and status for a MEDDIC stage
  const getCategoryStatus = (stage) => {
    const qList = stage.questions;
    const answeredCount = qList.filter(q => capturedAnswers[q] && capturedAnswers[q].trim() !== "").length;
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
      if (currentAnswers[question] && currentAnswers[question].trim() !== "") {
        for (const [cat, questions] of Object.entries(CATEGORIES)) {
          if (questions.includes(question)) {
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
    if (activeQuestions.length === 0) return;
    setIsLoading(true);
    try {
      const result = await getSalesCoaching(text);
      if (result) {
        // if (result.coaching) {
        //   setTips(prev => [...prev, result.coaching]);
        // }
        if (result.extracted_answers && result?.extracted_answers?.length > 0) {
          let updatedAnswers;
          setCapturedAnswers(prev => {
            const next = { ...prev };
            result.extracted_answers.forEach(item => {
              // Update with latest answer (overwrite if we have new detail)
              if (item.answer && item.answer.trim()) {
                next[item.question] = item.answer;
              }
            });
            updatedAnswers = next;
            return next;
          });
          generateFinalSummary("N", updatedAnswers);
          // if (updatedAnswers) {
          // }
        }
      }
    } catch (err) {
      console.error("Error processing transcript:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateFinalSummary = async (storeNote = "N", currentAnswers = null) => {
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

          if (storeNote === "Y" && Array.isArray(keyContactsBackupRef.current)) {
            processedKeyContacts = keyContactsBackupRef.current;
          }

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
          setFinalSummary(finalSummaryData);
          setTips([]);
          if (opportunityRef.current?.id && customerIdRef.current) {
            const response = await updateOpportunityData(finalSummaryData)
            if (response.data.status !== 200) {
              console.log("Failed to update opportunity data:", response.data.message);
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

                  {/* MEDDIC Qualification Section */}
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
                          onClick={() => setIsMeddicCollapsed(prev => !prev)}
                        >
                          <div className="flex items-center space-x-2">
                            <h2 className="text-xs font-black text-premium-900 uppercase tracking-wider flex items-center">
                              MEDDIC Qualification
                            </h2>
                            <div
                              className="text-premium-400 hover:text-premium-600 transition-colors cursor-pointer flex items-center"
                              title="MEDDIC is a sales qualification framework focused on Metrics, Economic Buyer, Decision Process, Decision Criteria, Identify Pain, and Competition."
                              onClick={(e) => e.stopPropagation()}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                          </div>

                          <button className="text-premium-400 hover:text-premium-600 transition-transform duration-200 cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transform transition-transform ${isMeddicCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                        </div>

                        {/* Expandable MEDDIC Section */}
                        {!isMeddicCollapsed && (
                          <div className="p-5 space-y-6">
                            {/* Circular Tabs Row */}
                            <div className="relative flex items-center justify-between w-full px-2 py-4">
                              {/* Dash Connector Line */}
                              <div className="absolute top-1/2 left-4 right-4 h-0.5 border-t border-dashed border-slate-200 -translate-y-1/2 z-0"></div>

                              {MEDDIC_STAGES.map((stage) => {
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
                                {MEDDIC_STAGES.find(s => s.key === activeCategoryKey)?.label}
                              </span>
                            </div>

                            {/* Active Stage Details Card */}
                            {(() => {
                              const activeStage = MEDDIC_STAGES.find(s => s.key === activeCategoryKey);
                              if (!activeStage) return null;

                              const { answeredCount, totalCount, isCompleted } = getCategoryStatus(activeStage);
                              const indexPrefix = MEDDIC_STAGES.indexOf(activeStage) + 1;

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
                                          const answer = capturedAnswers[question];
                                          return !(answer && answer.trim());
                                        })
                                        .map((question, qIdx) => {
                                          const answer = capturedAnswers[question];
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
                      </div>
                    )}

                    {isLoading && (
                      <div className="flex flex-col items-center justify-center py-12">
                        <div className="w-6 h-6 border-2 border-premium-900 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-[9px] font-bold text-premium-400 uppercase tracking-[0.3em] animate-pulse">Analyzing Meeting...</p>
                      </div>
                    )}
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