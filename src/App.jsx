import React, { useState, useEffect, useRef } from 'react';
import { Autocomplete, TextField, Typography, Button } from '@mui/material';
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
} from './services/openai';
import { getCustomerByEmail } from './services/customersService';
import { getOpportunitiesByCustomerId, updateOpportunityData, createOpportunityData } from './services/opportunitiesService';
import OpportunityWarning from './components/OpportunityWarning';
// Group questions by category
const CATEGORIES = {
  Why_Do_Anything: Why_Do_Anything_Questions,
  BusinessValue: BusinessValue_Questions,
  KeyContacts: KeyContacts_Questions,
  NextSteps: NextSteps_Questions
};

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

const App = () => {
  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Kolkata" ? "Asia/Calcutta" : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [tips, setTips] = useState([]);
  const [isCcActive, setIsCcActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);

  const [transcriptHistory, setTranscriptHistory] = useState("");
  const [capturedAnswers, setCapturedAnswers] = useState({});
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMeetingActive, setIsMeetingActive] = useState(true);
  const [finalSummary, setFinalSummary] = useState(null);
  const [meetingCode, setMeetingCode] = useState(null);
  const [participants, setParticipants] = useState(null);
  const [customerId, setCustomerId] = useState(23);
  const [opportunitys, setOpportunitys] = useState([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [newOppName, setNewOppName] = useState('');

  const bottomRef = useRef(null);
  const lastProcessedTranscript = useRef("");
  const intervalRef = useRef(null);
  const transcriptRef = useRef("");
  const answersRef = useRef({});
  const opportunityRef = useRef(null);
  const customerIdRef = useRef(23);
  const summaryGeneratedRef = useRef(false);

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

  // Build list of all questions sorted (answered first)
  const getAllSortedQuestions = () => {
    const allQuestions = Object.values(CATEGORIES).flat();
    const unanswered = [];

    allQuestions.forEach(q => {
      if (!(capturedAnswers[q] && capturedAnswers[q].trim() !== "")) {
        unanswered.push({ question: q, answer: null, isAnswered: false });
      }
    });

    return unanswered;
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
        generateFinalSummary();
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Polling every 5 seconds – only if meeting active and there are unanswered categories
  useEffect(() => {
    if (!isMeetingActive) return;
    intervalRef.current = setInterval(() => {
      const activeQuestions = getActiveQuestions();
      // if (transcriptHistory.trim() &&
      //   transcriptHistory !== lastProcessedTranscript.current &&
      //   activeQuestions.length > 0) {
      if (transcriptHistory.trim() &&
        transcriptHistory !== lastProcessedTranscript.current) {
        processTranscript(transcriptHistory, activeQuestions);
        lastProcessedTranscript.current = transcriptHistory;
      }
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [transcriptHistory, isMeetingActive, capturedAnswers]);

  // // Polling for participants until found
  // useEffect(() => {
  //   if (!isMeetingActive || !meetingCode || participants !== null) return;

  //   const logParticipants = async () => {
  //     setIsLoadingInfo(true)
  //     setCustomerId(23);
  //     const oppData = await getOpportunitiesByCustomerId(23);
  //     if (oppData?.data?.result?.status === 200) {
  //       setOpportunitys(oppData?.data?.result[0]?.opportunitiesNameOptions)
  //       setIsLoadingInfo(false)
  //     } else {
  //       setIsLoadingInfo(false)
  //     }
  //     // const participantsList = await googleMeetService.fetchParticipants(meetingCode);
  //     // if (participantsList && participantsList.length > 0) {
  //     //   setIsLoadingInfo(true)
  //     //   setParticipants(participantsList[0]);
  //     //   const res = await getCustomerByEmail(participantsList[0].email)
  //     //   if (res?.data?.status === 200) {
  //     //     if (res?.data?.result?.id) {
  //     //       setCustomerId(res?.data?.result?.id);
  //     //       const oppData = await getOpportunitiesByCustomerId(res?.data?.result?.id);
  //     //       setOpportunitys(oppData.data.result[0]?.opportunitiesNameOptions)
  //     //       setIsLoadingInfo(false)
  //     //     } else {
  //     //       setCustomerId(undefined);
  //     //       window.parent.postMessage({
  //     //         type: 'SHOW_REG_MODAL',
  //     //         email: participantsList[0].email
  //     //       }, '*');
  //     //       setIsLoadingInfo(false)
  //     //     }
  //     //   }
  //     // }
  //   };

  //   logParticipants();
  //   const pInterval = setInterval(logParticipants, 60000);
  //   return () => clearInterval(pInterval);
  // }, [meetingCode, isMeetingActive, participants]);

  // Polling for participants until found
  useEffect(() => {
    const logParticipants = async () => {
      setIsLoadingInfo(true)
      setCustomerId(23);
      const oppData = await getOpportunitiesByCustomerId(23);
      if (oppData?.data.status === 200) {
        setOpportunitys(oppData?.data?.result[0]?.opportunitiesNameOptions)
        setIsLoadingInfo(false)
      } else {
        setIsLoadingInfo(false)
      }
    };

    if (isMeetingActive) {
      logParticipants();
    }
  }, [isMeetingActive]);

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
    // if (activeQuestions.length === 0) return;
    setIsLoading(true);
    try {
      const result = await getSalesCoaching(text);
      if (result) {
        if (result.coaching) {
          setTips(prev => [...prev, result.coaching]);
        }
        if (result.extracted_answers && result.extracted_answers.length > 0) {
          setCapturedAnswers(prev => {
            const next = { ...prev };
            result.extracted_answers.forEach(item => {
              // Update with latest answer (overwrite if we have new detail)
              if (item.answer && item.answer.trim()) {
                next[item.question] = item.answer;
              }
            });
            return next;
          });
          generateFinalSummary()
        }
      }
    } catch (err) {
      console.error("Error processing transcript:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateFinalSummary = async () => {
    if (summaryGeneratedRef.current) return;
    summaryGeneratedRef.current = true;
    try {
      // Final cut: Ensure the transcript is clean of any stray repeats
      const rawTranscript = transcriptRef.current;
      const cleanTranscript = rawTranscript.split(/[.!?]+\s+/)
        .map(s => s.trim())
        .filter((s, i, arr) => s && arr.indexOf(s) === i) // Simple de-duplicate of sentences
        .join(". ");

      if (cleanTranscript && answersRef.current) {
        setIsLoading(true);
        const summary = await getMeetingSummary(cleanTranscript, answersRef.current);
        if (summary) {
          const processedKeyContacts = Array.isArray(summary.KeyContacts)
            ? summary.KeyContacts.map(contact => {
              const cleanName = (contact.name || "").replace(/^(Mr\.|Mrs\.|Ms\.|Mr|Mrs|Ms)\s+/i, "").trim();
              const nameParts = cleanName.split(/\s+/);
              return {
                ...contact,
                firstName: nameParts[0] || "",
                lastName: nameParts.slice(1).join(" ") || "",
              };
            })
            : summary.KeyContacts;

          let finalSummaryData = {
            ...summary,
            Why_Do_Anything: `<p>${summary.Why_Do_Anything || ""}</p>`,
            BusinessValue: `<p>${summary.BusinessValue || ""}</p>`,
            KeyContacts: processedKeyContacts,
            opportunityId: opportunityRef.current?.id,
            customerId: customerIdRef.current,
            cleanTranscript: cleanTranscript
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
      setIsLoading(false);
    }
  };
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
            <h1 className="text-sm font-black tracking-tighter text-premium-900 uppercase">Sales Coach</h1>
            <p className="text-[9px] font-bold text-premium-400 uppercase tracking-[0.2em]">Powered by 360Pipe</p>
          </div>

          <div className="flex items-center space-x-3">
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

                  {/* Suggested Questions Section */}
                  {
                    isMeetingActive && (
                      <section className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                          <h2 className="text-[10px] font-black text-premium-900 uppercase tracking-[0.2em] flex items-center">
                            Suggested Questions
                          </h2>
                        </div>

                        <div className="space-y-3">
                          {getAllSortedQuestions()?.map((item, index) => (
                            <div
                              key={index}
                              className="p-4 bg-white rounded-xl border border-premium-100 shadow-sm hover:shadow-md transition-all duration-200 flex items-start group cursor-pointer"
                            >
                              <div className="mt-1 mr-3 w-1.5 h-1.5 rounded-full bg-premium-200 group-hover:bg-blue-400 transition-colors flex-shrink-0"></div>
                              <Typography sx={{
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                color: '#4b5563',
                                lineHeight: 1.4
                              }}>
                                {item.question}
                              </Typography>
                            </div>
                          ))}
                        </div>
                      </section>
                    )
                  }

                  {/* Coaching Insights Section */}
                  <section className="flex-1 flex-col min-h-0 overflow-y-auto custom-scrollbar pr-2">
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
                            if (!value || ['opportunityId', 'customerId', "cleanTranscript"].includes(key)) return null;

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

                            return (
                              <div key={key} className="mb-4 last:mb-0">
                                <h4 className="text-[9px] font-bold text-premium-400 uppercase tracking-wider mb-1">{key.replace(/_/g, ' ')}</h4>
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