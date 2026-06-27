export interface SentenceChunk {
  text: string;
  meaning: string;
}

export interface Example {
  text: string;
  translation?: string;
  chunks?: SentenceChunk[];
  original?: string;
}

export interface Sentence {
  original: string;
  translation?: string;
  chunks?: SentenceChunk[];
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  type?: 'simple' | 'vocabulary';
  examples?: Example[];
  sentences?: Sentence[];
  isStarred?: boolean;
  mastery?: 'learning' | 'mastered' | 'unseen';
  languageCode?: string;
}

export type AppState = 'import' | 'study' | 'quiz';

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
