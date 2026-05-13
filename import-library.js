import fs from "fs";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tiqmhozzxhiydjnyuuaw.supabase.co";
const SUPABASE_SECRET = "sb_secret_TdrwPyOL5EHyEBeH_fXzTQ_FBNJbjlX";

const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET);

const snap = await db.collection("library").get();

let imported = 0;

for (const doc of snap.docs) {
  const data = doc.data();

  const userId =
    data.user_id ||
    data.ownerUid ||
    data.owner_uid ||
    null;

  const { error } = await supabase.from("library").upsert({
    id: doc.id,
    user_id: userId,
    data: {
      ...data,
      bookId: data.bookId || doc.id,
      isPublished: data.isPublished !== false
    }
  });

  if (error) {
    console.error("Library import failed:", doc.id, error);
  } else {
    imported++;
    console.log("Imported:", data.title || doc.id);
  }
}

console.log("DONE. Imported library stories:", imported);
