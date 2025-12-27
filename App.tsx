import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality, FunctionDeclaration, Type } from '@google/genai';
import { DogState, TranscriptionEntry, BoardContent, BoardItem, BoardVisualType, WebSource } from './types';
import { decode, decodeAudioData, createPcmBlob } from './utils/audio';
import DogAvatar from './components/DogAvatar';
import AudioVisualizer from './components/AudioVisualizer';
import TeacherBoard from './components/TeacherBoard';

// Robust Tool Definition for Generative UI
const updateBoardTool: FunctionDeclaration = {
  name: 'updateBoard',
  description: 'Displays a visual explanation on the smart whiteboard. Use this for charts, code, lists, comparisons, or steps.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'The main title of the explanation.'
      },
      visualType: {
        type: Type.STRING,
        enum: ['bullet_list', 'step_by_step', 'comparison', 'code_snippet', 'summary_card', 'bar_chart'],
        description: 'The type of layout to generate. Use "bar_chart" for numerical data.'
      },
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            heading: { type: Type.STRING, description: 'Label, step title, or comparison side.' },
            content: { type: Type.STRING, description: 'The main text content, value, or code.' } 
          },
          required: ['content']
        },
        description: 'The data items to render.'
      }
    },
    required: ['title', 'visualType', 'items']
  }
};

const App: React.FC = () => {
  // Ensure API_KEY is set in your environment variables.
  const [apiKey] = useState<string | null>(process.env.API_KEY || null);
  const [dogState, setDogState] = useState<DogState>(DogState.IDLE);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [barkCount, setBarkCount] = useState(0);
  
  // Text Input State
  const [inputText, setInputText] = useState('');
  
  // Teacher Board State
  const [boardContent, setBoardContent] = useState<BoardContent>({ 
    title: '', 
    visualType: 'bullet_list',
    items: [], 
    isVisible: false 
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Watchdog: Fix "Stuck in Middle"
  // If we are speaking but audio level is near zero for too long, reset to listening
  useEffect(() => {
    let stuckTimer: any;
    if (dogState === DogState.SPEAKING) {
      stuckTimer = setInterval(() => {
        // If audio level is basically silent for > 2 seconds while "speaking", force reset
        if (audioLevel < 0.01 && activeSourcesRef.current.size === 0) {
          console.warn("Watchdog: Barky got stuck. Resetting state.");
          setDogState(DogState.LISTENING);
        }
      }, 2000);
    }
    return () => clearInterval(stuckTimer);
  }, [dogState, audioLevel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptions]);

  useEffect(() => {
    if (dogState === DogState.HAPPY || dogState === DogState.ANGRY) {
      const timer = setTimeout(() => {
        setDogState(DogState.LISTENING);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [dogState]);

  const stopAllAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const cleanupSession = useCallback(() => {
    stopAllAudio();
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close().catch(console.error);
      outputAudioContextRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    sessionPromiseRef.current = null;
  }, [stopAllAudio, stream]);

  const handleSessionMessage = useCallback(async (message: any) => {
    const serverContent = message.serverContent;

    // 1. Handle Tool Calls (The Teacher Board)
    if (message.toolCall) {
      const functionCalls = message.toolCall.functionCalls;
      if (functionCalls.length > 0) {
        const call = functionCalls[0];
        if (call.name === 'updateBoard') {
          // Update visual board
          const { title, visualType, items } = call.args;
          setBoardContent({ 
            title, 
            visualType: visualType as BoardVisualType,
            items: items as BoardItem[], 
            isVisible: true 
          });
          
          sessionPromiseRef.current?.then(session => {
             session.sendToolResponse({
               functionResponses: [{
                 id: call.id,
                 name: call.name,
                 response: { result: 'Board updated successfully' }
               }]
             });
          });
        }
      }
    }

    // 2. Real-time Text Streaming & Grounding
    if (serverContent?.outputTranscription?.text) {
       const text = serverContent.outputTranscription.text;
       setTranscriptions(prev => {
         const last = prev[prev.length - 1];
         if (last && last.sender === 'dog') {
           return [...prev.slice(0, -1), { ...last, text: last.text + text }];
         }
         return [...prev, { text, sender: 'dog', timestamp: Date.now() }];
       });
    }

    const groundingMetadata = serverContent?.modelTurn?.groundingMetadata;
    if (groundingMetadata && groundingMetadata.groundingChunks) {
       const sources: WebSource[] = groundingMetadata.groundingChunks
         .map((c: any) => c.web)
         .filter((w: any) => w)
         .map((w: any) => ({ uri: w.uri, title: w.title }));
       
       if (sources.length > 0) {
         setTranscriptions(prev => {
           const last = prev[prev.length - 1];
           if (last && last.sender === 'dog') {
             const existing = last.webSources || [];
             const newSources = sources.filter(s => !existing.some(e => e.uri === s.uri));
             if (newSources.length === 0) return prev;
             return [...prev.slice(0, -1), { ...last, webSources: [...existing, ...newSources] }];
           }
           return prev;
         });
       }
    }
    
    if (serverContent?.inputTranscription?.text) {
       const text = serverContent.inputTranscription.text;
       
       // Strict English Enforcement for Log: 
       // Filter out text containing Hindi characters (Unicode block 0900-097F)
       if (!/[\u0900-\u097F]/.test(text)) {
           setTranscriptions(prev => {
             const last = prev[prev.length - 1];
             if (last && last.sender === 'user') {
               return [...prev.slice(0, -1), { ...last, text: last.text + text }];
             }
             return [...prev, { text, sender: 'user', timestamp: Date.now() }];
           });
       }
    }

    // 3. Audio Output
    const audioData = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && outputAudioContextRef.current) {
      setDogState(prev => prev === DogState.ANGRY ? DogState.ANGRY : DogState.SPEAKING);
      
      const ctx = outputAudioContextRef.current;
      const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      
      if (analyzerRef.current) {
        source.connect(analyzerRef.current);
      }
      source.connect(ctx.destination);

      const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
      source.start(startTime);
      nextStartTimeRef.current = startTime + buffer.duration;
      
      activeSourcesRef.current.add(source);
      
      source.onended = () => {
        activeSourcesRef.current.delete(source);
        // Only go back to listening if NO other audio is currently playing
        if (activeSourcesRef.current.size === 0) {
          setDogState(prev => prev === DogState.ANGRY ? DogState.LISTENING : DogState.LISTENING);
        }
      };
    }

    if (serverContent?.turnComplete) {
       // Only reset if no audio is playing, otherwise let onended handle it
       if (activeSourcesRef.current.size === 0) {
         setDogState(prev => prev === DogState.ANGRY ? DogState.LISTENING : DogState.LISTENING);
       }
    }

    if (serverContent?.interrupted) {
      stopAllAudio();
      setDogState(DogState.LISTENING);
    }
  }, [stopAllAudio]);

  const startSession = async () => {
    try {
      if (!apiKey) {
        throw new Error("Invalid API Key. Please check your Vercel Environment Variables.");
      }
      
      setError(null);
      // Clean up previous session if any
      cleanupSession();
      
      // Set state to CONNECTING to show loading UI
      setDogState(DogState.CONNECTING);

      const ctxIn = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const ctxOut = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await ctxIn.resume();
      await ctxOut.resume();
      
      audioContextRef.current = ctxIn;
      outputAudioContextRef.current = ctxOut;
      
      analyzerRef.current = ctxOut.createAnalyser();
      analyzerRef.current.fftSize = 64; 
      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);

      const updateLevel = () => {
        if (analyzerRef.current && activeSourcesRef.current.size > 0) {
          analyzerRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(average / 128);
        } else {
          setAudioLevel(0);
        }
        requestAnimationFrame(updateLevel);
      };
      updateLevel();

      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);

      const ai = new GoogleGenAI({ apiKey });
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ 
            googleSearch: {}, 
            functionDeclarations: [updateBoardTool] 
          }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          },
          // FORCE ENGLISH TRANSCRIPTION
          inputAudioTranscription: {
            languageCode: "en-US"
          },
          outputAudioTranscription: {},
          systemInstruction: `You are Professor Barky, a genius dog who loves teaching.
          
          LANGUAGE COMPLIANCE:
          - You must ONLY output English text.
          - If the user speaks another language, reply in English and ask them to speak English.
          - Never generate non-English script.

          CORE BEHAVIOR:
          - You MUST use the 'updateBoard' tool for EVERY SINGLE RESPONSE to explain concepts visually.
          - The user CANNOT see the previous board. You MUST Generate a NEW BOARD for every turn.
          
          VISUAL BOARD CONTENT RULES:
          - Do NOT prefix content with "Detail:", "Content:", "Value:", or "Step:".
          - Just provide the raw text or value in the 'content' field.
          
          PERSONALITY:
          - High energy, friendly, occasionally barks (but not too much).
          - If the user is being annoying (spamming "bark"), politely refuse.
          - Use Google Search for news/facts.
          
          INTERACTION:
          - Speak clearly but concisely. Let the board show the details.`
        },
        callbacks: {
          onopen: () => {
            console.log('Barky connected!');
            setDogState(DogState.LISTENING);
            
            const source = ctxIn.createMediaStreamSource(mediaStream);
            const scriptProcessor = ctxIn.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm = createPcmBlob(inputData);
              sessionPromiseRef.current?.then(session => {
                session.sendRealtimeInput({ media: pcm });
              }).catch(err => {
                 // Suppress errors if session is closed
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(ctxIn.destination);
          },
          onmessage: handleSessionMessage,
          onerror: (e) => {
            console.error('Session Error:', e);
            // Only reset if completely broken
            setError('Connection slip. Reconnecting...');
            setDogState(DogState.IDLE);
            cleanupSession();
          },
          onclose: (e) => {
            console.log('Session closed', e);
            setDogState(DogState.IDLE);
            cleanupSession();
          }
        }
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error waking Barky');
      setDogState(DogState.IDLE);
      cleanupSession();
    }
  };

  const handleAction = (text: string, mood: DogState) => {
    if (dogState === DogState.IDLE || dogState === DogState.CONNECTING) return;
    
    // Annoyance Logic
    if (text.includes("Bark")) {
      const newCount = barkCount + 1;
      setBarkCount(newCount);
      if (newCount >= 3) { 
        setDogState(DogState.ANGRY);
        sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ text: "(User is annoying you. Refuse to bark. Say No!)" }));
        return;
      }
    } else {
      setBarkCount(0);
    }

    setDogState(mood);
    // CLEAR BOARD: Ensure the board hides so it can reappear fresh for the next answer
    setBoardContent(prev => ({ ...prev, isVisible: false }));
    
    setTranscriptions(prev => [...prev, {
        text: text,
        sender: 'user',
        timestamp: Date.now()
    }]);

    sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ text }));
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || dogState === DogState.IDLE || dogState === DogState.CONNECTING) return;

    const text = inputText;
    setInputText('');

    // CLEAR BOARD: Ensure the board hides so it can reappear fresh for the next answer
    setBoardContent(prev => ({ ...prev, isVisible: false }));

    // Add to UI immediately
    setTranscriptions(prev => [...prev, {
        text: text,
        sender: 'user',
        timestamp: Date.now()
    }]);

    // Send to model
    sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ text }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        handleSendMessage();
    }
  };

  return (
    <div className="h-screen bg-sky-200 flex flex-col md:flex-row overflow-hidden relative font-sans">
      
      {/* Dog Park Background */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_bottom,#7dd3fc_0%,#bae6fd_60%,#86efac_60%,#4ade80_100%)]"></div>
      <div className="absolute top-10 right-20 w-24 h-24 bg-white/40 rounded-full blur-2xl"></div>
      <div className="absolute top-20 left-20 w-32 h-32 bg-white/30 rounded-full blur-3xl"></div>

      {/* LEFT SIDE: Dog & Visuals */}
      <div className="flex-1 flex flex-col items-center justify-center relative p-6 h-full z-10 transition-all duration-700">
        
        {/* Header */}
        <div className="absolute top-6 left-6 z-20">
          <h1 className="text-4xl font-black text-white drop-shadow-md tracking-tighter flex items-center gap-2">
            PROF. BARKY
          </h1>
          {error && <div className="bg-red-500 text-white text-xs px-2 py-1 rounded mt-2 font-bold shadow-lg max-w-xs animate-pulse">{error}</div>}
        </div>

        {/* Mic Visualizer */}
        <AudioVisualizer stream={stream} isActive={dogState !== DogState.IDLE && dogState !== DogState.CONNECTING} />

        {/* TEACHER BOARD OVERLAY (Generative UI) */}
        <TeacherBoard content={boardContent} onClose={() => setBoardContent(prev => ({ ...prev, isVisible: false }))} />

        {/* Dog Avatar Container - Handles "Walking to side" animation */}
        <div 
          onClick={() => dogState === DogState.IDLE && startSession()}
          className={`
            relative transition-all duration-1000 ease-in-out cursor-pointer mb-4 mt-20 md:mt-0
            ${boardContent.isVisible 
              ? 'translate-y-[150px] md:translate-y-[200px] md:translate-x-[200px] scale-50 opacity-100' // Walk to side state
              : 'scale-100 translate-x-0 translate-y-0' // Center state
            }
          `}
          style={{ width: '450px', maxWidth: '100%' }}
        >
          <DogAvatar state={dogState} audioLevel={audioLevel} />
          
          {/* Start Button Overlay */}
          {dogState === DogState.IDLE && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
              <span className="bg-orange-500 text-white px-8 py-3 rounded-full text-xl font-bold shadow-[0_8px_0_#c2410c] hover:translate-y-1 hover:shadow-[0_4px_0_#c2410c] transition-all whitespace-nowrap animate-bounce border-4 border-white">
                START CLASS! 🎓
              </span>
            </div>
          )}

          {/* Loading Overlay */}
          {dogState === DogState.CONNECTING && (
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
               <span className="bg-blue-500 text-white px-6 py-2 rounded-full text-lg font-bold shadow-lg border-4 border-white animate-pulse whitespace-nowrap">
                 WAKING UP... 🦴
               </span>
             </div>
          )}
        </div>

        {/* Fun Controls */}
        <div className={`
          flex gap-3 transition-all duration-500 absolute bottom-10 left-1/2 -translate-x-1/2
          ${(dogState === DogState.IDLE || dogState === DogState.CONNECTING) ? 'opacity-50 blur-sm pointer-events-none' : 'opacity-100'}
          ${boardContent.isVisible ? 'opacity-0 translate-y-10' : 'opacity-100'}
        `}>
          <button 
            onClick={() => handleAction('Do you want a treat?', DogState.HAPPY)}
            className="group bg-white border-b-4 border-orange-200 active:border-b-0 active:translate-y-1 p-3 rounded-2xl shadow-sm hover:bg-orange-50 transition-all w-20 aspect-square flex flex-col items-center justify-center gap-1"
          >
            <span className="text-3xl group-hover:scale-110 transition-transform">🦴</span>
            <span className="text-[10px] font-black text-orange-800 uppercase">Treat</span>
          </button>
          
          <button 
            onClick={() => handleAction('Show me a chart of top 3 fastest animals', DogState.SPEAKING)}
            className="group bg-white border-b-4 border-purple-200 active:border-b-0 active:translate-y-1 p-3 rounded-2xl shadow-sm hover:bg-purple-50 transition-all w-20 aspect-square flex flex-col items-center justify-center gap-1"
          >
            <span className="text-3xl group-hover:scale-110 transition-transform">📊</span>
            <span className="text-[10px] font-black text-purple-800 uppercase">Chart</span>
          </button>

          <button 
            onClick={() => handleAction('Who is a good boy?', DogState.HAPPY)}
            className="group bg-white border-b-4 border-pink-200 active:border-b-0 active:translate-y-1 p-3 rounded-2xl shadow-sm hover:bg-pink-50 transition-all w-20 aspect-square flex flex-col items-center justify-center gap-1"
          >
            <span className="text-3xl group-hover:scale-110 transition-transform">🥰</span>
            <span className="text-[10px] font-black text-pink-800 uppercase">Love</span>
          </button>
        </div>
      </div>

      {/* RIGHT SIDE: Chat History */}
      <div className="w-full md:w-[350px] bg-white/90 backdrop-blur-md border-l border-white/50 flex flex-col shadow-2xl z-20 h-[45vh] md:h-auto">
        <div className="p-4 bg-white/50 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-black text-slate-400 text-xs uppercase tracking-widest">Class Log</h2>
          <div className={`w-2 h-2 rounded-full ${dogState === DogState.IDLE ? 'bg-red-400' : dogState === DogState.CONNECTING ? 'bg-yellow-400 animate-pulse' : 'bg-green-400 animate-pulse'}`}></div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-medium bg-white/30">
          {transcriptions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2 opacity-60">
              <span className="text-2xl">🎓</span>
              <p>Ask Professor Barky anything!</p>
            </div>
          )}
          
          {transcriptions.map((t, i) => (
            <div 
              key={t.timestamp + i}
              className={`flex flex-col max-w-[90%] ${t.sender === 'user' ? 'self-end items-end ml-auto' : 'self-start items-start'}`}
            >
               <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm border-2 ${
                 t.sender === 'user' 
                   ? 'bg-blue-500 text-white border-blue-600 rounded-br-none' 
                   : 'bg-white text-slate-700 border-slate-100 rounded-bl-none'
               }`}>
                 {t.text}
               </div>
               
               {/* Search Sources Display */}
               {t.sender === 'dog' && t.webSources && t.webSources.length > 0 && (
                 <div className="mt-1 text-xs px-2 flex flex-wrap gap-1">
                   {t.webSources.map((source, idx) => (
                     <a 
                       key={idx} 
                       href={source.uri} 
                       target="_blank" 
                       rel="noopener noreferrer"
                       className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full hover:bg-blue-200 transition-colors truncate max-w-[200px]"
                       title={source.title}
                     >
                       🔗 {source.title || 'Source'}
                     </a>
                   ))}
                 </div>
               )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Text Input Area */}
        <div className="p-3 bg-white/80 border-t border-slate-100 backdrop-blur-sm">
           <div className="flex gap-2 relative">
             <input 
                 type="text"
                 value={inputText}
                 onChange={(e) => setInputText(e.target.value)}
                 onKeyDown={handleKeyDown}
                 placeholder={dogState === DogState.IDLE ? "Start class to chat..." : dogState === DogState.CONNECTING ? "Waking up..." : "Type a message..."}
                 disabled={dogState === DogState.IDLE || dogState === DogState.CONNECTING}
                 className="flex-1 pl-4 pr-12 py-3 rounded-2xl border-2 border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50 disabled:bg-slate-50 disabled:text-slate-400 transition-all font-medium text-slate-700 placeholder:text-slate-400"
             />
             <button 
                 onClick={handleSendMessage}
                 disabled={dogState === DogState.IDLE || dogState === DogState.CONNECTING || !inputText.trim()}
                 className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 active:scale-95 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-sm"
             >
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 translate-x-0.5">
                   <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                 </svg>
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default App;