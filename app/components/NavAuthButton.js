'use client';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';

export default function NavAuthButton() {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) return null;

  return isSignedIn
    ? <Link href="/dashboard" style={{ textDecoration: 'none', color: 'inherit' }}>Dashboard</Link>
    : <Link href="/sign-in" style={{ textDecoration: 'none', color: 'inherit' }}>Sign In</Link>;
}
