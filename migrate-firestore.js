import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const serviceAccount = JSON.parse(
fs.readFileSync("./serviceAccountKey.json", "utf8")
);
const supabase = createClient(
"https://tiqmhozzxhiydjnyuuaw.supabase.co",
"sb_secret_TdrwPyOL5EHyEBeH_fXzTQ_FBNJbjlX"
);
admin.initializeApp({
credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
async function migrateUsers() {
const usersSnap = await db.collection("users").get();
for (const userDoc of usersSnap.docs) {
const uid = userDoc.id;
const data = userDoc.data();
console.log("Migrating user:", uid);
await supabase.from("users").upsert({
id: uid,
username: data.username || "",
display_name: data.displayName || "",
account_type: data.accountType || "both",
words: data.words || 0,
streak: data.streak || 0,
daily_word_goal: data.dailyWordGoal || 2000,
writing_day_totals: data.writingDayTotals || {}
});
const booksSnap = await db
.collection("users")
.doc(uid)
.collection("books")
.get();
for (const bookDoc of booksSnap.docs) {
const book = bookDoc.data();
console.log("Migrating book:", book.title);
await supabase.from("books").upsert({
id: bookDoc.id,
user_id: uid,
title: book.title || "Untitled",
created: book.created || Date.now(),
updated: book.updated || Date.now(),
words: book.words || 0,
sections: book.sections || {}
});
}
const notifSnap = await db
.collection("users")
.doc(uid)
.collection("notifications")
.get();
for (const notifDoc of notifSnap.docs) {
await supabase.from("notifications").upsert({
id: notifDoc.id,
user_id: uid,
read: notifDoc.data().read || false,
data: notifDoc.data()
});
}
}
console.log("Migration complete.");
}
migrateUsers();

