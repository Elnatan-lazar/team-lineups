// Cloud database settings (Firebase).
// Leave FIREBASE_CONFIG as null to keep all data only in this browser.
// To enable sync between devices, paste the config object from:
// Firebase console → Project settings → General → Your apps → Web app → "SDK setup and configuration" (Config).
// These values are not secret; access is controlled by the Firestore security rules (see README).

window.FIREBASE_CONFIG = null;
/* Example:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
*/

// Name of the document that holds the team's data.
window.TEAM_DOC = 'team-9218';
