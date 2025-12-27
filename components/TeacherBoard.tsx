import React from 'react';
import { BoardContent } from '../types';

interface TeacherBoardProps {
  content: BoardContent;
  onClose: () => void;
}

const TeacherBoard: React.FC<TeacherBoardProps> = ({ content, onClose }) => {
  if (!content.isVisible) return null;

  // Defensive check for items
  const items = Array.isArray(content.items) ? content.items : [];
  
  // SANITIZER AND DATA ACCESSOR
  const cleanContent = (text: string): string => {
    if (!text) return '';
    // Removes "Detail:", "Content:", "Value:", "Description:" case-insensitive, with or without spaces/colons
    return text.replace(/^(detail|content|value|description|step)(\s*:)?\s*/i, '');
  };

  const getItemContent = (item: any): string => {
    if (item === null || item === undefined) return '';
    if (typeof item === 'string') return cleanContent(item);
    if (typeof item === 'number') return String(item);
    
    // Prioritize 'content', fall back to others
    const raw = item.content || item.detail || item.text || item.value || item.description || '';
    return cleanContent(raw);
  };

  const getItemHeading = (item: any): string => {
    if (typeof item === 'string' || typeof item === 'number' || !item) return '';
    const raw = item.heading || item.title || item.label || item.key || item.name || '';
    return cleanContent(raw);
  };

  const renderContent = () => {
    switch (content.visualType) {
      case 'bar_chart':
        // Calculate max value for scaling
        const values = items.map(i => parseFloat(getItemContent(i)) || 0);
        const maxVal = Math.max(...values, 1);
        
        return (
          <div className="flex flex-col h-64 justify-end gap-2 px-4 pt-8">
            <div className="flex items-end justify-around h-full gap-2 border-b-2 border-white/50 pb-2">
              {items.map((item, idx) => {
                const val = parseFloat(getItemContent(item)) || 0;
                const height = Math.max((val / maxVal) * 100, 5); // min height 5%
                const chalkColor = idx % 2 === 0 ? 'bg-yellow-100' : 'bg-blue-200';
                return (
                  <div key={idx} className="flex flex-col items-center justify-end w-full group">
                    <div 
                      className={`relative w-full max-w-[60px] ${chalkColor} opacity-90 rounded-t-sm transition-all duration-1000 ease-out`} 
                      style={{ 
                        height: `${height}%`,
                        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)' 
                      }}
                    >
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-white drop-shadow-md">{val}</span>
                    </div>
                    <span className="text-[10px] md:text-xs text-white mt-2 text-center truncate w-full font-medium">{getItemHeading(item)}</span>
                  </div>
                );
              })}
            </div>
            <div className="text-center text-xs text-white uppercase tracking-widest mt-2 font-bold opacity-80">Data Visualization</div>
          </div>
        );

      case 'step_by_step':
        return (
          <div className="space-y-4">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-4 items-start" style={{ animationDelay: `${idx * 100}ms` }}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full border-2 border-white text-white flex items-center justify-center font-bold bg-white/10">
                  {idx + 1}
                </div>
                <div>
                  {getItemHeading(item) && <div className="font-bold text-yellow-200 text-sm mb-1">{getItemHeading(item)}</div>}
                  <div className="text-white text-sm leading-relaxed font-medium">{getItemContent(item)}</div>
                </div>
              </div>
            ))}
          </div>
        );

      case 'comparison':
        return (
          <div className="grid grid-cols-2 gap-4 h-full">
            {items.map((item, idx) => (
              <div key={idx} className="border-2 border-white/20 p-3 rounded-lg flex flex-col bg-white/5">
                <div className="font-bold text-center text-yellow-200 border-b border-white/20 pb-2 mb-2 uppercase text-xs tracking-wider">
                  {getItemHeading(item) || `Option ${idx + 1}`}
                </div>
                <div className="text-sm text-white flex-1 flex items-center justify-center text-center p-2 font-medium">
                  {getItemContent(item)}
                </div>
              </div>
            ))}
          </div>
        );

      case 'code_snippet':
        const codeContent = getItemContent(items[0]) || JSON.stringify(items, null, 2);
        return (
          <div className="bg-black/40 rounded-lg p-4 font-mono text-xs md:text-sm text-green-300 overflow-x-auto border border-white/10 shadow-inner">
            <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-2 text-white text-xs uppercase font-bold">
              <span>{getItemHeading(items[0]) || 'Code'}</span>
              <div className="flex gap-1 opacity-50">
                <div className="w-2 h-2 rounded-full bg-white/50"></div>
                <div className="w-2 h-2 rounded-full bg-white/50"></div>
              </div>
            </div>
            <pre className="whitespace-pre-wrap font-medium">{codeContent}</pre>
          </div>
        );
      
      case 'summary_card':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 border-2 border-dashed border-white/30 rounded-xl bg-white/5">
            <div className="text-6xl mb-4 animate-bounce">💡</div>
            <div className="text-lg font-bold text-yellow-100 leading-snug drop-shadow-md">{getItemContent(items[0])}</div>
          </div>
        );

      case 'bullet_list':
      default:
        return (
          <ul className="space-y-3 pl-2">
            {items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="text-yellow-300 mt-1 text-xl leading-none flex-shrink-0">•</span>
                <span className="text-sm md:text-base leading-relaxed text-white font-medium">
                  {getItemHeading(item) && <strong className="text-yellow-100 block mb-1 text-sm">{getItemHeading(item)}</strong>}
                  {getItemContent(item)}
                </span>
              </li>
            ))}
          </ul>
        );
    }
  };

  return (
    <div className="absolute top-4 left-4 right-4 md:left-auto md:right-1/2 md:translate-x-1/2 md:top-10 z-30 transition-all duration-500">
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <div className="relative mx-auto max-w-md">
        
        {/* Wood Frame */}
        <div className="bg-[#8B4513] p-3 rounded-lg shadow-2xl transform rotate-1 border-b-4 border-[#5D2906]">
          {/* Chalkboard Surface */}
          <div className="bg-[#2F4F4F] border-2 border-[#1a2e2e] p-6 rounded min-h-[200px] flex flex-col relative shadow-inner text-white">
            
            {/* Dust texture overlay (subtle) */}
            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/black-chalkboard.png')]"></div>

            {/* Content Title */}
            <h3 className="text-white font-bold text-xl mb-4 text-center border-b border-white/20 pb-2 tracking-wide drop-shadow-md relative z-10 font-sans">
              {content.title}
            </h3>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto max-h-[300px] relative z-10 no-scrollbar" style={{ color: 'white' }}>
              {items.length > 0 ? renderContent() : <div className="text-center text-white/50 italic py-4">Waiting for chalk...</div>}
            </div>

            {/* Eraser Button */}
            <button 
              onClick={onClose}
              className="absolute -bottom-5 -right-5 bg-yellow-100 hover:bg-white text-slate-800 px-4 py-2 rounded shadow-lg border-b-4 border-yellow-200 transform -rotate-3 transition-transform hover:scale-110 active:scale-95 text-xs font-bold uppercase tracking-widest z-20 flex items-center gap-2"
              title="Close Board"
            >
              <span className="text-lg">🧽</span> Eraser
            </button>
          </div>
        </div>

        {/* Hanging rope visuals (decoration) */}
        <div className="absolute -top-16 left-10 w-1 h-20 bg-amber-900/40 transform rotate-12 -z-10"></div>
        <div className="absolute -top-16 right-10 w-1 h-20 bg-amber-900/40 transform -rotate-12 -z-10"></div>

      </div>
    </div>
  );
};

export default TeacherBoard;