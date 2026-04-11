<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCVEnkx--46VyGPw00kJZpICpJ7b5qyXOI",
  authDomain: "alysum-web.firebaseapp.com",
  projectId: "alysum-web",
  storageBucket: "alysum-web.firebasestorage.app",
  messagingSenderId: "318598785612",
  appId: "1:318598785612:web:737b20ab19a0eee9a9e2e9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const usernameEl = document.getElementById("username");
const loadingEl = document.getElementById("loading");

onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "/login";
        return;
    }

    console.log("User logged in:", user.uid);

    try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        console.log("Firestore response:", docSnap.exists());

        if (docSnap.exists()) {
            const data = docSnap.data();

            usernameEl.textContent = "@" + data.username;
            loadingEl.textContent = "";

        } else {
            console.log("NO USER DOC FOUND");

            usernameEl.textContent = "@no-profile";
            loadingEl.textContent = "No profile found";
        }

    } catch (err) {
        console.error("FIRESTORE ERROR:", err);
        loadingEl.textContent = "Error loading profile";
    }
});
</script>
