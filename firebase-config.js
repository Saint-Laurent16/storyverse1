// STORYVERSE Firebase web-app configuration.
// Replace every placeholder with the config shown in Firebase Console > Project settings > Your apps.
// These values identify your Firebase project; Firestore Security Rules protect the actual data.
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
  appId: "PASTE_APP_ID"
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("PASTE_") &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.startsWith("PASTE_") &&
  firebaseConfig.appId &&
  !firebaseConfig.appId.startsWith("PASTE_")
);
