import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const databaseId = (firebaseConfig as any).firestoreDatabaseId;
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

export const googleProvider = new GoogleAuthProvider();

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  signOut,
  onAuthStateChanged
};
