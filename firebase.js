import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCVEnkx--46VyGPw00kJZpICpJ7b5qyXOI",
  authDomain: "alysum-web.firebaseapp.com",
  projectId: "alysum-web",
  storageBucket: "alysum-web.appspot.com",
  messagingSenderId: "1059381608307",
  appId: "1:1059381608307:web:df64d26a6d6fa8e812c8fd"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

function createFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (e) {
    console.warn("Firestore initializeFirestore fallback:", e);
    return getFirestore(app);
  }
}

export const db = createFirestore();
