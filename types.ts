
export enum DogState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
  HAPPY = 'HAPPY',
  ANGRY = 'ANGRY' // New state for when user is annoying
}

export interface WebSource {
  uri: string;
  title: string;
}

export interface TranscriptionEntry {
  text: string;
  sender: 'user' | 'dog';
  timestamp: number;
  webSources?: WebSource[];
}

export type BoardVisualType = 'bullet_list' | 'step_by_step' | 'comparison' | 'code_snippet' | 'summary_card' | 'bar_chart';

export interface BoardItem {
  heading?: string;
  detail: string;
}

export interface BoardContent {
  title: string;
  visualType: BoardVisualType;
  items: BoardItem[];
  isVisible: boolean;
}
