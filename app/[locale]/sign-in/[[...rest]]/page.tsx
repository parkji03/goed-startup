import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="grid place-items-center px-4 py-12">
      <SignIn />
    </div>
  );
}
