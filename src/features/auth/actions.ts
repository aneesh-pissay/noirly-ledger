"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";

export async function signOutAction() {
  await signOut({ redirect: false });
  // Relative, so Next renders /login into this action's response. Auth.js's
  // own redirect is an absolute URL, which Next treats as external and follows
  // with a second, full page load.
  redirect("/login");
}
