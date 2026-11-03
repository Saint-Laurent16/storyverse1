// STORYVERSE Firebase web-app configuration.
export const firebaseConfig = {
  apiKey: "AIzaSyC9eCpY5Eu_AXZElhMJCLeZmbsjZ-6LXXA",
  authDomain: "storyverse-57dfc.firebaseapp.com",
  projectId: "storyverse-57dfc",
  storageBucket: "storyverse-57dfc.firebasestorage.app",
  messagingSenderId: "948127260871",
  appId: "1:948127260871:web:feaad7cab464d86193dee2",
  measurementId: "G-BR7JHQ9EFQ"
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("PASTE_") &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.startsWith("PASTE_") &&
  firebaseConfig.appId &&
  !firebaseConfig.appId.startsWith("PASTE_")
);
