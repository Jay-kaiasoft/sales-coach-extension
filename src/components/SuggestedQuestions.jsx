import React from 'react';

const SuggestedQuestions = ({ questions }) => {
  if (questions.length === 0) {
    return (
      <div className="bg-green-50 border border-green-100 p-4 rounded-xl">
        <p className="text-sm text-green-700 flex items-center">
          <span className="mr-2">✅</span> All key questions have been addressed!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {questions?.map((question, index) => (
        <div
          key={index}
          className="bg-white px-3 py-2 rounded-xl border border-premium-100 shadow-sm flex items-center group hover:border-[#44288E] hover:bg-[#44288E] transition-all duration-300 cursor-help"
          title="Try asking this question to your customer"
        >
          <span className="text-[10px] mr-2 group-hover:scale-125 transition-transform">💡</span>
          <p className="text-[10px] text-premium-700 font-bold leading-tight group-hover:text-white transition-colors">
            {question}
          </p>
        </div>
      ))}
    </div>
  );
};

export default SuggestedQuestions;
