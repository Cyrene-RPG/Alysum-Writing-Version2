import fs from "fs";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tiqmhozzxhiydjnyuuaw.supabase.co";
const SUPABASE_SECRET = "sb_secret_TdrwPyOL5EHyEBeH_fXzTQ_FBNJbjlX	";

const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));
const firebaseAuthUsers = JSON.parse(
  fs.readFileSync("./firebase-to-supabase/auth/users.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET);

function getFirebaseAuthList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.users)) return raw.users;
  return [];
}

const firebaseAuthList = getFirebaseAuthList(firebaseAuthUsers);

const firebaseUidToEmail = new Map();

for (const u of firebaseAuthList) {
  const uid = u.localId || u.uid || u.id;
  const email = u.email;
  if (uid && email) firebaseUidToEmail.set(uid, email.toLowerCase());
}

async function getAllSupabaseUsers() {
  const all = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000
    });

    if (error) throw error;

    const users = data?.users || [];
    all.push(...users);

    if (users.length < 1000) break;
    page++;
  }

  return all;
}

async function main() {
  console.log("Loading Supabase Auth users...");
  const supaUsers = await getAllSupabaseUsers();

  const emailToSupaId = new Map();

  for (const u of supaUsers) {
    if (u.email) emailToSupaId.set(u.email.toLowerCase(), u.id);
  }

  console.log("Supabase auth users:", supaUsers.length);

  const usersSnap = await firestore.collection("users").get();

  let fixedUsers = 0;
  let fixedBooks = 0;
  let skippedUsers = 0;

  for (const userDoc of usersSnap.docs) {
    const firebaseUid = userDoc.id;
    const data = userDoc.data() || {};
    const email = firebaseUidToEmail.get(firebaseUid);

    if (!email) {
      console.log("SKIP no email for Firebase UID:", firebaseUid, data.username || "");
      skippedUsers++;
      continue;
    }

    const supaId = emailToSupaId.get(email);

    if (!supaId) {
      console.log("SKIP no Supabase auth user for:", email);
      skippedUsers++;
      continue;
    }

    console.log("Fixing user:", email, data.username || "", firebaseUid, "=>", supaId);

    const { error: userError } = await supabase.from("users").upsert({
      id: supaId,
      firebase_uid: firebaseUid,
      email,
      username: data.username || email.split("@")[0],
      display_name: data.displayName || data.username || email.split("@")[0],
      account_type: data.accountType || "both",
      words: data.words || 0,
      streak: data.streak || 0,
      daily_word_goal: data.dailyWordGoal || 2000,
      writing_day_totals: data.writingDayTotals || {},
      lastLogin: data.lastLogin || null
    });

    if (userError) {
      console.error("USER ERROR:", email, userError);
      continue;
    }

    fixedUsers++;

    const booksSnap = await firestore
      .collection("users")
      .doc(firebaseUid)
      .collection("books")
      .get();

    for (const bookDoc of booksSnap.docs) {
      const book = bookDoc.data() || {};

      const { error: bookError } = await supabase.from("books").upsert({
        id: bookDoc.id,
        user_id: supaId,
        firebase_uid: firebaseUid,
        title: book.title || "Untitled Book",
        created: book.created || Date.now(),
        updated: book.updated || Date.now(),
        words: book.words || 0,
        sections: book.sections || {},
        is_published: book.isPublished || false,
        library_type: book.libraryType || null,
        published_chapter_ids: book.publishedChapterIds || [],
        publish_meta: book.publishMeta || {}
      });

      if (bookError) {
        console.error("BOOK ERROR:", book.title, bookError);
      } else {
        fixedBooks++;
        console.log("  Book:", book.title || bookDoc.id);
      }
    }
  }

  console.log("DONE");
  console.log("Fixed users:", fixedUsers);
  console.log("Fixed books:", fixedBooks);
  console.log("Skipped users:", skippedUsers);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
