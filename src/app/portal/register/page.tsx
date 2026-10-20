import RegisterForm from "./register-form";

/**
 * Sign-up page. An affiliate's link is /portal/register?ref=CODE: the code is
 * filled in for the visitor (who can see and change it). Whether it counts is
 * decided on the server, against the register of codes.
 */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const { ref } = await searchParams;
  const initial = (Array.isArray(ref) ? ref[0] : ref) ?? "";
  return <RegisterForm initialReferralCode={initial.slice(0, 64).toUpperCase()} />;
}
