
import React, { useEffect, useState } from 'react';
import { DogState } from '../types';

interface DogAvatarProps {
  state: DogState;
  audioLevel: number;
}

const DogAvatar: React.FC<DogAvatarProps> = ({ state, audioLevel }) => {
  const [eyePos, setEyePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      const x = (clientX - innerWidth / 2) / (innerWidth / 2);
      const y = (clientY - innerHeight / 2) / (innerHeight / 2);
      setEyePos({ x: x * 8, y: y * 8 });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const isSpeaking = state === DogState.SPEAKING;
  const isHappy = state === DogState.HAPPY;
  const isAngry = state === DogState.ANGRY;
  const isListening = state === DogState.LISTENING;
  
  // Mouth logic
  const mouthOpenness = isSpeaking ? Math.max(5, audioLevel * 30) : isHappy ? 20 : isAngry ? 2 : 10;
  
  // Animations
  const tailAnimation = isHappy || isListening ? 'animate-[tail-wag_0.2s_infinite]' : 'animate-[tail-wag_4s_infinite]';
  
  return (
    <div className="relative w-full max-w-md mx-auto aspect-square flex items-center justify-center transition-transform duration-300">
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full filter drop-shadow-xl">
        <defs>
          <style>
            {`
              @keyframes tail-wag {
                0%, 100% { transform: rotate(-8deg); }
                50% { transform: rotate(8deg); }
              }
              @keyframes pant {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(3px); }
              }
              @keyframes ear-twitch {
                0%, 100% { transform: rotate(0); }
                50% { transform: rotate(5deg); }
              }
            `}
          </style>
        </defs>

        {/* Tail */}
        <g className={tailAnimation} style={{ transformOrigin: '70px 140px' }}>
          <path d="M60 140 Q 20 130 15 100" stroke="#C2410C" strokeWidth="14" strokeLinecap="round" fill="none" />
          <path d="M60 140 Q 20 130 15 100" stroke="#FFF7ED" strokeWidth="6" strokeLinecap="round" fill="none" strokeDasharray="10 20"/>
        </g>

        {/* Body */}
        <ellipse cx="100" cy="155" rx="60" ry="45" fill="#C2410C" />
        <ellipse cx="100" cy="155" rx="30" ry="35" fill="#FFF7ED" opacity="0.8" /> {/* Belly */}

        {/* Head Container */}
        <g className={isAngry ? "" : "animate-[pant_3s_infinite_ease-in-out]"} style={{ transformOrigin: 'center' }}>
          
          {/* Ears */}
          <g className={isListening ? "animate-[ear-twitch_2s_infinite]" : ""}>
             <path d="M50 50 Q 20 10 40 90" fill="#9A3412" transform={isAngry ? 'rotate(-15 50 50)' : 'rotate(-5 50 50)'} />
             <path d="M150 50 Q 180 10 160 90" fill="#9A3412" transform={isAngry ? 'rotate(15 150 50)' : 'rotate(5 150 50)'} />
          </g>

          {/* Head Base */}
          <circle cx="100" cy="95" r="50" fill="#EA580C" />
          
          {/* Snout Area */}
          <ellipse cx="100" cy="110" rx="32" ry="24" fill="#FFF7ED" />

          {/* Eyes Container */}
          <g transform={`translate(${eyePos.x}, ${eyePos.y})`}>
             {/* Left Eye */}
             <ellipse cx="80" cy="85" rx={isAngry ? 8 : 10} ry={isAngry ? 6 : 12} fill="white" stroke="#9A3412" strokeWidth="1"/>
             <circle cx="80" cy={isAngry ? 85 : 88} r={4} fill="#1F2937" />
             
             {/* Right Eye */}
             <ellipse cx="120" cy="85" rx={isAngry ? 8 : 10} ry={isAngry ? 6 : 12} fill="white" stroke="#9A3412" strokeWidth="1"/>
             <circle cx="120" cy={isAngry ? 85 : 88} r={4} fill="#1F2937" />

             {/* Angry Brows */}
             {isAngry && (
               <>
                 <path d="M70 75 L 90 85" stroke="#7F1D1D" strokeWidth="3" strokeLinecap="round" />
                 <path d="M130 75 L 110 85" stroke="#7F1D1D" strokeWidth="3" strokeLinecap="round" />
               </>
             )}
          </g>

          {/* Nose */}
          <path d="M92 100 Q 100 108 108 100 Q 100 115 92 100 Z" fill="#1F2937" />

          {/* Mouth & Tongue */}
          <g transform={`translate(0, ${isSpeaking ? 0 : 0})`}>
            {/* Mouth */}
            <path
              d={`M85 118 Q 100 ${118 + mouthOpenness} 115 118`}
              stroke="#1F2937"
              strokeWidth="3"
              fill="#451a03"
              strokeLinecap="round"
            />
            
            {/* Tongue (Visible when happy, panting, or speaking) */}
            {(!isAngry && (mouthOpenness > 5 || isHappy || isListening)) && (
              <path 
                d={`M92 ${118 + (mouthOpenness/3)} Q 100 ${135 + mouthOpenness} 108 ${118 + (mouthOpenness/3)}`} 
                fill="#EF4444" 
                stroke="#991B1B"
                strokeWidth="1"
                className={isListening && !isSpeaking ? "animate-[pant_0.5s_infinite]" : ""}
              />
            )}
          </g>
        </g>

        {/* Collar */}
        <path d="M60 145 Q 100 175 140 145" stroke="#DC2626" strokeWidth="12" strokeLinecap="round" fill="none" />
        {/* Tag */}
        <circle cx="100" cy="160" r="8" fill="#FCD34D" stroke="#B45309" strokeWidth="1" />
      </svg>
    </div>
  );
};

export default DogAvatar;
