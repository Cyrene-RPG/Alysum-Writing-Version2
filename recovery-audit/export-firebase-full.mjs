/**
 * Export ALL Alysum data from live Firebase → recovery-audit/export/
 *   node recovery-audit/export-firebase-full.mjs
 */
import fs from "fs";
import path from "path";
import admin from "firebase-admin";

const OUT = path.join(process.cwd(), "recovery-audit", "export");
fs.mkdirSync(OUT, { recursive: true });

const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "serviceAccountKey.json"), "utf8")
);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

function serialize(v) {
  if (v == null) return v;
  if (typeof v === "object") {
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (Array.isArray(v)) return v.map(serialize);
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = serialize(val);
    return o;
  }
  return v;
}

async function listAuthUsers() {
  const out = [];
  let pageToken;
  do {
    const res = await admin.auth().listUsers(1000, pageToken);
    for (const u of res.users) {
      out.push({
        uid: u.uid,
        email: u.email || null,
        displayName: u.displayName || null,
        created: u.metadata?.creationTime || null,
        lastSignIn: u.metadata?.lastSignInTime || null,
      });
    }
    pageToken = res.pageToken;
  } while (pageToken);
  return out;
}

async function exportUser(firebaseUid) {
  const userRef = db.collection("users").doc(firebaseUid);
  const userSnap = await userRef.get();
  const profile = userSnap.exists ? serialize(userSnap.data()) : {};

  const booksSnap = await userRef.collection("books").get();
  const books = [];
  for (const bookDoc of booksSnap.docs) {
    const book = serialize(bookDoc.data());
    book.id = bookDoc.id;
    const chars = await bookDoc.ref.collection("bibleCharacters").get();
    book.bibleCharacters = chars.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
    const places = await bookDoc.ref.collection("biblePlaces").get();
    book.biblePlaces = places.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
    books.push(book);
  }

  async function sub(name) {
    const snap = await userRef.collection(name).get();
    return snap.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
  }

  return {
    id: firebaseUid,
    profile,
    books,
    notebookVault: await sub("notebookVault"),
    promptEntries: await sub("promptEntries"),
    worldbuilding: await sub("worldbuilding"),
    worldbuildingSheets: await sub("worldbuildingSheets"),
    characterProfileSheets: await sub("characterProfileSheets"),
    notifications: await sub("notifications"),
    betaSharesIndex: await sub("betaSharesIndex"),
  };
}

console.log("Exporting Firebase auth users...");
const authUsers = await listAuthUsers();
fs.writeFileSync(path.join(OUT, "auth-users.json"), JSON.stringify(authUsers, null, 2));

console.log("Exporting library collection...");
const libSnap = await db.collection("library").get();
const library = libSnap.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
fs.writeFileSync(path.join(OUT, "library.json"), JSON.stringify(library, null, 2));

console.log("Exporting users + subcollections...");
const usersSnap = await db.collection("users").get();
const usersFull = [];
let i = 0;
for (const doc of usersSnap.docs) {
  i++;
  process.stdout.write(`\r  user ${i}/${usersSnap.size} ${doc.id.slice(0, 12)}...`);
  usersFull.push(await exportUser(doc.id));
}
console.log("");

fs.writeFileSync(path.join(OUT, "users-full.json"), JSON.stringify(usersFull, null, 2));

const stats = {
  exportedAt: new Date().toISOString(),
  authUsers: authUsers.length,
  library: library.length,
  userProfiles: usersSnap.size,
  stats: {
    books: usersFull.reduce((n, u) => n + u.books.length, 0),
    chars: usersFull.reduce((n, u) => n + u.books.reduce((m, b) => m + (b.bibleCharacters?.length || 0), 0), 0),
    places: usersFull.reduce((n, u) => n + u.books.reduce((m, b) => m + (b.biblePlaces?.length || 0), 0), 0),
    vault: usersFull.reduce((n, u) => n + u.notebookVault.length, 0),
    wb: usersFull.reduce((n, u) => n + u.worldbuilding.length, 0),
    cps: usersFull.reduce((n, u) => n + u.characterProfileSheets.length, 0),
    notifs: usersFull.reduce((n, u) => n + u.notifications.length, 0),
  },
};
fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify(stats, null, 2));

console.log("DONE →", OUT);
console.log(JSON.stringify(stats, null, 2));
