import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requireMember } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your team" };

export default async function AccountPage() {
  const { profile } = await requireMember();
  return (
    <>
      <PageHeader title="Your team" subtitle="Change your team name or the name shown in the league." />
      <ProfileForm teamName={profile.team_name ?? ""} displayName={profile.display_name} />
    </>
  );
}
