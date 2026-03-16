import React, { useState, useMemo } from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

interface ErrorMessageBoxProps {
  errorText: string;
}

const ErrorMessageBox: React.FC<ErrorMessageBoxProps> = ({ errorText }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Parse out the most readable message
  const summaryMessage = useMemo(() => {
    try {
      // First try to strip the `Error: ` prefix if it exists
      let cleanString = errorText.trim();
      if (cleanString.startsWith('Error: ')) {
        cleanString = cleanString.substring(7).trim();
      }
      
      // Sometimes the error is double-stringified JSON, so we handle that by parsing twice if needed
      let parsed = JSON.parse(cleanString);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          // If the inner string wasn't actually JSON, just use it as the message
          return parsed;
        }
      }
      
      let currentObj = parsed;
      while (currentObj && typeof currentObj === 'object') {
         if (typeof currentObj.error === 'string') {
            try {
               currentObj.error = JSON.parse(currentObj.error);
            } catch {
                // Ignore parsing errors, it could just be a string message named "error"
            }
         }
         
         // Sometimes the error payload is stringified inside `message` instead of `error` (e.g. Gemini via REST)
         let messageParsed = false;
         if (typeof currentObj.message === 'string' && currentObj.message.includes('"error":')) {
             try {
                // Attempt to parse the string inside the message field. Often it's missing outer braces.
               const parsedMsgObj = JSON.parse(`{${currentObj.message.trim()}`);
               if (parsedMsgObj.error) {
                   currentObj = parsedMsgObj.error;
                   messageParsed = true;
                   continue; // Skip the rest of loop to process this new currentObj
               }
            } catch {
                try {
                   // Or it might be fully stringified properly
                   const parsedMsgObj = JSON.parse(currentObj.message.trim());
                   if (parsedMsgObj.error) {
                       currentObj = parsedMsgObj.error;
                       messageParsed = true;
                       continue;
                   }
                } catch {
                   // Ignore if we can't parse it
                }
            }
         }
         
         if (currentObj.error && typeof currentObj.error === 'object') {
            currentObj = currentObj.error;
         } else if (!messageParsed) {
            break;
         }
      }
      
      // Now currentObj should be the innermost error object
      if (currentObj.message && typeof currentObj.message === 'string') {
        return currentObj.message;
      }
      
      // Fallback for unexpected formats that parsed successfully but don't have .message
      return 'An API error occurred. See details.';
    } catch {
      // If it's not JSON, check if it's just a raw message string
      let rawString = errorText.trim();
      if (rawString.startsWith('Error: ')) {
        rawString = rawString.substring(7).trim();
      }
      if (rawString.length < 150 && !rawString.includes('{')) {
        return rawString;
      }
      return 'An unexpected error occurred.';
    }
  }, [errorText]);

  return (
    <div className="w-full flex flex-col items-start gap-1 my-2">
      <div 
        className={`w-full bg-red-500/10 border border-red-500/20 rounded-md p-3 flex items-start gap-3 transition-colors ${
          !isExpanded ? 'cursor-pointer hover:bg-red-500/15' : ''
        }`}
        onClick={() => !isExpanded && setIsExpanded(true)}
      >
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            {summaryMessage}
          </p>
          
          {isExpanded && (
            <div className="mt-3 relative">
              <pre className="text-xs text-red-700 dark:text-red-300 bg-red-500/5 p-3 rounded overflow-x-auto whitespace-pre-wrap font-mono relative pr-12">
                {errorText}
              </pre>
            </div>
          )}
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="p-1 rounded-md text-red-500/70 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
          aria-label={isExpanded ? "Collapse error details" : "Expand error details"}
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

export default ErrorMessageBox;
