import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/reset-password';
  const errorDescription = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error');

  // If Supabase returned an explicit error in query params (e.g. expired link)
  if (errorDescription) {
    const errorRedirect = new URL(next, request.url);
    errorRedirect.searchParams.set('error', errorDescription);
    return NextResponse.redirect(errorRedirect);
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        // Successfully exchanged recovery/auth code for authenticated session
        const forwardUrl = new URL(next, request.url);
        return NextResponse.redirect(forwardUrl);
      } else {
        const errorRedirect = new URL(next, request.url);
        errorRedirect.searchParams.set('error', error.message);
        return NextResponse.redirect(errorRedirect);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication callback failed.';
      const errorRedirect = new URL(next, request.url);
      errorRedirect.searchParams.set('error', message);
      return NextResponse.redirect(errorRedirect);
    }
  }

  // If no code is present, forward to the target destination (e.g. client handles hash fragment or shows state)
  const fallbackUrl = new URL(next, request.url);
  return NextResponse.redirect(fallbackUrl);
}
