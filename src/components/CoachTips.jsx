import React from 'react';

const CoachTips = ({ tips, isLoading }) => {
  return (
    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
      {tips.length === 0 && !isLoading ? (
        <div className="text-center py-10 text-gray-400 italic">
          Listening for captions to provide coaching...
        </div>
      ) : (
        <>
          {tips.map((tip, index) => (
            <div
              key={index}
              className="bg-white p-5 rounded-2xl border border-premium-100 shadow-sm animate-slide-in relative overflow-hidden group hover:shadow-md transition-all duration-300"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-premium-900"></div>
              <p className="text-[13px] text-premium-800 leading-relaxed font-medium">
                {tip}
              </p>
              <div className="mt-4 flex items-center justify-between">
                {/* <span className="text-[9px] text-premium-400 font-black uppercase tracking-[0.2em]">
                  //MEDDPICC INSIGHT
                </span> */}
                <span className="text-[10px] text-premium-100 group-hover:text-premium-200 transition-colors">
                  ✦
                </span>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="bg-white/40 p-4 rounded-xl border border-dashed border-premium-200 animate-pulse relative overflow-hidden">
              <div className="h-4 bg-premium-100 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-premium-100 rounded w-1/2"></div>
              <div className="mt-2 h-2 bg-premium-50 rounded w-1/4"></div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CoachTips;
