import React, { useState, useEffect, useRef, ChangeEvent, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Volume2, 
  Plus, 
  Trash2, 
  BookOpen, 
  Settings, 
  X,
  Play,
  Pause,
  Shuffle,
  Star,
  CheckCircle2,
  Circle,
  Folder,
  FileJson,
  ChevronDown,
  Wand2,
  Download,
  Loader2,
  LogIn,
  LogOut,
  Cloud,
  CloudOff,
  Save,
  History,
  LayoutList,
  CreditCard,
  Library,
  Share2,
  HelpCircle,
  Lock,
  PlayCircle,
  Square,
  ExternalLink,
  Sparkles,
  Languages,
  Type as TypeIcon,
  Layers
} from 'lucide-react';
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Flashcard, AppState, QuizQuestion } from './types';
import { 
  auth, 
  db, 
  googleProvider,
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from './firebase';
import { User } from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp,
  getDocFromServer,
  deleteDoc
} from 'firebase/firestore';

// Error Handling Spec for Firestore Operations
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


const languagesList = [
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
];

const normalizeLanguageCode = (lang: string): string => {
  if (!lang) return 'es';
  const clean = lang.trim().toLowerCase();
  
  // 1. Check if it's already a code in languagesList
  if (languagesList.some(l => l.code === clean)) {
    return clean;
  }
  
  // 2. Check if it's a language name (e.g. "spanish" -> "es")
  const nameToCode: Record<string, string> = {
    spanish: 'es',
    french: 'fr',
    italian: 'it',
    japanese: 'ja',
    korean: 'ko',
    portuguese: 'pt',
    chinese: 'zh',
    german: 'de'
  };
  if (nameToCode[clean]) {
    return nameToCode[clean];
  }
  
  // 3. Check for BCP-47 codes (e.g. "es-es", "es-us" -> "es", "zh-cn" -> "zh")
  const prefix = clean.split('-')[0];
  if (languagesList.some(l => l.code === prefix)) {
    return prefix;
  }
  
  return 'es'; // default fallback
};


interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}

// Remove global initialization
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [state, setState] = useState<AppState>('import');
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [importText, setImportText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showAdvancedDiagnostics, setShowAdvancedDiagnostics] = useState(false);
  const [showMagicModal, setShowMagicModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [magicTopic, setMagicTopic] = useState('');
  const [isGeneratingMagic, setIsGeneratingMagic] = useState(false);
  const [magicError, setMagicError] = useState<string | null>(null);
  const [showKeySetup, setShowKeySetup] = useState(false);
  
  // Firebase State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [viewMode, setViewMode] = useState<'flashcard' | 'list'>('flashcard');
  const [userDecks, setUserDecks] = useState<{ id: string, name: string, language?: string }[]>([]);
  const [currentDeckId, setCurrentDeckId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDecksModal, setShowDecksModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [deckLanguage, setDeckLanguage] = useState<string>('es');
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [isLoadingDecks, setIsLoadingDecks] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deckToDelete, setDeckToDelete] = useState<{ id: string, name: string } | null>(null);
  
  const [showHistory, setShowHistory] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
  const [isApiKeyInvalid, setIsApiKeyInvalid] = useState(false);
  const [dynamicApiKey, setDynamicApiKey] = useState<string | null>(localStorage.getItem('manual_gemini_api_key'));
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; debug?: string } | null>(null);
  
  // Library State
  const [libraryFiles, setLibraryFiles] = useState<any[]>([]);
  const filteredLibrary = React.useMemo(() => {
    if (!deckLanguage) return libraryFiles;
    const targetNode = libraryFiles.find(
      (node) => node.name.toLowerCase() === deckLanguage.toLowerCase()
    );
    return targetNode ? (targetNode.children || []) : [];
  }, [libraryFiles, deckLanguage]);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  
  // Quiz State
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  
  // Auto-play State
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayMode, setAutoPlayMode] = useState<'front-back' | 'back-front' | 'front-only' | 'back-only'>('front-back');
  const [autoPlayBreakDownMode, setAutoPlayBreakDownMode] = useState<'side' | 'item'>('side');
  const [autoPlayTimer, setAutoPlayTimer] = useState<any>(null);

  // Autoplay repeat, speed & loop settings
  const [turtleModeSpeed, setTurtleModeSpeed] = useState<number>(0.7);
  const [targetAudioRepeats, setTargetAudioRepeats] = useState<number>(2);
  const [targetAudioPlaySpeed, setTargetAudioPlaySpeed] = useState<'normal' | 'slow' | 'alternate'>('normal');
  const [autoPlayDelay, setAutoPlayDelay] = useState<number>(3);
  const [isLoopingDeck, setIsLoopingDeck] = useState<boolean>(true);
  const [showAutoPlaySettings, setShowAutoPlaySettings] = useState<boolean>(false);
  const [speechDiagnosticMsg, setSpeechDiagnosticMsg] = useState<string>('');

  // Chunking State
  const [chunkSize, setChunkSize] = useState<number>(0); // 0 means "All"
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);

  // Sentence Chunking State (Interactive Breakdown)
  const [activeSentence, setActiveSentence] = useState<{ sentence: string; chunks: { text: string; meaning: string }[]; cardId: string } | null>(null);
  const [currentBreakdownStep, setCurrentBreakdownStep] = useState<number>(1);
  const [isChunking, setIsChunking] = useState<string | null>(null);
  const [isWordMode, setIsWordMode] = useState<boolean>(false);
  const [showSentenceMeaning, setShowSentenceMeaning] = useState<boolean>(true);
  const [gradualSlowMode, setGradualSlowMode] = useState<boolean>(false);
  const [focusedChunkIndex, setFocusedChunkIndex] = useState<number | null>(null);

  const [fileList, setFileList] = useState<FileNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const speechAttemptsRef = useRef<{ [key: string]: number }>({});

  // Fetch file list when picker opens
  useEffect(() => {
    if (showFilePicker) {
      fetch('/api/files')
        .then(res => res.json())
        .then(setFileList)
        .catch(err => console.error('Failed to fetch files', err));
    }
  }, [showFilePicker]);

  // Fetch library files on mount
  useEffect(() => {
    const fetchLibrary = async () => {
      setIsLoadingLibrary(true);
      try {
        const response = await fetch('/api/files');
        const data = await response.json();
        setLibraryFiles(data);
      } catch (error) {
        console.error("Failed to fetch library:", error);
      } finally {
        setIsLoadingLibrary(false);
      }
    };
    fetchLibrary();
  }, []);

  // Auto-import when text is pasted
  useEffect(() => {
    if (importText.trim() && state === 'import') {
      handleImport();
      setNewDeckName("Pasted Deck");
      setImportText('');
    }
  }, [importText, state]);

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Show login modal automatically if not logged in
  useEffect(() => {
    if (isAuthReady && !user) {
      setShowAuthModal(true);
    }
  }, [isAuthReady, user]);

  // Test Firestore Connection
  useEffect(() => {
    async function testConnection() {
      try {
        console.log("Testing Firestore connection...");
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connection successful.");
      } catch (error) {
        // If we get a permission error, it actually means the connection is working
        // because the Firestore server responded to our request!
        if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('Missing or insufficient permissions'))) {
          console.log("Firestore connection confirmed (Server responded with permission check).");
          return;
        }
        
        console.error("Firestore connection test failed:", error);
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. This usually means the Firestore API is not enabled or the database does not exist.");
        }
      }
    }
    testConnection();
  }, []);

  // Load user decks when logged in
  useEffect(() => {
    if (user && isAuthReady) {
      const path = `users/${user.uid}/decks`;
      console.log("Setting up onSnapshot for path:", path);
      const q = query(collection(db, path), orderBy('updatedAt', 'desc'));
      setIsLoadingDecks(true);
      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("onSnapshot received data, count:", snapshot.size);
        const decks = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || "Untitled Deck",
          language: doc.data().language || ""
        }));
        setUserDecks(decks);
        setFirestoreError(null);
        setIsLoadingDecks(false);
      }, (error: any) => {
        console.error("Firestore List Error:", error);
        setFirestoreError(`Failed to load decks: ${error.message}`);
        setIsLoadingDecks(false);
      });
      return () => unsubscribe();
    } else {
      setUserDecks([]);
    }
  }, [user, isAuthReady]);

  // Load cards from localStorage on mount (only if not logged in or as fallback)
  useEffect(() => {
    if (!user) {
      const saved = localStorage.getItem('lingoflash_cards');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.length > 0) {
            setCards(parsed);
            setState('study');
          }
        } catch (e) {
          console.error('Failed to parse saved cards', e);
        }
      }
    }
  }, [user]);

  // Load deck language from localStorage on mount
  useEffect(() => {
    const savedLang = localStorage.getItem('lingoflash_language');
    if (savedLang) {
      setDeckLanguage(savedLang);
    }
  }, []);

  // Save cards to localStorage (only if not logged in)
  useEffect(() => {
    if (!user) {
      localStorage.setItem('lingoflash_cards', JSON.stringify(cards));
    }
  }, [cards, user]);

  // Save deck language to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('lingoflash_language', deckLanguage);
  }, [deckLanguage]);

  useEffect(() => {
    // Pre-fetch voices
    window.speechSynthesis.getVoices();
    
    const handleVoicesChanged = () => {
      window.speechSynthesis.getVoices();
    };
    
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
  }, []);

  const login = async () => {
    setShowAuthModal(true);
    setAuthMode('login');
    setAuthError(null);
    setAuthEmail('');
    setAuthPassword('');
    setAuthDisplayName('');
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
      setShowAuthModal(false);
    } catch (error: any) {
      console.error("Login failed", error);
      setAuthError(error.message || "Login failed. Please check your credentials.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      if (authDisplayName) {
        await updateProfile(userCredential.user, { displayName: authDisplayName });
      }
      setShowAuthModal(false);
    } catch (error: any) {
      console.error("Registration failed", error);
      setAuthError(error.message || "Registration failed. Please try again.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setShowAuthModal(false);
    } catch (error: any) {
      console.error("Google login failed", error);
      // Don't show error if user closed the popup
      if (error.code !== 'auth/popup-closed-by-user') {
        setAuthError(error.message || "Google login failed.");
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      // Reset all app state
      setCards([]);
      setQuizQuestions([]);
      setState('import');
      setCurrentDeckId(null);
      setShowDecksModal(false);
      setShowSaveModal(false);
      setShowMagicModal(false);
      setShowLibraryModal(false);
      setShowFilePicker(false);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const saveToFirestore = async (deckName: string, cardsToSave: Flashcard[], forceNew: boolean = false) => {
    if (!user) return;
    setIsSaving(true);
    const deckId = (forceNew || !currentDeckId) ? Math.random().toString(36).substr(2, 9) : currentDeckId;
    const path = `users/${user.uid}/decks/${deckId}`;
    
    // Recursive sanitization for Firestore
    const sanitize = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      } else if (obj !== null && typeof obj === 'object') {
        const result: any = {};
        Object.keys(obj).forEach(key => {
          if (obj[key] !== undefined) {
            result[key] = sanitize(obj[key]);
          }
        });
        return result;
      }
      return obj;
    };

    // Close the save modal immediately for optimistic updates and snappy UX
    setShowSaveModal(false);

    try {
      console.log("Saving to Firestore at path:", path, "forceNew:", forceNew);
      const sanitizedCards = sanitize(cardsToSave);
      const sanitizedQuiz = sanitize(quizQuestions);

      await setDoc(doc(db, path), {
        id: deckId,
        name: deckName || "My Deck",
        cards: sanitizedCards,
        quizQuestions: sanitizedQuiz,
        language: deckLanguage || "es",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      }, { merge: true });
      
      console.log("Save successful!");
      setCurrentDeckId(deckId);
      setFirestoreError(null);
    } catch (error: any) {
      console.error("Firestore Save Error:", error);
      setFirestoreError(`Save failed: ${error.message}`);
      // Re-open modal to display error if saving failed in the background
      setShowSaveModal(true);
    } finally {
      setIsSaving(false);
    }
  };

  const loadDeckFromFirestore = async (deckId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/decks/${deckId}`;
    try {
      const snapshot = await getDocFromServer(doc(db, path));
      if (snapshot.exists()) {
        const data = snapshot.data();
        setCards(data.cards || []);
        if (data.quizQuestions) {
          setQuizQuestions(data.quizQuestions);
        } else {
          setQuizQuestions([]);
        }
        
        // Update deck language from loaded deck, fallback to detecting from cards
        if (data.language) {
          setDeckLanguage(normalizeLanguageCode(data.language));
        } else if (data.cards && data.cards.length > 0) {
          const firstCard = data.cards[0];
          const textToDetect = firstCard.front || "";
          if (textToDetect) {
            const detected = detectLanguage(textToDetect);
            const bcpToFolder: Record<string, string> = {
              'es-ES': 'es', 'zh-CN': 'zh', 'ja-JP': 'ja', 'ko-KR': 'ko',
              'fr-FR': 'fr', 'de-DE': 'de', 'it-IT': 'it', 'pt-PT': 'pt'
            };
            const matchedFolder = bcpToFolder[detected];
            if (matchedFolder) {
              setDeckLanguage(matchedFolder);
            } else {
              setDeckLanguage('es');
            }
          }
        }

        setCurrentDeckId(deckId);
        setState('study');
        setCurrentIndex(0);
        setIsFlipped(false);
        setShowDecksModal(false);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  };

  const deleteDeckFromFirestore = async (deckId: string, deckName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    setDeckToDelete({ id: deckId, name: deckName });
    setShowDeleteConfirm(true);
  };

  const confirmDeleteDeck = async () => {
    if (!user || !deckToDelete) return;
    
    const path = `users/${user.uid}/decks/${deckToDelete.id}`;
    try {
      await deleteDoc(doc(db, path));
      if (currentDeckId === deckToDelete.id) {
        setCurrentDeckId(null);
      }
      setFirestoreError(null);
      setShowDeleteConfirm(false);
      setDeckToDelete(null);
    } catch (error: any) {
      console.error("Firestore Delete Error:", error);
      setFirestoreError(`Delete failed: ${error.message}`);
    }
  };

  const loadFromLibrary = async (filePath: string) => {
    try {
      const response = await fetch(`/api/data/${filePath}`);
      const data = await response.json();
      handleImport(data);
      const fileName = filePath.split('/').pop()?.replace('.json', '') || "Library Deck";
      setNewDeckName(fileName.replace(/-/g, ' ').replace(/^\d+-/, '')); // Clean up filename
      setShowLibraryModal(false);
      setState('study');
    } catch (error) {
      console.error("Failed to load library file:", error);
      alert("Failed to load the selected file.");
    }
  };

  useEffect(() => {
    const checkAiStatus = async () => {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        const serverKey = data.geminiApiKey;
        
        // Only use server key if it's valid and we don't have a manual one,
        // or if the server key is actually a real key (not empty/None)
        const isServerKeyValid = serverKey && serverKey !== 'undefined' && serverKey !== 'null' && serverKey.trim() !== '';
        const manualKey = localStorage.getItem('manual_gemini_api_key');
        
        if (isServerKeyValid) {
          setDynamicApiKey(serverKey);
          setIsApiKeyMissing(false);
        } else if (manualKey) {
          setDynamicApiKey(manualKey);
          setIsApiKeyMissing(false);
        } else {
          setIsApiKeyMissing(true);
        }
      } catch (error) {
        console.error("Failed to fetch config:", error);
        const manualKey = localStorage.getItem('manual_gemini_api_key');
        const bakedKey = process.env.GEMINI_API_KEY;
        const key = manualKey || bakedKey;
        const isMissing = !key || key === 'undefined' || key === 'null' || key.trim() === '';
        setIsApiKeyMissing(isMissing);
      }
    };
    checkAiStatus();
  }, []);

  const getAiInstance = async () => {
    // 1. Check for the "Baked" key from AI Studio Secrets (process.env)
    // This is the most secure and preferred way for shared apps.
    let bakedKey = '';
    try {
      // @ts-ignore
      bakedKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '';
    } catch (e) {}

    // 2. Check for a manually entered key in LocalStorage (Override)
    const manualKey = dynamicApiKey || localStorage.getItem('manual_gemini_api_key') || '';

    const apiKey = (manualKey && manualKey.trim() !== '') ? manualKey : bakedKey;
    
    if (!apiKey || apiKey === 'undefined' || apiKey === 'null' || apiKey.trim() === '') {
      // 3. Last resort: Try to fetch from the server config endpoint
      try {
        const response = await fetch(`/api/config?t=${Date.now()}`);
        const data = await response.json();
        if (data.geminiApiKey) {
          setDynamicApiKey(data.geminiApiKey);
          return new GoogleGenAI({ apiKey: data.geminiApiKey });
        }
      } catch (e) {}
    }

    if (!apiKey || apiKey === 'undefined' || apiKey === 'null' || apiKey.trim() === '') {
      setIsApiKeyMissing(true);
      setShowSettingsModal(true); // Auto-open settings if completely missing
      throw new Error("AI Configuration Required: Please provide a Gemini API key in the Settings menu.");
    }

    setIsApiKeyMissing(false);
    return new GoogleGenAI({ apiKey });
  };

  const callGeminiWithRetry = async (ai: any, params: any, retries = 3, delay = 2000): Promise<any> => {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      const isRetryable = error?.status === 503 || 
                          error?.status === 429 ||
                          error?.message?.includes("503") || 
                          error?.message?.includes("429") ||
                          error?.message?.includes("high demand") ||
                          error?.message?.includes("Resource has been exhausted");
                          
      if (isRetryable && retries > 0) {
        console.warn(`Gemini busy/rate-limited, retrying in ${delay}ms... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return callGeminiWithRetry(ai, params, retries - 1, delay * 2);
      }
      throw error;
    }
  };

  const testAiConnection = async () => {
    setIsTestingConnection(true);
    setTestResult(null);
    try {
      const ai = await getAiInstance();
      const apiKey = dynamicApiKey || process.env.GEMINI_API_KEY || '';
      const keyPrefix = apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'None';
      
      const response = await callGeminiWithRetry(ai, {
        model: "gemini-3-flash-preview",
        contents: "Say 'OK'",
      });
      
      if (response.text) {
        setTestResult({ 
          success: true, 
          message: "Connection Successful!",
          debug: `Key: ${keyPrefix} | Model: gemini-flash`
        });
        setIsApiKeyInvalid(false);
      }
    } catch (error: any) {
      console.error("Connection test failed:", error);
      const apiKey = dynamicApiKey || process.env.GEMINI_API_KEY || '';
      const keyPrefix = apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'None';
      const isInvalid = error?.message?.includes("API key not valid") || error?.message?.includes("400");
      setIsApiKeyInvalid(isInvalid);
      setTestResult({ 
        success: false, 
        message: isInvalid 
          ? "API Key Invalid: The key was rejected by Google." 
          : `Error: ${error.message || "Unknown error"}`,
        debug: `Key: ${keyPrefix} | Error Code: ${error?.status || 'Unknown'}`
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const generateQuiz = async (forceNew: boolean = false) => {
    setState('quiz');
    if (cards.length < 4) {
      setQuizError("You need at least 4 cards to generate a quiz.");
      return;
    }

    // Reuse existing questions if available and not forcing new
    if (!forceNew && quizQuestions.length > 0) {
      setQuizCompleted(false);
      setQuizScore(0);
      setCurrentQuizIndex(0);
      setSelectedOption(null);
      setShowFeedback(false);
      setState('quiz');
      return;
    }

    setIsGeneratingQuiz(true);
    setQuizError(null);
    setQuizCompleted(false);
    setQuizScore(0);
    setCurrentQuizIndex(0);
    setSelectedOption(null);
    setShowFeedback(false);
    setState('quiz');
    setQuizQuestions([]); // Clear old questions while generating new ones

    try {
      const ai = await getAiInstance();
      const response = await callGeminiWithRetry(ai, {
        model: "gemini-3-flash-preview",
        contents: `Generate a 5-question multiple choice quiz based on these flashcards: ${JSON.stringify(cards)}. 
        Make the questions challenging and include context-based usage questions. 
        Return the result as a JSON array of objects.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                question: { type: Type.STRING },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "Exactly 4 options"
                },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING }
              },
              required: ["id", "question", "options", "correctIndex", "explanation"]
            }
          }
        }
      });

      const questions = JSON.parse(response.text);
      setQuizQuestions(questions);
    } catch (error: any) {
      console.error("Failed to generate quiz:", error);
      setQuizError(`Failed to generate quiz: ${error.message || "Unknown error"}`);
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleAnswer = (index: number) => {
    if (showFeedback) return;
    setSelectedOption(index);
    setShowFeedback(true);
    if (index === quizQuestions[currentQuizIndex].correctIndex) {
      setQuizScore(prev => prev + 1);
    }
  };

  const nextQuizQuestion = () => {
    if (currentQuizIndex < quizQuestions.length - 1) {
      setCurrentQuizIndex(prev => prev + 1);
      setSelectedOption(null);
      setShowFeedback(false);
    } else {
      setQuizCompleted(true);
    }
  };

  const resetQuiz = () => {
    setState('study');
    setQuizQuestions([]);
    setCurrentQuizIndex(0);
    setQuizScore(0);
    setQuizCompleted(false);
  };

  const copyShareLink = () => {
    let shareUrl = window.location.href;
    
    // If we're in the dev environment, force the public preview URL
    if (shareUrl.includes('localhost') || shareUrl.includes('ais-dev')) {
      shareUrl = "https://ais-pre-4hsdgbmcm4borq4x37fze3-213894404377.us-east1.run.app";
    }

    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const generateMagicCards = async () => {
    if (!magicTopic.trim()) return;
    setIsGeneratingMagic(true);
    setMagicError(null);
    try {
      const ai = await getAiInstance();
      const response = await callGeminiWithRetry(ai, {
        model: "gemini-3-flash-preview",
        contents: `Generate 10 beginner-level ${getDeckLanguageLabel()} flashcards about the topic: "${magicTopic}". 
        If the topic is a list of items, pick the 10 most essential ones.
        
        For each card, provide:
        - front: The ${getDeckLanguageLabel()} word or phrase.
        - back: The English translation.
        - uso: An array of 2 natural ${getDeckLanguageLabel()} example sentences.
        - usage: An array of the English translations for those examples.
        
        Return the result as a JSON array of objects.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING },
                back: { type: Type.STRING },
                uso: { type: Type.ARRAY, items: { type: Type.STRING } },
                usage: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["front", "back", "uso", "usage"]
            }
          }
        }
      });

      const generatedData = JSON.parse(response.text);
      handleImport(generatedData);
      setNewDeckName(magicTopic); // Set default name for saving
      setShowMagicModal(false);
      setMagicTopic('');
    } catch (error: any) {
      console.error("Magic generation failed:", error);
      
      const errorMsg = error?.message || "Unknown error";
      setMagicError(`Magic generation failed: ${errorMsg}. Please ensure an API key is selected in the AI Studio Settings menu (gear icon at the top right).`);
    } finally {
      setIsGeneratingMagic(false);
    }
  };

  const downloadDeck = () => {
    if (cards.length === 0) return;
    
    // Format cards back to the importable JSON structure
    const exportData = cards.map(card => {
      if (card.type === 'simple') {
        return { front: card.front, back: card.back };
      } else {
        return {
          [card.front]: card.back,
          uso: card.examples?.map(ex => ex.text) || [],
          usage: card.examples?.map(ex => ex.translation) || []
        };
      }
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lingoflash-deck-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        handleImport(parsed);
        setNewDeckName(file.name.replace('.json', ''));
      } catch (err) {
        console.error("Failed to parse uploaded file:", err);
        alert("Invalid JSON file. Please make sure it's a valid LingoFlash deck.");
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  };

  const handleImport = (data?: any) => {
    try {
      const source = data || JSON.parse(importText);
      let parsedArray: any[] = [];
      let metadataTitle = "";

      if (source && typeof source === 'object' && !Array.isArray(source)) {
        if (Array.isArray(source.cards)) {
          parsedArray = source.cards;
          if (source.metadata) {
            if (source.metadata.title) {
              metadataTitle = source.metadata.title;
            }
            if (source.metadata.language) {
              setDeckLanguage(source.metadata.language.toLowerCase());
            }
          }
        } else {
          throw new Error('Input must be an array of objects or contain a cards array');
        }
      } else if (Array.isArray(source)) {
        parsedArray = source;
      } else {
        throw new Error('Input must be an array of objects or contain a cards array');
      }

      // Auto-detect language if not explicitly set from metadata
      if (!(source && typeof source === 'object' && !Array.isArray(source) && source.metadata && source.metadata.language)) {
        if (parsedArray && parsedArray.length > 0) {
          const firstCard = parsedArray[0];
          const textToDetect = firstCard.front || firstCard.text || Object.keys(firstCard).find(k => k !== 'uso' && k !== 'usage' && k !== 'sentences') || "";
          if (textToDetect) {
            const detected = detectLanguage(textToDetect);
            const bcpToFolder: Record<string, string> = {
              'es-ES': 'es', 'zh-CN': 'zh', 'ja-JP': 'ja', 'ko-KR': 'ko',
              'fr-FR': 'fr', 'de-DE': 'de', 'it-IT': 'it', 'pt-PT': 'pt'
            };
            const matchedFolder = bcpToFolder[detected];
            if (matchedFolder) {
              setDeckLanguage(matchedFolder);
            } else {
              setDeckLanguage('es'); // default
            }
          }
        }
      }

      setQuizQuestions([]); // Clear old quiz when loading new data
      setCurrentDeckId(null); // Reset deck ID for new imports/generations
      
      const newCards: Flashcard[] = parsedArray.map((item) => {
        if (!item || typeof item !== 'object') return null;
        const keys = Object.keys(item);
        
        // Handle standard front/back format (used by Magic Generate)
        if (item.front && item.back) {
          const rawUso = Array.isArray(item.uso) ? item.uso : [];
          const rawUsage = Array.isArray(item.usage) ? item.usage : [];
          
          const examples = rawUso.map((text: any, i: number) => {
            if (typeof text === 'string') {
              return { 
                text, 
                translation: typeof rawUsage[i] === 'string' ? rawUsage[i] : null
              };
            }
            return null;
          }).filter((ex): ex is { text: string; translation?: string } => ex !== null && !!ex.text);

          const rawSentences = Array.isArray(item.sentences) ? item.sentences : [];
          const sentences = rawSentences.map((s: any) => {
            if (typeof s === 'string') return { original: s, translation: "" };
            if (typeof s === 'object' && s !== null) {
              return {
                original: s.original || s.text || "",
                translation: s.translation || s.meaning || "",
                chunks: s.chunks
              };
            }
            return null;
          }).filter((s): s is any => s !== null);

          return {
            id: Math.random().toString(36).substr(2, 9),
            front: item.front,
            back: item.back,
            type: (sentences.length > 0 || examples.length > 0) ? 'vocabulary' : 'simple',
            examples: examples.length > 0 ? examples : undefined,
            sentences: sentences.length > 0 ? sentences : undefined,
            isStarred: !!item.isStarred,
            mastery: item.mastery || 'unseen'
          } as Flashcard;
        }

        // Library format / standard word format
        const textVal = item.text || item.front;
        const transVal = item.translation || item.back;

        if (textVal && transVal) {
          const rawSentences = Array.isArray(item.sentences) ? item.sentences : [];
          const sentences = rawSentences.map((s: any) => {
            if (typeof s === 'string') return { original: s, translation: "" };
            if (typeof s === 'object' && s !== null) {
              return {
                original: s.original || s.text || "",
                translation: s.translation || s.meaning || "",
                chunks: s.chunks
              };
            }
            return null;
          }).filter((s): s is any => s !== null);

          const rawUso = Array.isArray(item.uso) ? item.uso : [];
          const rawUsage = Array.isArray(item.usage) ? item.usage : [];
          const examples = rawUso.map((text: any, i: number) => {
            if (typeof text === 'string') {
              return { 
                text, 
                translation: typeof rawUsage[i] === 'string' ? rawUsage[i] : null
              };
            }
            return null;
          }).filter((ex): ex is { text: string; translation?: string } => ex !== null && !!ex.text);

          return {
            id: Math.random().toString(36).substr(2, 9),
            front: textVal,
            back: transVal,
            type: 'vocabulary',
            sentences: sentences.length > 0 ? sentences : undefined,
            examples: examples.length > 0 ? examples : undefined,
            isStarred: !!item.isStarred,
            mastery: item.mastery || 'unseen'
          } as Flashcard;
        }

        // Vocabulary format: { "SpanishWord": "EnglishDefinition", "uso": [...], "usage": [...] }
        const frontKey = keys.find(k => k !== 'uso' && k !== 'usage' && k !== 'front' && k !== 'back' && k !== 'text' && k !== 'translation' && k !== 'sentences' && k !== 'type' && k !== 'isStarred' && k !== 'mastery');
        if (!frontKey) return null;
        
        const rawUso = Array.isArray(item.uso) ? item.uso : [];
        const rawUsage = Array.isArray(item.usage) ? item.usage : [];
        
        const examples = rawUso.map((text: any, i: number) => {
          if (typeof text === 'string') {
            return { 
              text, 
              translation: typeof rawUsage[i] === 'string' ? rawUsage[i] : null
            };
          } else if (typeof text === 'object' && text !== null) {
            const esKey = Object.keys(text).find(k => k.toLowerCase() === 'es' || k.toLowerCase() === 'spanish' || k.toLowerCase() === 'original');
            const enKey = Object.keys(text).find(k => k.toLowerCase() === 'en' || k.toLowerCase() === 'english' || k.toLowerCase() === 'translation');
            
            return {
              text: esKey ? text[esKey] : (Object.values(text)[0] as string),
              translation: enKey ? text[enKey] : (Object.values(text)[1] as string)
            };
          }
          return null;
        }).filter((ex): ex is { text: string; translation?: string } => ex !== null && !!ex.text);

        return {
          id: Math.random().toString(36).substr(2, 9),
          front: frontKey,
          back: item[frontKey],
          type: 'vocabulary',
          examples: examples.length > 0 ? examples : undefined,
          isStarred: false,
          mastery: 'unseen'
        } as Flashcard;
      }).filter((c): c is Flashcard => c !== null);

      if (newCards.length > 0) {
        setCards(newCards);
        if (metadataTitle) {
          setNewDeckName(metadataTitle);
        }
        setState('study');
        setCurrentIndex(0);
        setIsFlipped(false);
        setShowFilePicker(false);

        // Auto-save to Firestore if logged in
        if (user) {
          if (!newDeckName) setNewDeckName(metadataTitle || "New Deck");
          setShowSaveModal(true);
        }
      } else {
        throw new Error('No valid cards found in the imported data.');
      }
    } catch (e: any) {
      setQuotaError(e.message || 'Invalid JSON format. Please check your input.');
      setTimeout(() => setQuotaError(null), 5000);
      console.error(e);
    }
  };

  const loadFile = async (filePath: string) => {
    try {
      const parts = filePath.split('/');
      if (parts.length > 0) {
        const folder = parts[0].toLowerCase();
        if (['es', 'fr', 'it', 'ja', 'ko', 'pt', 'zh', 'de'].includes(folder)) {
          setDeckLanguage(folder);
        }
      }
      const response = await fetch(`/api/data/${filePath}`);
      if (!response.ok) throw new Error('Failed to load file');
      const data = await response.json();
      handleImport(data);
    } catch (err) {
      console.error('Error loading file:', err);
      setQuotaError('Failed to load file. Please try again.');
      setTimeout(() => setQuotaError(null), 5000);
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const nextCard = () => {
    setIsFlipped(false);
    if (chunkedCards.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % chunkedCards.length);
  };

  const prevCard = () => {
    setIsFlipped(false);
    if (chunkedCards.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + chunkedCards.length) % chunkedCards.length);
  };

  const shuffleCards = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setCurrentIndex(0);
    setCurrentChunkIndex(0);
    setIsFlipped(false);
  };

  const toggleStar = (id: string) => {
    const newCards = cards.map(c => c.id === id ? { ...c, isStarred: !c.isStarred } : c);
    setCards(newCards);
    if (user && currentDeckId) {
      const deckName = userDecks.find(d => d.id === currentDeckId)?.name || "My Deck";
      saveToFirestore(deckName, newCards);
    }
  };

  const updateMastery = (id: string, mastery: 'learning' | 'mastered') => {
    const newCards = cards.map(c => c.id === id ? { ...c, mastery } : c);
    setCards(newCards);
    if (user && currentDeckId) {
      const deckName = userDecks.find(d => d.id === currentDeckId)?.name || "My Deck";
      saveToFirestore(deckName, newCards);
    }
    // Auto-advance on mastery
    if (mastery === 'mastered') {
      setTimeout(nextCard, 500);
    }
  };

  const filteredCards = React.useMemo(() => 
    showStarredOnly ? cards.filter(c => c.isStarred) : cards,
  [cards, showStarredOnly]);

  const chunkedCards = React.useMemo(() => {
    return filteredCards;
  }, [filteredCards]);

  const totalChunks = React.useMemo(() => {
    return 1;
  }, [filteredCards.length]);

  const currentCard = chunkedCards[currentIndex];

  const cardSentences = React.useMemo(() => {
    if (!currentCard) return [];
    if (currentCard.sentences && currentCard.sentences.length > 0) {
      return currentCard.sentences.map((s: any) => ({
        original: s.original || s.text || "",
        translation: s.translation || s.meaning || "",
        chunks: s.chunks
      }));
    }
    if (currentCard.examples && currentCard.examples.length > 0) {
      return currentCard.examples.map((ex: any) => ({
        original: ex.text || ex.original || "",
        translation: ex.translation || ex.meaning || "",
        chunks: ex.chunks
      }));
    }
    return [];
  }, [currentCard]);

  const getBCP47LanguageCode = (langCode: string): string => {
    const map: Record<string, string> = {
      es: 'es-ES',
      zh: 'zh-CN',
      ja: 'ja-JP',
      ko: 'ko-KR',
      fr: 'fr-FR',
      de: 'de-DE',
      it: 'it-IT',
      pt: 'pt-PT'
    };
    return map[langCode.toLowerCase()] || 'es-ES';
  };

  const detectLanguage = (text: string): string => {
    if (!text) return 'en-US';
    
    // 1. Chinese (Han characters)
    const hasChinese = /[\u4e00-\u9fa5]/.test(text);
    const hasJapaneseKana = /[\u3040-\u309f\u30a0-\u30ff]/.test(text);
    if (hasChinese && !hasJapaneseKana) {
      return 'zh-CN';
    }
    
    // 2. Japanese
    if (hasJapaneseKana) {
      return 'ja-JP';
    }
    
    // 3. Korean
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) {
      return 'ko-KR';
    }

    // Check for distinctive English words first to prevent false-positives for European languages
    const distinctiveEnglish = /\b(the|and|of|that|for|they|with|have|from|this|their|would|about|there|them|these|some|people|which|how|words|other|many|then|into|your)\b/i;
    if (distinctiveEnglish.test(text)) {
      return 'en-US';
    }
    
    // 4. Spanish
    const spanishChars = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
    if (spanishChars.test(text)) return 'es-ES';
    const commonSpanish = /\b(el|la|los|las|un|una|y|o|en|de|que|es|son|esta|este|con|por|para|mi|tu|su|nosotros|vosotros|ellos|ellas)\b/i;
    if (commonSpanish.test(text)) return 'es-ES';
    
    // 5. French
    const frenchChars = /[àâæçéèêëîïôœùûüÿÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ]/;
    const commonFrench = /\b(le|la|les|un|une|des|et|ou|en|dans|que|est|sont|ce|cette|ces|avec|pour|par|sur|mais|pas|plus)\b/i;
    if (frenchChars.test(text) || commonFrench.test(text)) {
      return 'fr-FR';
    }

    // 6. German
    const germanChars = /[äöüßÄÖÜ]/;
    const commonGerman = /\b(der|die|das|ein|eine|und|oder|in|zu|den|von|mit|dem|des|ist|sind|nicht|es|sie|er|wir|ihr)\b/i;
    if (germanChars.test(text) || commonGerman.test(text)) {
      return 'de-DE';
    }

    // 7. Italian
    const commonItalian = /\b(il|la|i|gli|le|un|una|e|o|in|di|da|che|è|sono|questo|questa|con|per|tra|fra|ma|non|più)\b/i;
    if (commonItalian.test(text)) {
      return 'it-IT';
    }

    // 8. Portuguese
    const portugueseChars = /[ãõÃÕçÇ]/;
    const commonPortuguese = /\b(o|a|os|as|um|uma|e|ou|em|de|que|é|são|este|esta|com|por|para|mas|não|mais)\b/i;
    if (portugueseChars.test(text) || commonPortuguese.test(text)) {
      return 'pt-PT';
    }

    return 'en-US';
  };

  const getCardLanguages = (card?: Flashcard) => {
    if (!card) return { frontLang: 'es-ES', backLang: 'en-US' };
    
    // Determine front language
    let frontLang = 'es-ES';
    if (deckLanguage) {
      frontLang = getBCP47LanguageCode(deckLanguage);
    } else {
      const detected = detectLanguage(card.front);
      frontLang = detected !== 'en-US' ? detected : 'es-ES';
    }

    // Determine back language - since LingoFlash is designed for learning foreign languages from English,
    // the back language is always English (en-US). We fallback to detected language only if
    // front is detected as English.
    let backLang = 'en-US';
    if (frontLang === 'en-US') {
      const detectedBack = detectLanguage(card.back);
      backLang = detectedBack !== 'en-US' ? detectedBack : 'es-ES';
    }

    return { frontLang, backLang };
  };

  const getDeckLanguageLabel = () => {
    const langMap: Record<string, string> = {
      es: "Spanish",
      fr: "French",
      it: "Italian",
      ja: "Japanese",
      ko: "Korean",
      pt: "Portuguese",
      zh: "Chinese",
      de: "German"
    };
    return langMap[deckLanguage.toLowerCase()] || "Spanish";
  };

  const getTranslateUrl = (text: string, sl: string, tl: string): string => {
    if (!text) return '';
    const slClean = sl.slice(0, 2).toLowerCase();
    const tlClean = tl.slice(0, 2).toLowerCase();
    const textEncoded = encodeURIComponent(text);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      return `https://translate.google.com/m?sl=${slClean}&tl=${tlClean}&q=${textEncoded}`;
    }
    return `https://translate.google.com/?sl=${slClean}&tl=${tlClean}&text=${textEncoded}&q=${textEncoded}&op=translate`;
  };

  const speak = async (text: string, lang: string = 'en-US', rate?: number): Promise<void> => {
    if (!text?.trim()) return Promise.resolve();
    
    const finalLang = (lang && lang.trim()) ? lang : 'en-US';
    
    return new Promise((resolve) => {
      // Stop any current audio
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch (e) {}
        currentSourceRef.current = null;
      }
      window.speechSynthesis.cancel();
      
      setIsSpeaking(true);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = finalLang;
      
      const voices = window.speechSynthesis.getVoices();
      
      // Helper to find best voice
      const findVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        
        // Try exact match first
        let voice = voices.find(v => v.lang.toLowerCase() === finalLang.toLowerCase());
        if (voice) return voice;

        // Try matching language part (e.g. 'zh' from 'zh-CN')
        const prefix = finalLang.split('-')[0].toLowerCase();
        
        // For specific languages, try preferred region first
        if (prefix === 'es') {
          voice = voices.find(v => v.lang === 'es-ES' || v.lang === 'es-MX') || 
                  voices.find(v => v.lang.toLowerCase().startsWith('es'));
          if (voice) return voice;
        } else if (prefix === 'zh') {
          voice = voices.find(v => v.lang === 'zh-CN' || v.lang === 'zh-HK' || v.lang === 'zh-TW') ||
                  voices.find(v => v.lang.toLowerCase().startsWith('zh'));
          if (voice) return voice;
        } else if (prefix === 'en') {
          voice = voices.find(v => v.lang === 'en-US' || v.lang === 'en-GB') ||
                  voices.find(v => v.lang.toLowerCase().startsWith('en'));
          if (voice) return voice;
        }

        // Generic prefix fallback
        voice = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
        if (voice) return voice;

        // Fallback to any voice if none matches
        return voices[0];
      };

      const voice = findVoice();
      if (voice) {
        utterance.voice = voice;
      }
      
      // Determine voice play speed
      let voiceSpeed = rate;
      if (voiceSpeed === undefined) {
        const attempts = (speechAttemptsRef.current[text] || 0) + 1;
        speechAttemptsRef.current[text] = attempts;
        
        if (attempts % 2 === 0) {
          // Even play count: play at turtle speed
          voiceSpeed = turtleModeSpeed;
        } else {
          // Odd play count: play at regular speed
          voiceSpeed = 0.95;
        }
      }
      
      utterance.rate = voiceSpeed;
      utterance.pitch = 1.0;

      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  const startSentenceChunking = async (sentence: string, cardId: string) => {
    if (isChunking) return;
    
    // Check if we already have chunks for this sentence on this card
    const card = cards.find(c => c.id === cardId);
    let matchedSentence = card?.sentences?.find(s => s.original === sentence);
    if (!matchedSentence && card?.examples) {
      matchedSentence = card.examples.find(ex => ex.text === sentence || ex.original === sentence);
    }
    
    if (matchedSentence && matchedSentence.chunks && matchedSentence.chunks.length > 0) {
      setActiveSentence({
        sentence,
        chunks: matchedSentence.chunks,
        cardId
      });
      setIsWordMode(false);
      setShowSentenceMeaning(true);
      setCurrentBreakdownStep(1);
      return;
    }
    
    setIsChunking(sentence);
    try {
      const ai = await getAiInstance();
      const response = await callGeminiWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: `Break this ${getDeckLanguageLabel()} sentence into natural breath groups (chunks). 
        Keep it simple, rhythmic, and logical for a language learner.
        
        Sentence: "${sentence}"`,
        config: {
          systemInstruction: "You are a linguistic assistant for LingoFlash. Break the sentence into 2-4 rhythmic chunks. Format the response as a JSON object with a 'chunks' array containing 'text' and 'meaning' (in English).",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              chunks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    meaning: { type: Type.STRING }
                  },
                  required: ["text", "meaning"]
                }
              }
            },
            required: ["chunks"]
          }
        }
      });
      
      const resData = JSON.parse(response.text);
      if (resData.chunks && Array.isArray(resData.chunks)) {
        // Update cards list
        const updatedCards = cards.map(c => {
          if (c.id === cardId) {
            if (c.sentences && c.sentences.length > 0) {
              return {
                ...c,
                sentences: c.sentences.map(s => (s.original === sentence || s.text === sentence) ? { ...s, chunks: resData.chunks } : s)
              };
            }
            if (c.examples && c.examples.length > 0) {
              return {
                ...c,
                examples: c.examples.map(ex => (ex.text === sentence || ex.original === sentence) ? { ...ex, chunks: resData.chunks } : ex)
              };
            }
          }
          return c;
        });
        
        setCards(updatedCards);
        
        // Save to Firebase Cloud Sync if logged in and a deck is active
        if (user && currentDeckId) {
          const deckName = userDecks.find(d => d.id === currentDeckId)?.name || newDeckName || "My Deck";
          saveToFirestore(deckName, updatedCards);
        }
        
        setActiveSentence({
          sentence,
          chunks: resData.chunks,
          cardId
        });
        setIsWordMode(false);
        setShowSentenceMeaning(true);
        setCurrentBreakdownStep(1);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err: any) {
      console.error("Chunking failed, falling back to word-by-word:", err);
      const fallbackChunks = sentence.trim().split(/\s+/).filter(Boolean).map(word => ({
        text: word,
        meaning: ""
      }));
      setActiveSentence({
        sentence,
        chunks: fallbackChunks,
        cardId
      });
      setIsWordMode(true);
      setShowSentenceMeaning(false);
      setCurrentBreakdownStep(1);
      setQuotaError("Offline fallback: word-by-word breakdown activated.");
      setTimeout(() => setQuotaError(null), 5000);
    } finally {
      setIsChunking(null);
    }
  };

  // Auto-play Logic
  const startAutoPlay = async () => {
    if (chunkedCards.length === 0) return;
    setIsAutoPlaying(true);
  };

  const stopAutoPlay = () => {
    setIsAutoPlaying(false);
    if (autoPlayTimer) {
      clearTimeout(autoPlayTimer);
      setAutoPlayTimer(null);
    }
    window.speechSynthesis.cancel();
  };

  const runSpeechDiagnostics = async () => {
    try {
      const voices = window.speechSynthesis.getVoices();
      const prefix = deckLanguage.toLowerCase();
      const deckVoice = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
      const englishVoice = voices.find(v => v.lang.toLowerCase().startsWith('en'));
      
      const details = `Voices found: ${voices.length}. ${getDeckLanguageLabel()}: ${deckVoice ? deckVoice.name : 'None'}. English: ${englishVoice ? englishVoice.name : 'None'}.`;
      setSpeechDiagnosticMsg(details);
      
      await speak("Speech engine diagnostic test: active.", "en-US");
    } catch (e: any) {
      setSpeechDiagnosticMsg(`Diagnostics failed: ${e.message}`);
    }
  };

  const resetSpeechEngine = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    stopAutoPlay();
    setSpeechDiagnosticMsg("Speech engine has been reset successfully. All queues cleared.");
  };

  useEffect(() => {
    let active = true;
    
    const runAutoPlay = async () => {
      if (!isAutoPlaying || !active) return;

      const card = chunkedCards[currentIndex];
      if (!card) return;

      const { frontLang, backLang } = getCardLanguages(card);

      const getRate = (rIndex: number) => {
        let currentRate = 0.95;
        if (targetAudioPlaySpeed === 'slow') {
          currentRate = turtleModeSpeed;
        } else if (targetAudioPlaySpeed === 'alternate') {
          currentRate = (rIndex % 2 === 0) ? 0.95 : turtleModeSpeed;
        }
        return currentRate;
      };

      const speakWithExamples = async (isFront: boolean, rIndex: number) => {
        if (!active || !isAutoPlaying) return;
        
        const text = isFront ? card.front : card.back;
        const lang = isFront ? frontLang : backLang;
        
        setIsFlipped(!isFront);
        
        const currentRate = getRate(rIndex);
        await speak(text, lang, currentRate);
        
        if (!active || !isAutoPlaying) return;
        
        // Read sentences
        if (card.sentences && card.sentences.length > 0) {
          for (const s of card.sentences) {
            if (!active || !isAutoPlaying) return;
            await new Promise(r => setTimeout(r, 800));
            if (!active || !isAutoPlaying) return;
            
            const sText = isFront ? (s.original || s.text || "") : (s.translation || s.meaning || s.original || s.text || "");
            const sLang = isFront ? frontLang : ((s.translation || s.meaning) ? backLang : detectLanguage(s.original || s.text || ""));
            if (sText) {
              await speak(sText, sLang, currentRate);
            }
          }
        }

        // Read examples
        if (card.examples && card.examples.length > 0) {
          for (const ex of card.examples) {
            if (!active || !isAutoPlaying) return;
            await new Promise(r => setTimeout(r, 800));
            if (!active || !isAutoPlaying) return;
            
            const exText = isFront ? (ex.text || ex.original || "") : (ex.translation || ex.meaning || ex.text || ex.original || "");
            const exLang = isFront ? frontLang : ((ex.translation || ex.meaning) ? backLang : detectLanguage(ex.text || ex.original || ""));
            if (exText) {
              await speak(exText, exLang, currentRate);
            }
          }
        }
      };

      const playItemGroup = async (
        frontText: string,
        frontLangParam: string,
        backText: string,
        backLangParam: string,
        hasFront: boolean,
        hasBack: boolean
      ) => {
        if (!active || !isAutoPlaying) return;

        if (autoPlayMode === 'front-back') {
          if (hasFront && frontText) {
            for (let r = 0; r < targetAudioRepeats; r++) {
              if (!active || !isAutoPlaying) return;
              setIsFlipped(false); // Front side
              await speak(frontText, frontLangParam, getRate(r));
              if (r < targetAudioRepeats - 1) {
                if (!active || !isAutoPlaying) return;
                await new Promise(r => setTimeout(r, 1500));
              }
            }
          }
          if (hasBack && backText) {
            if (!active || !isAutoPlaying) return;
            await new Promise(r => setTimeout(r, 1000));
            if (!active || !isAutoPlaying) return;
            setIsFlipped(true); // Back side
            await speak(backText, backLangParam, getRate(0));
          }
        } else if (autoPlayMode === 'back-front') {
          if (hasBack && backText) {
            setIsFlipped(true); // Back side
            await speak(backText, backLangParam, getRate(0));
          }
          if (hasFront && frontText) {
            if (!active || !isAutoPlaying) return;
            await new Promise(r => setTimeout(r, 1000));
            for (let r = 0; r < targetAudioRepeats; r++) {
              if (!active || !isAutoPlaying) return;
              setIsFlipped(false); // Front side
              await speak(frontText, frontLangParam, getRate(r));
              if (r < targetAudioRepeats - 1) {
                if (!active || !isAutoPlaying) return;
                await new Promise(r => setTimeout(r, 1500));
              }
            }
          }
        } else if (autoPlayMode === 'front-only') {
          if (hasFront && frontText) {
            for (let r = 0; r < targetAudioRepeats; r++) {
              if (!active || !isAutoPlaying) return;
              setIsFlipped(false); // Front side
              await speak(frontText, frontLangParam, getRate(r));
              if (r < targetAudioRepeats - 1) {
                if (!active || !isAutoPlaying) return;
                await new Promise(r => setTimeout(r, 1500));
              }
            }
          }
        } else if (autoPlayMode === 'back-only') {
          if (hasBack && backText) {
            setIsFlipped(true); // Back side
            await speak(backText, backLangParam, getRate(0));
          }
        }
      };

      try {
        if (autoPlayBreakDownMode === 'item') {
          // Word group
          await playItemGroup(
            card.front,
            frontLang,
            card.back,
            backLang,
            autoPlayMode !== 'back-only',
            autoPlayMode !== 'front-only'
          );

          // Sentence groups
          if (card.sentences && card.sentences.length > 0) {
            for (const s of card.sentences) {
              if (!active || !isAutoPlaying) return;
              await new Promise(r => setTimeout(r, 1000));
              if (!active || !isAutoPlaying) return;

              const sFrontText = s.original || s.text || "";
              const sFrontLang = frontLang;
              const sBackText = s.translation || s.meaning || s.original || s.text || "";
              const sBackLang = (s.translation || s.meaning) ? backLang : detectLanguage(s.original || s.text || "");

              await playItemGroup(
                sFrontText,
                sFrontLang,
                sBackText,
                sBackLang,
                autoPlayMode !== 'back-only',
                autoPlayMode !== 'front-only'
              );
            }
          }

          // Example groups
          if (card.examples && card.examples.length > 0) {
            for (const ex of card.examples) {
              if (!active || !isAutoPlaying) return;
              await new Promise(r => setTimeout(r, 1000));
              if (!active || !isAutoPlaying) return;

              const exFrontText = ex.text || ex.original || "";
              const exFrontLang = frontLang;
              const exBackText = ex.translation || ex.meaning || ex.text || ex.original || "";
              const exBackLang = (ex.translation || ex.meaning) ? backLang : detectLanguage(ex.text || ex.original || "");

              await playItemGroup(
                exFrontText,
                exFrontLang,
                exBackText,
                exBackLang,
                autoPlayMode !== 'back-only',
                autoPlayMode !== 'front-only'
              );
            }
          }
        } else {
          // autoPlayBreakDownMode === 'side'
          if (autoPlayMode === 'front-back') {
            // Speak Spanish (Front) repeated targetAudioRepeats times
            for (let r = 0; r < targetAudioRepeats; r++) {
              if (!active || !isAutoPlaying) return;
              await speakWithExamples(true, r);
              if (r < targetAudioRepeats - 1) {
                if (!active || !isAutoPlaying) return;
                await new Promise(r => setTimeout(r, 1500));
              }
            }
            // Then speak English (Back) once
            if (!active || !isAutoPlaying) return;
            await new Promise(r => setTimeout(r, 1000));
            if (!active || !isAutoPlaying) return;
            await speakWithExamples(false, 0);
          } else if (autoPlayMode === 'back-front') {
            // Speak English (Back) once
            await speakWithExamples(false, 0);
            if (!active || !isAutoPlaying) return;
            await new Promise(r => setTimeout(r, 1000));
            // Then speak Spanish (Front) repeated targetAudioRepeats times
            for (let r = 0; r < targetAudioRepeats; r++) {
              if (!active || !isAutoPlaying) return;
              await speakWithExamples(true, r);
              if (r < targetAudioRepeats - 1) {
                if (!active || !isAutoPlaying) return;
                await new Promise(r => setTimeout(r, 1500));
              }
            }
          } else if (autoPlayMode === 'front-only') {
            // Speak Spanish (Front) repeated targetAudioRepeats times
            for (let r = 0; r < targetAudioRepeats; r++) {
              if (!active || !isAutoPlaying) return;
              await speakWithExamples(true, r);
              if (r < targetAudioRepeats - 1) {
                if (!active || !isAutoPlaying) return;
                await new Promise(r => setTimeout(r, 1500));
              }
            }
          } else if (autoPlayMode === 'back-only') {
            // Speak English (Back) once
            await speakWithExamples(false, 0);
          }
        }

        if (!active || !isAutoPlaying) return;
        
        // Wait before next card (using customizable delay)
        const timer = setTimeout(() => {
          if (active && isAutoPlaying) {
            const isLastCard = currentIndex === chunkedCards.length - 1;
            if (isLastCard && !isLoopingDeck) {
              setIsAutoPlaying(false);
            } else {
              setCurrentIndex((prev) => (prev + 1) % chunkedCards.length);
            }
          }
        }, autoPlayDelay * 1000);
        setAutoPlayTimer(timer);
      } catch (e) {
        console.error("Auto-play error:", e);
        setIsAutoPlaying(false);
      }
    };

    if (isAutoPlaying) {
      runAutoPlay();
    }

    return () => {
      active = false;
      if (autoPlayTimer) clearTimeout(autoPlayTimer);
    };
  }, [isAutoPlaying, currentIndex, autoPlayMode, autoPlayBreakDownMode, chunkedCards.length, targetAudioRepeats, autoPlayDelay, isLoopingDeck, targetAudioPlaySpeed, turtleModeSpeed]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="max-w-4xl mx-auto px-6 py-8 flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <BookOpen className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">LingoFlash</h1>
          </div>
          
          <div className="sm:hidden flex items-center gap-2">
            {user ? (
              <button onClick={() => setShowLogoutConfirm(true)} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Logout">
                <LogOut className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={login} className="p-2 text-indigo-600 hover:text-indigo-700 transition-colors" title="Login">
                <LogIn className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2 bg-white/50 p-1 sm:p-1.5 rounded-full border border-slate-100 shadow-sm backdrop-blur-sm max-w-full overflow-x-auto scrollbar-hide flex-nowrap">
          {user && (
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <button 
                onClick={() => setShowDecksModal(true)}
                className="p-2 sm:p-2.5 hover:bg-white hover:shadow-sm rounded-full transition-all text-slate-500 hover:text-indigo-600"
                title="My Saved Decks"
              >
                <History className="w-5 h-5" />
              </button>
              <button 
                onClick={() => {
                  setNewDeckName(userDecks.find(d => d.id === currentDeckId)?.name || "My Deck");
                  setFirestoreError(null);
                  setShowSaveModal(true);
                }}
                disabled={cards.length === 0 || isSaving}
                className={`p-2 sm:p-2.5 rounded-full transition-all ${isSaving ? 'text-indigo-400' : 'text-slate-500 hover:text-indigo-600'}`}
                title="Add Deck to History"
              >
                <Save className={`w-5 h-5 ${isSaving ? 'animate-pulse' : ''}`} />
              </button>
            </div>
          )}
          
          <div className="w-px h-6 bg-slate-200 mx-0.5 sm:mx-1 flex-shrink-0" />

          {/* Language Selector Button */}
          <div className="flex-shrink-0">
            <button
              onClick={() => setShowLangDropdown(true)}
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 hover:bg-white hover:shadow-sm text-indigo-600 rounded-full text-xs font-bold transition-all flex-nowrap"
              title="Select Deck Language"
            >
              <span className="text-base leading-none">{languagesList.find(l => l.code === deckLanguage)?.flag || '🇪🇸'}</span>
              <span className="hidden sm:inline text-slate-600 font-bold leading-none">{languagesList.find(l => l.code === deckLanguage)?.name || 'Spanish'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          <div className="w-px h-6 bg-slate-200 mx-0.5 sm:mx-1 flex-shrink-0" />

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <button 
              onClick={() => setShowMagicModal(true)}
              className="p-2 sm:p-2.5 hover:bg-white hover:shadow-sm rounded-full transition-all text-indigo-600 hover:text-indigo-700"
              title="Magic Generate"
            >
              <Wand2 className="w-5 h-5" />
            </button>
            <button 
              onClick={downloadDeck}
              disabled={cards.length === 0}
              className="p-2 sm:p-2.5 hover:bg-white hover:shadow-sm rounded-full transition-all text-slate-500 hover:text-indigo-600 disabled:opacity-30"
              title="Download Deck as JSON"
            >
              <Download className="w-5 h-5" />
            </button>
            <button 
              onClick={() => generateQuiz(false)}
              disabled={isGeneratingQuiz || cards.length < 4}
              className={`p-2 sm:p-2.5 rounded-full transition-all flex items-center gap-2 px-3 sm:px-4 ${isGeneratingQuiz ? 'bg-indigo-50 text-indigo-400' : 'hover:bg-white text-slate-500 hover:text-indigo-600'}`}
              title={quizQuestions.length > 0 ? "Resume AI Quiz" : "Start AI Quiz"}
            >
              <BookOpen className={`w-5 h-5 ${isGeneratingQuiz ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-medium hidden sm:inline">{quizQuestions.length > 0 ? 'Resume Quiz' : 'Quiz'}</span>
            </button>
          </div>

          {state === 'study' && cards.length > 0 && (
            <button 
              onClick={() => setViewMode(viewMode === 'flashcard' ? 'list' : 'flashcard')}
              className={`p-2 sm:p-2.5 rounded-full transition-all flex-shrink-0 ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'hover:bg-white text-slate-500 hover:text-indigo-600'}`}
              title={viewMode === 'flashcard' ? "Switch to List View" : "Switch to Flashcard View"}
            >
              {viewMode === 'flashcard' ? <LayoutList className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
            </button>
          )}

          <button 
            onClick={copyShareLink}
            className={`p-2 sm:p-2.5 rounded-full transition-all flex items-center gap-2 px-3 ${copySuccess ? 'bg-green-50 text-green-600' : 'hover:bg-white text-slate-500 hover:text-indigo-600'}`}
            title="Copy Share Link"
          >
            <Share2 className="w-5 h-5" />
            {copySuccess && <span className="text-xs font-bold">Copied!</span>}
          </button>

          <button 
            onClick={() => setShowHelpModal(true)}
            className="p-2 sm:p-2.5 hover:bg-white hover:shadow-sm rounded-full transition-all text-slate-500 hover:text-indigo-600"
            title="Help & Installation"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          <button 
            onClick={() => setShowSettingsModal(true)}
            className={`p-2 sm:p-2.5 rounded-full transition-all ${isApiKeyMissing ? 'text-amber-500 hover:text-amber-600 animate-pulse' : 'text-slate-500 hover:text-indigo-600'}`}
            title="AI Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-slate-200 mx-0.5 sm:mx-1 flex-shrink-0" />

          <button 
            onClick={() => {
              if (state === 'import' && cards.length > 0) {
                setState('study');
              } else {
                setState('import');
              }
            }}
            className={`p-2 sm:p-2.5 rounded-full transition-all flex-shrink-0 ${state === 'import' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'hover:bg-white text-slate-500 hover:text-indigo-600'}`}
            title={state === 'import' && cards.length > 0 ? "Back to Study" : "Load or Create New Deck"}
          >
            {state === 'import' && cards.length > 0 ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          </button>

          <div className="w-px h-6 bg-slate-200 mx-0.5 sm:mx-1 flex-shrink-0" />

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <button 
              onClick={() => setShowStarredOnly(!showStarredOnly)}
              className={`p-2 sm:p-2.5 rounded-full transition-all ${showStarredOnly ? 'bg-amber-100 text-amber-600' : 'hover:bg-white text-slate-400'}`}
              title={showStarredOnly ? "Show All" : "Show Starred"}
            >
              <Star className={`w-5 h-5 ${showStarredOnly ? 'fill-current' : ''}`} />
            </button>
            <button 
              onClick={shuffleCards}
              className="p-2 sm:p-2.5 hover:bg-white hover:shadow-sm rounded-full transition-all text-slate-500 hover:text-indigo-600"
              title="Shuffle Deck"
            >
              <Shuffle className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowConfirmClear(true)}
              className="p-2 sm:p-2.5 hover:bg-red-50 rounded-full transition-all text-slate-400 hover:text-red-500"
              title="Clear Current Deck"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
          
          <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

          <div className="hidden sm:flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-3 pl-2 pr-1 py-1 bg-indigo-50 rounded-full border border-indigo-100">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider leading-none">Sync Active</span>
                  <span className="text-[10px] text-indigo-400 truncate max-w-[80px]">{user.displayName}</span>
                </div>
                <button onClick={() => setShowLogoutConfirm(true)} className="p-1.5 bg-white text-slate-400 hover:text-red-500 rounded-full shadow-sm transition-all">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={login}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
              >
                <LogIn className="w-4 h-4" />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pb-20">
        {state === 'import' ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto"
          >
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-4 mb-2">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
                  <BookOpen className="text-white w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Welcome to LingoFlash</h2>
              </div>
              <p className="text-slate-500 text-sm">How would you like to start your study session?</p>
              
              {cards.length > 0 && (
                <button 
                  onClick={() => setState('study')}
                  className="mt-6 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-sm font-bold transition-all flex items-center gap-2 mx-auto"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to Current Deck
                </button>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              {/* Magic Generate Option */}
              <button 
                onClick={() => setShowMagicModal(true)}
                className="group p-6 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-indigo-200 hover:shadow-indigo-100/50 transition-all text-left flex items-start gap-5"
              >
                <div className="w-12 h-12 flex-shrink-0 bg-indigo-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                  <Wand2 className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">Magic Generate</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">Let AI create a custom deck for you based on any topic or theme.</p>
                </div>
              </button>

              {/* Load from History Option */}
              {user ? (
                <button 
                  onClick={() => setShowDecksModal(true)}
                  className="group p-6 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-amber-200 hover:shadow-amber-100/50 transition-all text-left flex items-start gap-5"
                >
                  <div className="w-12 h-12 flex-shrink-0 bg-amber-50 rounded-xl flex items-center justify-center group-hover:bg-amber-500 transition-colors">
                    <History className="w-6 h-6 text-amber-600 group-hover:text-white transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-amber-600 transition-colors">Load from History</h3>
                    <p className="text-slate-500 text-xs leading-relaxed">Continue studying one of your previously saved cloud decks.</p>
                  </div>
                </button>
              ) : (
                <button 
                  onClick={login}
                  className="group p-6 bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all text-left flex items-start gap-5 relative overflow-hidden"
                >
                  <div className="absolute top-4 right-4">
                    <div className="px-2 py-0.5 bg-slate-100 rounded-full text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      Login
                    </div>
                  </div>
                  <div className="w-12 h-12 flex-shrink-0 bg-slate-100 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                    <History className="w-6 h-6 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-400 mb-1 group-hover:text-indigo-600 transition-colors">Load from History</h3>
                    <p className="text-slate-400 text-xs leading-relaxed">Login to access your saved decks and sync progress across devices.</p>
                  </div>
                </button>
              )}

              {/* Load from File Option */}
              <label className="group p-6 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-emerald-200 hover:shadow-emerald-100/50 transition-all text-left flex items-start gap-5 cursor-pointer">
                <div className="w-12 h-12 flex-shrink-0 bg-emerald-50 rounded-xl flex items-center justify-center group-hover:bg-emerald-500 transition-colors">
                  <Plus className="w-6 h-6 text-emerald-600 group-hover:text-white transition-colors" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-emerald-600 transition-colors">Load from File</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">Upload a .json deck file from your computer or device.</p>
                </div>
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              </label>

              {/* Load from Library Option */}
              <button 
                onClick={() => setShowLibraryModal(true)}
                className="group p-6 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-purple-200 hover:shadow-purple-100/50 transition-all text-left flex items-start gap-5"
              >
                <div className="w-12 h-12 flex-shrink-0 bg-purple-50 rounded-xl flex items-center justify-center group-hover:bg-purple-600 transition-colors">
                  <Library className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-purple-600 transition-colors">Load from Library</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">Browse pre-made decks from our curated library of materials.</p>
                </div>
              </button>

            </div>
          </motion.div>
        ) : state === 'quiz' ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100 min-h-[500px] flex flex-col"
          >
            {isGeneratingQuiz ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-slate-500 font-medium tracking-wide">AI Professor is preparing your quiz...</p>
              </div>
            ) : quizError ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
                  <X className="w-10 h-10 text-red-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Quiz Error</h2>
                  <p className="text-slate-500 mt-2 max-w-xs mx-auto">{quizError}</p>
                </div>
                <button 
                  onClick={resetQuiz}
                  className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
                >
                  Back to Study
                </button>
              </div>
            ) : quizCompleted ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Quiz Complete!</h2>
                  <p className="text-slate-500 mt-2">You scored <span className="font-bold text-indigo-600">{quizScore}</span> out of {quizQuestions.length}</p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => generateQuiz(true)}
                    className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
                  >
                    New Quiz
                  </button>
                  <button 
                    onClick={() => generateQuiz(false)}
                    className="px-8 py-3 bg-white border-2 border-indigo-600 text-indigo-600 rounded-2xl font-bold hover:bg-indigo-50 transition-all active:scale-95"
                  >
                    Try Again
                  </button>
                  <button 
                    onClick={resetQuiz}
                    className="px-8 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-95"
                  >
                    Back to Study
                  </button>
                </div>
              </div>
            ) : quizQuestions.length > 0 ? (
              <div className="flex-1 flex flex-col">
                <div className="flex justify-between items-center mb-8">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Question {currentQuizIndex + 1} of {quizQuestions.length}</span>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Score: {quizScore}</span>
                </div>

                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 mb-6 sm:mb-8 leading-tight">
                  {quizQuestions[currentQuizIndex].question}
                </h2>

                <div className="grid gap-3 mb-6 sm:mb-8">
                  {quizQuestions[currentQuizIndex].options.map((option, i) => {
                    const isSelected = selectedOption === i;
                    const isCorrect = i === quizQuestions[currentQuizIndex].correctIndex;
                    
                    let bgColor = "bg-slate-50 hover:bg-slate-100 border-slate-200";
                    if (showFeedback) {
                      if (isCorrect) bgColor = "bg-green-50 border-green-200 text-green-700";
                      else if (isSelected) bgColor = "bg-red-50 border-red-200 text-red-700";
                      else bgColor = "bg-slate-50 border-slate-100 opacity-50";
                    } else if (isSelected) {
                      bgColor = "bg-indigo-50 border-indigo-200 text-indigo-700";
                    }

                    return (
                      <button
                        key={i}
                        onClick={() => handleAnswer(i)}
                        disabled={showFeedback}
                        className={`w-full p-4 sm:p-5 rounded-2xl border-2 transition-all text-left text-sm sm:text-base font-medium flex items-center justify-between group ${bgColor}`}
                      >
                        <span>{option}</span>
                        {showFeedback && isCorrect && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                        {showFeedback && isSelected && !isCorrect && <X className="w-5 h-5 text-red-500" />}
                      </button>
                    );
                  })}
                </div>

                {showFeedback && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-auto"
                  >
                    <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 mb-6">
                      <p className="text-sm text-indigo-800 leading-relaxed">
                        <span className="font-bold">Explanation:</span> {quizQuestions[currentQuizIndex].explanation}
                      </p>
                    </div>
                    <button 
                      onClick={nextQuizQuestion}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <span>{currentQuizIndex === quizQuestions.length - 1 ? 'Finish Quiz' : 'Next Question'}</span>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </motion.div>
                )}
              </div>
            ) : null}
          </motion.div>
        ) : filteredCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
              <Star className="text-slate-300 w-10 h-10" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">No starred cards yet</h2>
            <p className="text-slate-500 mb-8 max-w-xs">Star cards that you find difficult to review them here separately.</p>
            <button 
              onClick={() => setShowStarredOnly(false)}
              className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl"
            >
              Show All Cards
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            {viewMode === 'flashcard' ? (
              <div className="flex flex-col items-center w-full">
            {/* Progress & Controls */}
            <div className="w-full max-w-2xl mb-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                
                {/* Deck Information */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                    {newDeckName || "My Deck"} ({filteredCards.length} Cards)
                  </span>
                </div>

                {/* Autoplay Audio Controls */}
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden xs:inline">Autoplay:</span>
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 p-1 rounded-xl">
                    {isAutoPlaying ? (
                      <div className="flex items-center gap-2 pl-1.5">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Playing</span>
                        </div>
                        <button 
                          onClick={stopAutoPlay}
                          className="p-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-all cursor-pointer"
                          title="Stop Auto-play"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <select 
                          value={autoPlayMode}
                          onChange={(e) => setAutoPlayMode(e.target.value as any)}
                          className="text-[10px] font-bold text-slate-500 bg-transparent outline-none px-2 py-0.5 cursor-pointer hover:text-indigo-600 font-mono"
                        >
                          <option value="front-back">{getDeckLanguageLabel().toUpperCase()} → EN</option>
                          <option value="back-front">EN → {getDeckLanguageLabel().toUpperCase()}</option>
                          <option value="front-only">{getDeckLanguageLabel().toUpperCase()} Only</option>
                          <option value="back-only">EN Only</option>
                        </select>
                        <button 
                          onClick={startAutoPlay}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                          title="Start Auto-play"
                        >
                          <PlayCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    
                    <button
                      onClick={() => setShowSettingsModal(true)}
                      className="p-1.5 rounded-lg transition-all cursor-pointer text-slate-400 hover:text-indigo-600 hover:bg-slate-100"
                      title="Autoplay & Repeat Setup"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>

              {/* Progress Bar and Label */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-500 font-medium">
                  <span className="font-bold text-indigo-500 uppercase tracking-widest text-[10px]">
                    {showStarredOnly ? 'Starred Review' : 'Progress'}
                  </span>
                  <span>
                    Card {currentIndex + 1} of {chunkedCards.length}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/40">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${chunkedCards.length > 0 ? ((currentIndex + 1) / chunkedCards.length) * 100 : 0}%` }}
                    className="h-full bg-indigo-500 rounded-full"
                  />
                </div>
              </div>
            </div>

            {/* Card Container */}
            <div className="relative w-full max-w-2xl flex items-center gap-4 px-4">
              {/* Left Navigation */}
              <button 
                onClick={prevCard}
                className="hidden md:flex p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-sm text-slate-400 hover:text-indigo-600 transition-all active:scale-95 flex-shrink-0"
                title="Previous Card"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <div className="relative flex-1 h-[480px] sm:h-[450px] md:h-auto md:aspect-[4/3] perspective-1000">
                <motion.div
                  className="w-full h-full relative preserve-3d cursor-pointer"
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  onClick={() => setIsFlipped(!isFlipped)}
                >
                  {/* Front */}
                  <div className={`absolute inset-0 backface-hidden bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 border border-slate-100 flex flex-col items-center justify-center p-6 sm:p-12 text-center ${isFlipped ? 'pointer-events-none select-none' : 'pointer-events-auto'}`}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(currentCard.id);
                      }}
                      className="absolute top-6 right-6 sm:top-8 sm:right-8 p-2 hover:bg-slate-50 rounded-full transition-colors"
                    >
                      <Star className={`w-6 h-6 ${currentCard?.isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    </button>
                    {currentCard?.type !== 'simple' && (
                      <span className="absolute top-6 left-6 sm:top-8 sm:left-8 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em]">{getDeckLanguageLabel()}</span>
                    )}
                    
                    <div className="flex-1 flex flex-col items-center justify-center w-full">
                      <div className="flex items-center gap-4 sm:gap-6 mb-2 max-w-full px-4 justify-center">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            speak(currentCard?.front, getCardLanguages(currentCard).frontLang);
                          }}
                          disabled={isSpeaking}
                          className={`p-2 rounded-full transition-all flex-shrink-0 ${isSpeaking ? 'text-slate-300' : 'text-indigo-600 hover:bg-indigo-50'}`}
                        >
                          <Volume2 className={`w-6 h-6 ${isSpeaking ? 'animate-pulse' : ''}`} />
                        </button>
                        <h3 className={`${currentCard?.type === 'simple' ? 'text-base sm:text-lg md:text-2xl' : 'text-xl sm:text-2xl md:text-3xl'} font-bold text-slate-800 leading-tight text-center break-words max-w-[70%]`}>
                          {currentCard?.front}
                        </h3>
                         <a
                          href={getTranslateUrl(currentCard?.front || '', getCardLanguages(currentCard).frontLang, getCardLanguages(currentCard).backLang)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-full text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex-shrink-0 ml-2 sm:ml-4"
                          title="Google Translate"
                        >
                          <Languages className="w-5 h-5" />
                        </a>
                      </div>
 
                      {cardSentences && cardSentences.length > 0 && (
                        <div 
                          onClick={(e) => e.stopPropagation()} 
                          className="mt-4 space-y-2 w-full max-h-48 overflow-y-auto pr-1 custom-card-scrollbar"
                        >
                          {cardSentences.map((s, i) => (
                            <div key={i} className="flex items-center gap-2 justify-center group bg-slate-50/50 hover:bg-slate-50 p-2 rounded-xl transition-all border border-slate-100/50">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  speak(s.original, getCardLanguages(currentCard).frontLang);
                                }}
                                disabled={isSpeaking}
                                className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${isSpeaking ? 'text-slate-200' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                title="Listen"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                              </button>
                              
                              <p className="text-slate-600 italic text-sm sm:text-base leading-relaxed flex-1 text-center font-medium">
                                {s.original}
                              </p>
 
                              <div className="flex items-center gap-1 transition-all">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startSentenceChunking(s.original, currentCard.id);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                                  title="Analyze Sentence Structure"
                                >
                                  {isChunking === s.original ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(getTranslateUrl(s.original, getCardLanguages(currentCard).frontLang, getCardLanguages(currentCard).backLang), "_blank");
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                                  title="Google Translate"
                                >
                                  <Languages className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-auto pt-6 w-full flex flex-col items-center gap-4">
                      <div className="flex gap-2 w-full">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            updateMastery(currentCard.id, 'learning');
                          }}
                          className={`flex-1 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                            currentCard?.mastery === 'learning' 
                            ? 'bg-amber-50 border-amber-200 text-amber-700' 
                            : 'bg-white border-slate-100 text-slate-400 hover:border-amber-200 hover:text-amber-600'
                          }`}
                        >
                          <Circle className="w-2.5 h-2.5 sm:w-3 h-3" />
                          Learning
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            updateMastery(currentCard.id, 'mastered');
                          }}
                          className={`flex-1 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                            currentCard?.mastery === 'mastered' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                            : 'bg-white border-slate-100 text-slate-400 hover:border-emerald-200 hover:text-emerald-600'
                          }`}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 h-3" />
                          Mastered
                        </button>
                      </div>
                      <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">Tap to flip</p>
                    </div>
                  </div>

                  {/* Back */}
                  <div 
                    className={`absolute inset-0 backface-hidden bg-indigo-600 rounded-[2.5rem] shadow-2xl shadow-indigo-200 border border-indigo-500 flex flex-col items-center justify-center p-6 sm:p-12 text-center rotate-y-180 ${!isFlipped ? 'pointer-events-none select-none' : 'pointer-events-auto'}`}
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(currentCard.id);
                      }}
                      className="absolute top-6 right-6 sm:top-8 sm:right-8 p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                      <Star className={`w-6 h-6 ${currentCard?.isStarred ? 'fill-amber-400 text-amber-400' : 'text-indigo-300'}`} />
                    </button>
                    {currentCard?.type !== 'simple' && (
                      <span className="absolute top-6 left-6 sm:top-8 sm:left-8 text-[10px] font-bold text-indigo-200 uppercase tracking-[0.2em]">Translation</span>
                    )}
                    
                    <div className="flex-1 flex flex-col items-center justify-center w-full px-4">
                      <div className="flex items-center gap-4 sm:gap-6 justify-center max-w-full px-4">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            speak(currentCard?.back, getCardLanguages(currentCard).backLang);
                          }}
                          disabled={isSpeaking}
                          className={`p-2 rounded-full transition-all flex-shrink-0 ${isSpeaking ? 'text-indigo-300' : 'text-white hover:bg-white/10'}`}
                        >
                          <Volume2 className={`w-6 h-6 ${isSpeaking ? 'animate-pulse' : ''}`} />
                        </button>
                        <h3 className={`${currentCard?.type === 'simple' ? 'text-sm sm:text-base md:text-lg' : 'text-lg sm:text-xl md:text-2xl'} font-bold text-white leading-tight break-words text-center max-w-[70%]`}>
                          {currentCard?.back}
                        </h3>
                        <a
                          href={getTranslateUrl(currentCard?.back || '', getCardLanguages(currentCard).backLang, getCardLanguages(currentCard).frontLang)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-full text-indigo-200 hover:text-white hover:bg-white/10 transition-all flex-shrink-0 ml-2 sm:ml-4"
                          title="Google Translate"
                        >
                          <Languages className="w-5 h-5" />
                        </a>
                      </div>

                      {cardSentences && cardSentences.length > 0 && (
                        <div 
                          onClick={(e) => e.stopPropagation()} 
                          className="mt-6 space-y-3 w-full max-h-48 overflow-y-auto pr-1 custom-card-scrollbar-back"
                        >
                          <div className="flex flex-col gap-1 items-center">
                            <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Usage</span>
                            <div className="w-8 h-0.5 bg-indigo-400/30 rounded-full" />
                          </div>
                          {cardSentences.map((s, i) => (
                            <div key={i} className="flex items-center gap-2 justify-center group bg-white/5 hover:bg-white/10 p-2.5 rounded-2xl transition-all border border-white/5">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  speak(s.original, getCardLanguages(currentCard).frontLang);
                                }}
                                disabled={isSpeaking}
                                className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${isSpeaking ? 'text-indigo-400' : 'text-indigo-200 hover:text-white hover:bg-white/10'}`}
                                title="Listen"
                              >
                                <Play className="w-3.5 h-3.5 fill-current text-white" />
                              </button>
                              
                              <div className="flex-1 text-center">
                                <p className="text-white italic text-sm sm:text-base leading-snug font-medium">
                                  {s.original}
                                </p>
                                {s.translation && (
                                  <p className="text-indigo-200 text-xs sm:text-sm leading-snug mt-0.5 opacity-80">
                                    {s.translation}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1 transition-all">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startSentenceChunking(s.original, currentCard.id);
                                  }}
                                  className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-white/10 transition-all"
                                  title="Analyze Sentence Structure"
                                >
                                  {isChunking === s.original ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                  ) : (
                                    <Sparkles className="w-3.5 h-3.5 text-white" />
                                  )}
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(getTranslateUrl(s.original, 'es', 'en'), "_blank");
                                  }}
                                  className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-white/10 transition-all"
                                  title="Google Translate"
                                >
                                  <Languages className="w-3.5 h-3.5 text-white" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-auto pt-6 w-full flex flex-col items-center gap-4">
                      <div className="flex gap-2 w-full">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            updateMastery(currentCard.id, 'learning');
                          }}
                          className={`flex-1 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                            currentCard?.mastery === 'learning' 
                            ? 'bg-white/20 border-white/30 text-white' 
                            : 'bg-transparent border-white/10 text-indigo-200 hover:border-white/30 hover:text-white'
                          }`}
                        >
                          <Circle className="w-2.5 h-2.5 sm:w-3 h-3" />
                          Learning
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            updateMastery(currentCard.id, 'mastered');
                          }}
                          className={`flex-1 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                            currentCard?.mastery === 'mastered' 
                            ? 'bg-white/20 border-white/30 text-white' 
                            : 'bg-transparent border-white/10 text-indigo-200 hover:border-white/30 hover:text-white'
                          }`}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 h-3" />
                          Mastered
                        </button>
                      </div>
                      <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest">Tap to flip back</p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Right Navigation */}
              <button 
                onClick={nextCard}
                className="hidden md:flex p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-sm text-slate-400 hover:text-indigo-600 transition-all active:scale-95 flex-shrink-0"
                title="Next Card"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Mobile Navigation */}
            <div className="flex md:hidden items-center gap-6 mt-8">
              <button 
                onClick={prevCard}
                className="p-3.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-sm text-slate-600 transition-all active:scale-95"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button 
                onClick={nextCard}
                className="p-3.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-sm text-slate-600 transition-all active:scale-95"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <button 
              onClick={() => setIsFlipped(!isFlipped)}
              className="mt-8 flex items-center gap-2 text-slate-400 hover:text-indigo-500 text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Flip Card</span>
            </button>
          </div>
        ) : (
          <div className="w-full max-w-3xl">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-slate-800">Deck Overview</h2>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl text-slate-500 text-sm font-bold">
                <span>{filteredCards.length} Cards</span>
              </div>
            </div>

            <div className="grid gap-4">
              {filteredCards.map((card, index) => (
                <motion.div 
                  key={card.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-6 group hover:border-indigo-200 hover:shadow-md transition-all"
                >
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 font-bold text-sm group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 grid sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">{getDeckLanguageLabel()}</span>
                      <p className="text-slate-800 font-bold line-clamp-2">{card.front}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">English</span>
                      <p className="text-slate-600 font-medium line-clamp-2">{card.back}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setCurrentIndex(index);
                        setViewMode('flashcard');
                        setIsFlipped(false);
                      }}
                      className="p-2.5 bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white rounded-xl transition-all"
                      title="Study this card"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                    <button 
                      onClick={() => toggleStar(card.id)}
                      className={`p-2.5 rounded-xl transition-all ${card.isStarred ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-300 hover:text-amber-500'}`}
                    >
                      <Star className={`w-4 h-4 ${card.isStarred ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    )}
      </main>

      {/* Sentence Breakdown Modal */}
      <AnimatePresence>
        {activeSentence && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/80 backdrop-blur-md"
            onClick={() => setActiveSentence(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col relative overflow-hidden border border-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600 z-10" />
              
              <div className="p-4 sm:p-6 pb-2 flex items-center justify-between border-b border-slate-50">
                <div className="flex items-center gap-3 sm:gap-4 text-left pl-2">
                  <div className="p-2 sm:p-3 bg-indigo-50 rounded-xl text-indigo-600 flex-shrink-0">
                    <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">
                      Sentence Breakdown
                    </h2>
                    <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 italic truncate max-w-[200px] sm:max-w-xs">
                      "{activeSentence.sentence}"
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const wordsOrChunks = isWordMode 
                        ? activeSentence.sentence.trim().split(/\s+/).filter(Boolean).map(w => ({ text: w, meaning: "" })) 
                        : activeSentence.chunks;
                      const text = wordsOrChunks.map(c => c.text).join(" ").trim() || activeSentence.sentence;
                      window.open(getTranslateUrl(text, 'es', 'en'), "_blank");
                    }}
                    className="p-2 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors text-slate-400 active:scale-95 flex items-center gap-1.5 cursor-pointer"
                    title="Google Translate"
                  >
                    <Languages className="w-5 h-5 text-indigo-500" />
                    <span className="text-[11px] font-bold text-indigo-600 hidden sm:inline">Translate</span>
                  </button>
                  
                  <button
                    onClick={() => setActiveSentence(null)}
                    className="p-2 rounded-full hover:bg-slate-50 transition-colors text-slate-400"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 space-y-6 scrollbar-hide">
                <div className="w-full space-y-6">
                  {(() => {
                    const chunksList = isWordMode 
                      ? activeSentence.sentence.trim().split(/\s+/).filter(Boolean).map(w => ({ text: w, meaning: "" })) 
                      : activeSentence.chunks;
                    
                    const stepIndices: number[][] = [];
                    chunksList.forEach((_, idx) => {
                      if (gradualSlowMode) {
                        for (let size = 1; size <= idx + 1; size++) {
                          const group = [];
                          for (let groupIdx = idx - size + 1; groupIdx <= idx; groupIdx++) {
                            group.push(groupIdx);
                          }
                          stepIndices.push(group);
                        }
                      } else {
                        stepIndices.push([idx]);
                        if (idx > 0) stepIndices.push([idx - 1, idx]);
                        if (idx > 1) stepIndices.push(Array.from({ length: idx + 1 }, (_, rIdx) => rIdx));
                      }
                    });

                    const totalSteps = stepIndices.length;
                    const activeStepIndices = currentBreakdownStep <= totalSteps ? stepIndices[currentBreakdownStep - 1] : [];
                    const isCompleted = currentBreakdownStep > totalSteps;

                    return (
                      <>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 px-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Rhythmic Training</span>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <button
                                onClick={() => {
                                  const text = chunksList.map(c => c.text).join(" ").trim() || activeSentence.sentence;
                                  window.open(getTranslateUrl(text, 'es', 'en'), "_blank");
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wider uppercase transition-all border bg-slate-50 border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 cursor-pointer"
                                title="Google Translate"
                              >
                                <Languages className="w-3.5 h-3.5 text-indigo-500" />
                                <span>Translate</span>
                              </button>
                              
                              <button
                                onClick={() => {
                                  setGradualSlowMode(prev => !prev);
                                  setCurrentBreakdownStep(1);
                                  setFocusedChunkIndex(null);
                                }}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wider uppercase transition-all border ${
                                  gradualSlowMode 
                                    ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100/80" 
                                    : "bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100/80"
                                } cursor-pointer`}
                                title={gradualSlowMode ? "Switch to standard fast mode" : "Switch to gradual slow mode"}
                              >
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${gradualSlowMode ? "bg-amber-400" : "bg-indigo-400"}`} />
                                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${gradualSlowMode ? "bg-amber-500" : "bg-indigo-500"}`} />
                                </span>
                                <span>{gradualSlowMode ? "Speed: Slow" : "Speed: Standard"}</span>
                              </button>

                              <button
                                onClick={() => {
                                  if (showSentenceMeaning) {
                                    setIsWordMode(prev => !prev);
                                    setCurrentBreakdownStep(1);
                                    setFocusedChunkIndex(null);
                                  }
                                }}
                                disabled={!showSentenceMeaning}
                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wider uppercase transition-all border ${
                                  isWordMode 
                                    ? "bg-violet-50 border-violet-200 text-violet-600 hover:bg-violet-100/80" 
                                    : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/80 hover:text-slate-700"
                                } ${showSentenceMeaning ? "cursor-pointer" : "opacity-65 cursor-not-allowed"}`}
                                title={showSentenceMeaning ? "Toggle Word-by-word mode" : "Word-by-word fallback mode (standard chunks unavailable)"}
                              >
                                <Layers className="w-3.5 h-3.5" />
                                <span>{isWordMode ? "Words" : "Clumps"}</span>
                              </button>
                            </div>

                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.2em] whitespace-nowrap">
                              {isCompleted ? "Mastered" : `Step ${currentBreakdownStep}/${totalSteps}`}
                            </span>
                          </div>

                          <div className="flex gap-1.5 overflow-hidden">
                            {Array.from({ length: totalSteps }).map((_, idx) => (
                              <div
                                key={idx}
                                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                                  idx + 1 <= currentBreakdownStep ? "bg-indigo-600" : "bg-slate-100"
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="bg-slate-50 rounded-[2rem] p-4 sm:p-6 min-h-[190px] sm:min-h-[250px] flex flex-col items-center justify-center text-center border border-slate-100 relative group/training">
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={currentBreakdownStep + "-" + (focusedChunkIndex ?? "none")}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="space-y-4 w-full"
                            >
                              <div className="space-y-3">
                                <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-2 px-2">
                                  {chunksList.map((chunk, idx) => {
                                    const isFocused = focusedChunkIndex === idx;
                                    const isActive = isCompleted || activeStepIndices.includes(idx) || isFocused;
                                    const isLastActive = activeStepIndices[activeStepIndices.length - 1] === idx;

                                    return (
                                      <motion.span
                                        key={idx}
                                        animate={{
                                          opacity: isActive ? 1 : 0.15,
                                          scale: isFocused ? 1.08 : isActive ? 1 : 0.9,
                                          filter: isActive ? "blur(0px)" : "blur(2.5px)"
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          speak(chunk.text, getCardLanguages(currentCard).frontLang);
                                          setFocusedChunkIndex(prev => prev === idx ? null : idx);
                                        }}
                                        className={`text-lg sm:text-2xl font-bold tracking-tight cursor-pointer select-none transition-all duration-300 px-1.5 sm:px-2 py-1 rounded-xl border ${
                                          isFocused 
                                            ? "text-indigo-700 bg-indigo-100/90 border-indigo-300 font-extrabold shadow-sm scale-110" 
                                            : isActive && !isCompleted && isLastActive 
                                            ? "text-indigo-600 font-extrabold border-indigo-100 bg-indigo-50/20" 
                                            : isActive 
                                            ? "text-slate-800 border-transparent hover:bg-slate-200/40 hover:border-slate-200/50" 
                                            : "text-slate-400 border-transparent opacity-30 hover:opacity-100 hover:scale-105"
                                        }`}
                                        title="Click to play and focus on this part"
                                      >
                                        {chunk.text}
                                      </motion.span>
                                    );
                                  })}
                                </div>

                                {!isCompleted && (
                                  <div className="space-y-2 px-4 flex justify-center">
                                    {focusedChunkIndex !== null ? (
                                      <div className="flex flex-col items-center justify-center gap-0.5 bg-indigo-50/60 border border-indigo-100/50 rounded-2xl py-1.5 px-4 max-w-sm mt-1 animate-fade-in shadow-xs">
                                        <span className="text-[8px] sm:text-[9px] font-semibold text-indigo-500 uppercase tracking-widest leading-none">
                                          Focused practice
                                        </span>
                                        <p className="text-indigo-900 font-bold text-xs sm:text-sm leading-tight mt-0.5">
                                          "{chunksList[focusedChunkIndex].text}"
                                        </p>
                                        <p className="text-indigo-600 font-medium text-[11px] sm:text-xs italic leading-tight">
                                          {isWordMode ? "Literal isolated word practice" : chunksList[focusedChunkIndex].meaning || "No translation available"}
                                        </p>
                                      </div>
                                    ) : (
                                      <p className="text-slate-500 font-medium text-sm sm:text-base italic">
                                        {isWordMode 
                                          ? activeStepIndices.length === 1 
                                            ? `Word practice: "${chunksList[activeStepIndices[0]].text}"` 
                                            : activeStepIndices.length === 2 
                                            ? `Words: "${chunksList[activeStepIndices[0]].text} + ${chunksList[activeStepIndices[1]].text}"` 
                                            : "Full sentence progress..."
                                          : activeStepIndices.length === 1 
                                          ? `"${chunksList[activeStepIndices[0]].meaning}"` 
                                          : activeStepIndices.length === 2 
                                          ? `"${chunksList[activeStepIndices[0]].meaning} + ${chunksList[activeStepIndices[1]].meaning}"` 
                                          : "Full sentence progress..."
                                        }
                                      </p>
                                    )}
                                  </div>
                                )}

                                {isCompleted && (
                                  <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="space-y-2"
                                  >
                                    <div className="text-2xl sm:text-3xl mb-1">🚀</div>
                                    <p className="text-emerald-600 font-bold text-base sm:text-lg">Rhythm Mastered!</p>
                                    <p className="text-slate-400 text-[10px] sm:text-xs">Now try saying the whole sentence aloud.</p>
                                  </motion.div>
                                )}
                              </div>

                              <button
                                onClick={() => {
                                  const frontLang = getCardLanguages(currentCard).frontLang;
                                  if (focusedChunkIndex !== null) {
                                    speak(chunksList[focusedChunkIndex].text, frontLang);
                                  } else if (isCompleted) {
                                    speak(activeSentence.sentence, frontLang);
                                  } else {
                                    const selectedText = activeStepIndices.map(idx => chunksList[idx].text).join(" ");
                                    speak(selectedText, frontLang);
                                  }
                                }}
                                className="w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-full shadow-lg border border-slate-100 flex items-center justify-center text-indigo-600 hover:scale-110 transition-transform active:scale-95 group/btn mx-auto cursor-pointer"
                                title="Listen to current active step"
                              >
                                <Volume2 className="w-5 h-5 sm:w-6 sm:h-6 group-hover/btn:scale-110 transition-transform text-indigo-600" />
                              </button>
                            </motion.div>
                          </AnimatePresence>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="p-4 sm:p-6 bg-slate-50/50 border-t border-slate-100">
                <div className="flex gap-4 w-full">
                  <button
                    onClick={() => {
                      setCurrentBreakdownStep(prev => Math.max(1, prev - 1));
                      setFocusedChunkIndex(null);
                    }}
                    disabled={currentBreakdownStep === 1}
                    className={`flex-1 py-3 px-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 text-sm sm:text-base ${
                      currentBreakdownStep === 1 
                        ? "text-slate-200 cursor-not-allowed" 
                        : "text-slate-500 hover:bg-white hover:shadow-sm cursor-pointer"
                    }`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                    Back
                  </button>

                  <button
                    onClick={() => {
                      const wordsOrChunks = isWordMode 
                        ? activeSentence.sentence.trim().split(/\s+/).filter(Boolean).map(w => ({ text: w, meaning: "" })) 
                        : activeSentence.chunks;
                      
                      const stepIndicesList: number[][] = [];
                      wordsOrChunks.forEach((_, idx) => {
                        if (gradualSlowMode) {
                          for (let size = 1; size <= idx + 1; size++) {
                            const group = [];
                            for (let groupIdx = idx - size + 1; groupIdx <= idx; groupIdx++) {
                              group.push(groupIdx);
                            }
                            stepIndicesList.push(group);
                          }
                        } else {
                          stepIndicesList.push([idx]);
                          if (idx > 0) stepIndicesList.push([idx - 1, idx]);
                          if (idx > 1) stepIndicesList.push(Array.from({ length: idx + 1 }, (_, rIdx) => rIdx));
                        }
                      });

                      const totalSteps = stepIndicesList.length;
                      if (currentBreakdownStep > totalSteps) {
                        setCurrentBreakdownStep(1);
                      } else {
                        setCurrentBreakdownStep(prev => prev + 1);
                      }
                      setFocusedChunkIndex(null);
                    }}
                    className="flex-[2] py-3 px-6 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98] text-sm sm:text-base cursor-pointer"
                  >
                    {(() => {
                      const wordsOrChunks = isWordMode 
                        ? activeSentence.sentence.trim().split(/\s+/).filter(Boolean).map(w => ({ text: w, meaning: "" })) 
                        : activeSentence.chunks;
                      
                      const stepIndicesList: number[][] = [];
                      wordsOrChunks.forEach((_, idx) => {
                        if (gradualSlowMode) {
                          for (let size = 1; size <= idx + 1; size++) {
                            const group = [];
                            for (let groupIdx = idx - size + 1; groupIdx <= idx; groupIdx++) {
                              group.push(groupIdx);
                            }
                            stepIndicesList.push(group);
                          }
                        } else {
                          stepIndicesList.push([idx]);
                          if (idx > 0) stepIndicesList.push([idx - 1, idx]);
                          if (idx > 1) stepIndicesList.push(Array.from({ length: idx + 1 }, (_, rIdx) => rIdx));
                        }
                      });

                      return currentBreakdownStep > stepIndicesList.length ? (
                        <>
                          <RotateCcw className="w-5 h-5" />
                          Restart
                        </>
                      ) : (
                        <>
                          Next
                          <ChevronRight className="w-5 h-5" />
                        </>
                      );
                    })()}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Deck Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowSaveModal(false)}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Add to History</h2>
              <p className="text-slate-500 text-sm mb-4">Give your deck a name to add it to your history.</p>

              <div className="mb-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col gap-1">
                <div className="flex justify-between">
                  <span>Deck Size:</span>
                  <span className="text-indigo-600 font-bold">{cards?.length || 0} cards</span>
                </div>
                <div className="flex justify-between">
                  <span>Language:</span>
                  <span className="text-indigo-600 font-bold">{deckLanguage?.toUpperCase() || 'ES'}</span>
                </div>
                <div className="flex justify-between">
                  <span>User Status:</span>
                  <span className="text-emerald-600 font-bold">{user?.email ? 'Logged In' : 'Not Logged In'}</span>
                </div>
              </div>
              
              {firestoreError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600">
                  <X className="w-5 h-5 flex-shrink-0" />
                  <p className="text-xs font-medium">{firestoreError}</p>
                </div>
              )}

              <input 
                type="text"
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                placeholder="Deck Name"
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all mb-6 font-medium"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && newDeckName && saveToFirestore(newDeckName, cards, !currentDeckId)}
              />
              
              <div className="flex flex-col gap-3">
                {currentDeckId && (
                  <button 
                    onClick={() => saveToFirestore(newDeckName, cards, false)}
                    disabled={!newDeckName || isSaving}
                    className="w-full px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>Update Current Deck</span>
                  </button>
                )}
                
                <button 
                  onClick={() => saveToFirestore(newDeckName, cards, true)}
                  disabled={!newDeckName || isSaving}
                  className={`w-full px-6 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${
                    currentDeckId 
                      ? 'bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50' 
                      : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700'
                  } disabled:opacity-50`}
                >
                  {isSaving && !currentDeckId ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  <span>{currentDeckId ? 'Save as New Deck' : 'Add to History'}</span>
                </button>

                <button 
                  onClick={() => setShowSaveModal(false)}
                  className="w-full px-6 py-3 text-slate-400 font-bold hover:text-slate-600 transition-all"
                >
                  Skip
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => setShowLogoutConfirm(false)}>
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[2rem] shadow-2xl overflow-hidden p-8 text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <LogOut className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Logout?</h2>
              <p className="text-slate-500 text-sm mb-8">Are you sure you want to log out of your cloud account?</p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    logout();
                    setShowLogoutConfirm(false);
                  }}
                  className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold shadow-lg shadow-red-100 hover:bg-red-600 transition-all active:scale-95"
                >
                  Logout
                </button>
                <button 
                  onClick={() => setShowLogoutConfirm(false)}
                  className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Clear Modal */}
      <AnimatePresence>
        {showConfirmClear && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowConfirmClear(false)}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 text-center mb-2">Clear Session?</h2>
              <p className="text-slate-500 text-sm text-center mb-8">This will remove all cards from your current session. Saved decks in the cloud will not be affected.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirmClear(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    setCards([]);
                    setQuizQuestions([]);
                    setState('import');
                    setCurrentDeckId(null);
                    setShowConfirmClear(false);
                  }}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Deck Confirm Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 text-center mb-2">Delete Deck?</h2>
              <p className="text-slate-500 text-sm text-center mb-8">
                Are you sure you want to delete <span className="font-bold text-slate-700">"{deckToDelete?.name}"</span>? 
                This action cannot be undone.
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteDeck}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Library Modal */}
      <AnimatePresence>
        {showLibraryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLibraryModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center">
                    <Library className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800">Library</h3>
                    <p className="text-slate-500 text-sm">Browse curated study materials</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowLibraryModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                {isLoadingLibrary ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                    <p className="text-slate-500 font-medium">Loading library...</p>
                  </div>
                ) : filteredLibrary.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Library className="w-10 h-10 text-slate-200" />
                    </div>
                    <h4 className="text-xl font-bold text-slate-800 mb-2">Library is empty</h4>
                    <p className="text-slate-500">No pre-made decks found in the library for {getDeckLanguageLabel()}.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredLibrary.map((node) => (
                      <LibraryTreeItem 
                        key={node.path} 
                        node={node} 
                        onFileSelect={loadFromLibrary}
                        expandedFolders={expandedFolders}
                        toggleFolder={toggleFolder}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Decks Modal */}
      <AnimatePresence>
        {showDecksModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] flex items-center justify-center p-6"
            onClick={() => setShowDecksModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">My Saved Decks</h2>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">Cloud Sync Enabled</p>
                </div>
                <button onClick={() => setShowDecksModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              
              <div className="max-h-[400px] overflow-y-auto p-4">
                {isLoadingDecks ? (
                  <div className="py-12 text-center">
                    <Loader2 className="w-12 h-12 text-indigo-400 mx-auto mb-4 animate-spin" />
                    <p className="text-slate-400 font-medium">Fetching your decks...</p>
                  </div>
                ) : userDecks.length === 0 ? (
                  <div className="py-12 text-center">
                    <CloudOff className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-medium">No decks saved to cloud yet.</p>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {userDecks.map(deck => (
                      <div key={deck.id} className="group relative">
                        <button
                          onClick={() => loadDeckFromFirestore(deck.id)}
                          className="w-full p-4 text-left hover:bg-indigo-50 rounded-2xl transition-all border border-transparent hover:border-indigo-100 flex items-center justify-between pr-14"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 group-hover:bg-white rounded-xl flex items-center justify-center transition-colors">
                              <FileJson className="w-5 h-5 text-slate-400 group-hover:text-indigo-600" />
                            </div>
                            <div className="flex flex-col items-start">
                              <span className="font-bold text-slate-700 group-hover:text-indigo-900">{deck.name}</span>
                              {deck.language && (
                                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.25 rounded-md font-bold mt-1 flex items-center gap-1 uppercase tracking-wider">
                                  <span>{languagesList.find(l => l.code === deck.language.toLowerCase())?.flag || '🗺️'}</span>
                                  <span>{languagesList.find(l => l.code === deck.language.toLowerCase())?.name || deck.language}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-400" />
                        </button>
                        <button 
                          onClick={(e) => deleteDeckFromFirestore(deck.id, deck.name, e)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          title="Delete Deck"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 text-center font-medium uppercase tracking-wider">
                  Your progress is automatically synced across devices
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

       {/* Language Selection Modal */}
      <AnimatePresence>
        {showLangDropdown && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLangDropdown(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                      <Languages className="text-indigo-600 w-4.5 h-4.5" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">Deck Language</h2>
                  </div>
                  <button 
                    onClick={() => setShowLangDropdown(false)}
                    className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X className="w-4.5 h-4.5 text-slate-400" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {languagesList.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        const isDifferentLanguage = deckLanguage !== lang.code;
                        setDeckLanguage(lang.code);
                        if (isDifferentLanguage && state !== 'import') {
                          setState('import');
                          setCurrentDeckId(null);
                          setCards([]);
                          setQuizQuestions([]);
                          setCurrentIndex(0);
                          setIsFlipped(false);
                        }
                        setShowLangDropdown(false);
                      }}
                      className={`px-4 py-3 rounded-2xl text-left text-sm flex items-center gap-2.5 transition-all border ${
                        deckLanguage === lang.code 
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-sm' 
                          : 'border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <span className="text-lg">{lang.flag}</span>
                      <span className="font-semibold">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettingsModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                      <Settings className="text-slate-600 w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">AI Settings</h2>
                  </div>
                  <button 
                    onClick={() => setShowSettingsModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Gemini API Key
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={dynamicApiKey || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDynamicApiKey(val);
                          if (val) {
                            localStorage.setItem('manual_gemini_api_key', val);
                            setIsApiKeyMissing(false);
                          } else {
                            localStorage.removeItem('manual_gemini_api_key');
                            // Re-check server key if manual is cleared
                            fetch('/api/config').then(r => r.json()).then(d => {
                              if (d.geminiApiKey) setDynamicApiKey(d.geminiApiKey);
                            });
                          }
                        }}
                        placeholder="Enter your API key..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm font-mono"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {dynamicApiKey ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <CloudOff className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                      The app tries to load a key from the server automatically. If it fails, you can paste your own Gemini API key here. It is saved only in your browser's local storage.
                    </p>
                  </div>

                  {/* Auto-Play Settings */}
                  <div className="pt-4 border-t border-slate-100 space-y-4">
                    <h3 className="text-base font-bold text-slate-700">Auto-Play Settings</h3>
                    
                    {/* Turtle Mode Speed */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-600">
                          Turtle Mode Speed
                        </label>
                        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg font-bold text-xs">
                          {turtleModeSpeed.toFixed(2)}x
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 font-bold font-mono">0.40x</span>
                        <input
                          type="range"
                          min="0.4"
                          max="1.0"
                          step="0.05"
                          value={turtleModeSpeed}
                          onChange={(e) => setTurtleModeSpeed(parseFloat(e.target.value))}
                          className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-600"
                        />
                        <span className="text-xs text-slate-400 font-bold font-mono">1.00x</span>
                      </div>
                    </div>

                    {/* Target Audio Repeats */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-600">
                          Target Audio Repeats
                        </label>
                        <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg font-bold text-xs">
                          {targetAudioRepeats}x
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setTargetAudioRepeats(num)}
                            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all border ${
                              targetAudioRepeats === num
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Target Audio Play Speed */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-600">
                          Target Audio Play Speed
                        </label>
                        <span className="text-slate-400 font-bold text-xs capitalize">
                          {targetAudioPlaySpeed === 'normal' ? 'Normal' : targetAudioPlaySpeed === 'slow' ? 'Slow' : 'Alternate'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {(['normal', 'slow', 'alternate'] as const).map((speed) => (
                          <button
                            key={speed}
                            type="button"
                            onClick={() => setTargetAudioPlaySpeed(speed)}
                            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all border capitalize ${
                              targetAudioPlaySpeed === speed
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {speed}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Autoplay Breakdown Mode */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-600">
                          Autoplay Breakdown Mode
                        </label>
                        <span className="text-indigo-600 font-bold text-xs capitalize bg-indigo-50 px-2 py-0.5 rounded-lg">
                          {autoPlayBreakDownMode === 'side' ? 'Card Side' : 'Word/Sentence'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {(['side', 'item'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setAutoPlayBreakDownMode(mode)}
                            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all border ${
                              autoPlayBreakDownMode === mode
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {mode === 'side' ? 'Card Side' : 'Word/Sentence'}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                        {autoPlayBreakDownMode === 'side' 
                          ? `Side: Plays the entire ${getDeckLanguageLabel()} side (Word, Sentences, Examples) together, then the English side.` 
                          : 'Word/Sentence: Alternates word with translation, then each sentence with translation.'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-slate-700">Diagnostics</h3>
                      <button 
                        onClick={() => setShowAdvancedDiagnostics(!showAdvancedDiagnostics)}
                        className="text-xs text-indigo-600 font-bold uppercase tracking-wider hover:underline"
                      >
                        {showAdvancedDiagnostics ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>

                    {showAdvancedDiagnostics && (
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-50 rounded-2xl space-y-2 font-mono text-[10px] text-slate-600 border border-slate-100">
                          <div className="flex justify-between">
                            <span>Server Key:</span>
                            <span className={dynamicApiKey ? 'text-emerald-600' : 'text-red-500'}>{dynamicApiKey ? 'Found' : 'Missing'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Manual Key:</span>
                            <span>{localStorage.getItem('manual_gemini_api_key') ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Environment:</span>
                            <span>{process.env.NODE_ENV}</span>
                          </div>
                        </div>

                        <button
                          onClick={async () => {
                            await testAiConnection();
                          }}
                          disabled={isTestingConnection}
                          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                        >
                          {isTestingConnection ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                          Test Connection
                        </button>

                        <button
                          onClick={runSpeechDiagnostics}
                          className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                        >
                          <Volume2 className="w-4 h-4 text-slate-500" />
                          Speech Diagnostics
                        </button>

                        <button
                          onClick={resetSpeechEngine}
                          className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100/50 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                        >
                          <RotateCcw className="w-4 h-4 text-red-500" />
                          Reset Speech Engine
                        </button>

                        {speechDiagnosticMsg && (
                          <div className="p-3 bg-indigo-50/50 text-indigo-800 rounded-xl text-xs font-semibold leading-relaxed border border-indigo-100/50">
                            {speechDiagnosticMsg}
                          </div>
                        )}

                        {testResult && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-4 rounded-2xl text-xs font-medium flex items-start gap-3 ${testResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}
                          >
                            {testResult.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <X className="w-4 h-4 flex-shrink-0" />}
                            <span>{testResult.message}</span>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-6 flex justify-end">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Help & Installation Modal */}
      <AnimatePresence>
        {showHelpModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold">Help & Installation</h3>
                </div>
                <button onClick={() => setShowHelpModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                <section>
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4">AI Status</h4>
                  <div className={`p-5 rounded-3xl flex flex-col gap-4 ${isApiKeyMissing || isApiKeyInvalid ? 'bg-slate-900 text-slate-100 border border-slate-800' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isApiKeyMissing || isApiKeyInvalid ? (
                          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500">
                            <CloudOff className="w-6 h-6" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                            <Cloud className="w-6 h-6" />
                          </div>
                        )}
                        <div>
                          <p className="font-mono text-xs opacity-50 uppercase tracking-widest">System Status</p>
                          <p className="font-bold text-lg leading-none">
                            {isApiKeyInvalid ? 'Invalid Key' : isApiKeyMissing ? 'Key Required' : 'AI Online'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[10px] opacity-50 uppercase tracking-widest">Model</p>
                        <p className="font-mono text-xs font-bold">gemini-flash</p>
                      </div>
                    </div>
                    
                    {(isApiKeyMissing || isApiKeyInvalid) && (
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-[11px] leading-relaxed space-y-3">
                        <div className="flex items-start gap-2">
                          <div className="w-4 h-4 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center text-[10px] font-bold">1</div>
                          <p>Click the <strong>Gear Icon</strong> (Settings) at the top right of the PC screen.</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-4 h-4 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center text-[10px] font-bold">2</div>
                          <p>Select your <strong>New Project</strong> from the dropdown.</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-4 h-4 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center text-[10px] font-bold">3</div>
                          <p>If it's not showing, <strong>Refresh the entire PC browser tab</strong> to sync projects.</p>
                        </div>
                        
                        {window.aistudio && (
                          <button 
                            onClick={() => window.aistudio.openSelectKey()}
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all text-xs shadow-lg shadow-indigo-600/20"
                          >
                            Force Key Selection
                          </button>
                        )}
                      </div>
                    )}

                    {!showAdvancedDiagnostics ? (
                      <button 
                        onClick={() => setShowAdvancedDiagnostics(true)}
                        className="text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity text-center py-2"
                      >
                        Troubleshoot Connection
                      </button>
                    ) : (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={testAiConnection}
                            disabled={isTestingConnection}
                            className="py-3 bg-white/10 hover:bg-white/20 rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 border border-white/5"
                          >
                            {isTestingConnection ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3 h-3" />
                            )}
                            Run Test
                          </button>
                          
                          <button
                            onClick={async () => {
                              setIsTestingConnection(true);
                              setTestResult(null);
                              try {
                                const response = await fetch('/api/config');
                                const data = await response.json();
                                const key = data.geminiApiKey;
                                if (key) {
                                  setDynamicApiKey(key);
                                  localStorage.setItem('manual_gemini_api_key', key);
                                }
                                const prefix = key ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : 'None';
                                
                                setTestResult({
                                  success: key ? true : false,
                                  message: key ? "Sync successful!" : "Sync returned no key.",
                                  debug: `Server Key: ${prefix}`
                                });
                                
                                if (key) {
                                  setIsApiKeyMissing(false);
                                  setIsApiKeyInvalid(false);
                                }
                              } catch (e: any) {
                                setTestResult({
                                  success: false,
                                  message: "Sync failed to reach server.",
                                  debug: e.message
                                });
                              } finally {
                                setIsTestingConnection(false);
                              }
                            }}
                            className="py-3 bg-white/10 hover:bg-white/20 rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 transition-colors border border-white/5"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Sync Key
                          </button>
                        </div>

                        <div className="pt-4 border-t border-white/10">
                          <p className="font-mono text-[10px] opacity-50 uppercase tracking-widest mb-2">Manual Override</p>
                          <div className="flex gap-2">
                            <input 
                              type="password"
                              placeholder="Paste API Key here..."
                              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                              onChange={(e) => {
                                const val = e.target.value.trim();
                                if (val) {
                                  setDynamicApiKey(val);
                                  localStorage.setItem('manual_gemini_api_key', val);
                                  setIsApiKeyMissing(false);
                                }
                              }}
                            />
                            <button 
                              onClick={() => {
                                localStorage.removeItem('manual_gemini_api_key');
                                setDynamicApiKey(null);
                                window.location.reload();
                              }}
                              className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/50"
                              title="Clear Key"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {testResult && (
                          <div className={`p-3 rounded-xl font-mono text-[10px] border ${testResult.success ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${testResult.success ? 'bg-green-400' : 'bg-red-400'}`} />
                              <span className="uppercase tracking-widest opacity-70">Log Output</span>
                            </div>
                            <div className="mb-1 font-bold">{testResult.message}</div>
                            {testResult.debug && (
                              <div className="opacity-60 border-t border-white/5 pt-1 mt-1">
                                {testResult.debug}
                              </div>
                            )}
                          </div>
                        )}

                        <button 
                          onClick={() => setShowAdvancedDiagnostics(false)}
                          className="w-full py-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                        >
                          Hide Advanced
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4">How to Install</h4>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 font-bold text-slate-600">1</div>
                      <div>
                        <p className="font-bold text-slate-800">On iPhone (Safari)</p>
                        <p className="text-sm text-slate-500">Tap the <span className="font-bold text-slate-700">Share</span> button (square with arrow) and select <span className="font-bold text-slate-700">"Add to Home Screen"</span>.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 font-bold text-slate-600">2</div>
                      <div>
                        <p className="font-bold text-slate-800">On Android (Chrome)</p>
                        <p className="text-sm text-slate-500">Tap the <span className="font-bold text-slate-700">Three Dots</span> in the corner and select <span className="font-bold text-slate-700">"Install App"</span>.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 font-bold text-slate-600">3</div>
                      <div>
                        <p className="font-bold text-slate-800">On Computer</p>
                        <p className="text-sm text-slate-500">Look for the <span className="font-bold text-slate-700">Install Icon</span> in your browser's address bar.</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4">Cloud Sync</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Login with your Google account to save your decks to the cloud. You can access your cards from any device!
                  </p>
                </section>

                <section>
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-widest mb-4">AI Features</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Use the <span className="font-bold text-indigo-600">Magic Wand</span> to generate example sentences or full decks from a single topic.
                  </p>
                </section>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => setShowHelpModal(false)}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                >
                  Got it!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
            onClick={() => !isAuthLoading && setShowAuthModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <Lock className="text-indigo-600 w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800">
                    {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
                  </h2>
                </div>
                {!user && (
                  <div className="px-3 py-1 bg-indigo-50 rounded-full text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                    Guest Mode
                  </div>
                )}
                <button 
                  onClick={() => setShowAuthModal(false)}
                  disabled={isAuthLoading}
                  className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-8 text-center">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-200 mx-auto mb-4">
                  <BookOpen className="text-white w-8 h-8" />
                </div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">LingoFlash</h1>
                <p className="text-slate-500 text-sm mt-1">Master any language with AI-powered flashcards.</p>
              </div>

              {authError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600">
                  <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-xs font-medium leading-relaxed">{authError}</p>
                </div>
              )}

              <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailRegister} className="space-y-4">
                {authMode === 'register' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Display Name</label>
                    <input 
                      type="text"
                      value={authDisplayName}
                      onChange={(e) => setAuthDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                      disabled={isAuthLoading}
                      required
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                  <input 
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    disabled={isAuthLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                  <input 
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    disabled={isAuthLoading}
                    required
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {isAuthLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span>{authMode === 'login' ? 'Login' : 'Create Account'}</span>
                  )}
                </button>
              </form>

              <div className="mt-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-100"></div>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">or</span>
                <div className="h-px flex-1 bg-slate-100"></div>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={isAuthLoading}
                className="mt-6 w-full py-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>Continue with Google</span>
              </button>

              <p className="mt-8 text-center text-sm text-slate-500">
                {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}{' '}
                <button 
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  {authMode === 'login' ? 'Sign Up' : 'Log In'}
                </button>
              </p>

              {!user && (
                <button 
                  onClick={() => setShowAuthModal(false)}
                  className="mt-4 w-full py-2 text-slate-400 text-sm font-bold hover:text-slate-600 transition-all"
                >
                  Skip for now
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMagicModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
            onClick={() => !isGeneratingMagic && setShowMagicModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <Wand2 className="text-indigo-600 w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800">Magic Generate</h2>
                </div>
                <button 
                  onClick={() => setShowMagicModal(false)}
                  disabled={isGeneratingMagic}
                  className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <p className="text-slate-500 text-sm mb-6">
                Tell the AI Professor what you want to study, and it will create a custom deck for you.
              </p>

              {magicError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600">
                  <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-xs font-medium leading-relaxed">{magicError}</p>
                </div>
              )}

              <div className="space-y-4 mb-8">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Topic or Theme</label>
                <input 
                  type="text"
                  value={magicTopic}
                  onChange={(e) => setMagicTopic(e.target.value)}
                  placeholder="e.g. Ordering food, Colors, Basic verbs..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  disabled={isGeneratingMagic}
                  onKeyDown={(e) => e.key === 'Enter' && generateMagicCards()}
                />
              </div>

              <button
                onClick={generateMagicCards}
                disabled={isGeneratingMagic || !magicTopic.trim()}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isGeneratingMagic ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    <span>Create Magic Deck</span>
                  </>
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File Picker Modal */}
      <AnimatePresence>
        {showFilePicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => setShowFilePicker(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Load Flashcards</h2>
                  <p className="text-slate-400 text-sm font-medium mt-1">Select a JSON file to import</p>
                </div>
                <button 
                  onClick={() => setShowFilePicker(false)}
                  className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                {fileList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <FileJson className="w-12 h-12 mb-4 opacity-20" />
                    <p className="font-medium">No JSON files found in /data</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {fileList.map((node) => (
                      <FileTreeItem 
                        key={node.path} 
                        node={node} 
                        onFileSelect={loadFile}
                        expandedFolders={expandedFolders}
                        toggleFolder={toggleFolder}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col gap-4">
                <label className="w-full py-3 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-600 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm">
                  <Download className="w-4 h-4 rotate-180" />
                  <span>Upload from Computer</span>
                  <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                </label>
                <p className="text-[10px] text-slate-400 text-center font-medium uppercase tracking-wider">
                  Or load from the project's <code className="bg-slate-200 px-1 rounded">/data</code> directory
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Firestore Error Toast */}
      <AnimatePresence>
        {firestoreError && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-red-500 min-w-[320px]">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <CloudOff className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{firestoreError}</p>
              </div>
              <button 
                onClick={() => setFirestoreError(null)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quota Error Toast */}
      <AnimatePresence>
        {quotaError && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 min-w-[320px]">
              <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center">
                <RotateCcw className="w-4 h-4 text-amber-500 animate-spin-slow" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{quotaError}</p>
              </div>
              <button 
                onClick={() => setQuotaError(null)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSS for 3D flip */}
      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

interface FileTreeItemProps {
  key?: any;
  node: FileNode;
  onFileSelect: (path: string) => void | Promise<void>;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  level?: number;
}

function FileTreeItem({ 
  node, 
  onFileSelect, 
  expandedFolders, 
  toggleFolder,
  level = 0 
}: FileTreeItemProps) {
  const isExpanded = expandedFolders.has(node.path);

  if (node.type === 'directory') {
    return (
      <div className="flex flex-col">
        <button 
          onClick={() => toggleFolder(node.path)}
          className="flex items-center gap-2 w-full p-3 hover:bg-slate-50 rounded-xl transition-colors text-left group"
          style={{ paddingLeft: `${level * 1.5 + 0.75}rem` }}
        >
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
          <Folder className="w-5 h-5 text-indigo-400 fill-indigo-50" />
          <span className="font-semibold text-slate-700 group-hover:text-indigo-600">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div className="flex flex-col">
            {node.children.map((child) => (
              <FileTreeItem 
                key={child.path} 
                node={child} 
                onFileSelect={onFileSelect}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button 
      onClick={() => onFileSelect(node.path)}
      className="flex items-center gap-2 w-full p-3 hover:bg-indigo-50 rounded-xl transition-colors text-left group"
      style={{ paddingLeft: `${level * 1.5 + 2.25}rem` }}
    >
      <FileJson className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />
      <span className="font-medium text-slate-600 group-hover:text-indigo-700">{node.name}</span>
    </button>
  );
}

const formatDisplayName = (name: string, type: 'file' | 'directory') => {
  if (type === 'file') {
    let clean = name.replace(/\.json$/, '');
    clean = clean.replace(/-/g, ' ');
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  } else {
    const langMap: Record<string, string> = {
      es: "Spanish 🇪🇸",
      fr: "French 🇫🇷",
      it: "Italian 🇮🇹",
      ja: "Japanese 🇯🇵",
      ko: "Korean 🇰🇷",
      pt: "Portuguese 🇵🇹",
      zh: "Chinese 🇨🇳",
      de: "German 🇩🇪"
    };
    if (langMap[name.toLowerCase()]) {
      return langMap[name.toLowerCase()];
    }
    let clean = name.replace(/-/g, ' ');
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
};

interface LibraryTreeItemProps {
  key?: any;
  node: FileNode;
  onFileSelect: (path: string) => void | Promise<void>;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  level?: number;
}

function LibraryTreeItem({ 
  node, 
  onFileSelect, 
  expandedFolders, 
  toggleFolder,
  level = 0 
}: LibraryTreeItemProps) {
  const isExpanded = expandedFolders.has(node.path);

  if (node.type === 'directory') {
    return (
      <div className="flex flex-col">
        <button 
          onClick={() => toggleFolder(node.path)}
          className="flex items-center gap-3 w-full p-3.5 hover:bg-purple-50/50 rounded-2xl transition-all text-left group cursor-pointer"
          style={{ paddingLeft: `${level * 1.5 + 0.75}rem` }}
        >
          <ChevronDown className={`w-4 h-4 text-purple-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
          <Folder className="w-5 h-5 text-purple-500 fill-purple-50 group-hover:scale-105 transition-transform" />
          <span className="font-bold text-slate-700 group-hover:text-purple-700 text-sm sm:text-base">
            {formatDisplayName(node.name, 'directory')}
          </span>
        </button>
        {isExpanded && node.children && (
          <div className="flex flex-col mt-0.5 border-l-2 border-purple-100/50 ml-6 pl-1 gap-0.5">
            {node.children.map((child) => (
              <LibraryTreeItem 
                key={child.path} 
                node={child} 
                onFileSelect={onFileSelect}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button 
      onClick={() => onFileSelect(node.path)}
      className="flex items-center gap-3 w-full p-3 hover:bg-purple-50 rounded-2xl transition-all text-left group cursor-pointer"
      style={{ paddingLeft: `${level * 1.5 + 1.25}rem` }}
    >
      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-slate-100 group-hover:border-purple-200 transition-colors">
        <FileJson className="w-4 h-4 text-slate-400 group-hover:text-purple-600 group-hover:scale-110 transition-all" />
      </div>
      <span className="font-semibold text-slate-600 group-hover:text-purple-800 text-xs sm:text-sm">
        {formatDisplayName(node.name, 'file')}
      </span>
    </button>
  );
}

