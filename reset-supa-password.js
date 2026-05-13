import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://tiqmhozzxhiydjnyuuaw.supabase.co",
  "sb_secret_TdrwPyOL5EHyEBeH_fXzTQ_FBNJbjlX"
);

const email = "Romanovaanya03@gmail.com";
const newPassword = "Herobrine1991!";

const { data: users, error } = await supabase.auth.admin.listUsers();

if (error) throw error;

const user = users.users.find(
  u => (u.email || "").toLowerCase() === email.toLowerCase()
);

if (!user) {
  console.log("No user found for", email);
  process.exit(1);
}

const result = await supabase.auth.admin.updateUserById(user.id, {
  password: newPassword,
  email_confirm: true
});

console.log(result.error || "Password reset worked.");
console.log("Login with:", email, newPassword);
