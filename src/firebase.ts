import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-N7JN5GJX22"
};

let app, db: any, auth: any, analytics: any;

if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    if (typeof window !== "undefined") {
      analytics = getAnalytics(app);
    }
    console.log("Firebase Initialized Successfully.");
  } catch (error) {
    console.error("Firebase initialization error", error);
  }
} else {
  console.warn("Firebase not initialized. Add configuration to .env file! Falling back to Mock Data Mode.");
}

export { app, db, auth, analytics };
