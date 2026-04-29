import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCmAHP4o7jV3th2sLbdemCRO1aZyGNYn7g",
  authDomain: "iron-log-snowy.vercel.app", 
  databaseURL: "https://iron-log-9903d-default-rtdb.firebaseio.com",
  projectId: "iron-log-9903d",
  storageBucket: "iron-log-9903d.firebasestorage.app",
  messagingSenderId: "567014291456",
  appId: "1:567014291456:web:d4018149ef6985f0ed00e5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);