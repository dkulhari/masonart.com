/**
 * Forgot Password Page - chobii.art E-commerce Platform
 *
 * Requests a password-reset email via Better Auth (#242). Always shows the
 * same success state whether or not the account exists (no enumeration).
 *
 * Following patterns from routes/auth/login.tsx
 */

import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Mail, ArrowRight, AlertCircle, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import { cn, isValidEmail } from '~/lib/utils'
import { authClient } from '~/lib/auth-client'

export const Route = createFileRoute('/auth/forgot-password')({
  head: () => ({
    meta: [
      { title: 'Forgot Password | chobii.art' },
      {
        name: 'description',
        content: 'Reset your chobii.art account password.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address')
      return
    }

    setIsLoading(true)
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: '/auth/reset-password',
      })
      // Always succeed visually — never reveal whether the account exists
      setIsSubmitted(true)
    } catch {
      // Request-level failure (network, 5xx) — safe to surface
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide flex min-h-screen items-center justify-center py-12">
        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="mb-8 text-center">
            <a href="/" className="inline-block">
              <h1 className="text-3xl tracking-tight text-foreground">
                chobii.art
              </h1>
            </a>
            <p className="mt-2 text-sm text-muted-foreground">
              Reset your password
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            {isSubmitted ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  Check your email
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  If an account exists for <strong>{email}</strong>, we&apos;ve
                  sent a link to reset your password. The link expires in one
                  hour.
                </p>
                <a
                  href="/auth/login"
                  className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/60"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <p className="mb-6 text-sm text-muted-foreground">
                  Enter the email address for your account and we&apos;ll send
                  you a link to reset your password.
                </p>

                {error && (
                  <div
                    role="alert"
                    className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
                    {error}
                  </div>
                )}

                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <div className="relative mb-6">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-12 w-full rounded-lg border border-border bg-background pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white transition-colors',
                    'hover:bg-primary/85 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Send Reset Link
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Remembered it?{' '}
                  <a
                    href="/auth/login"
                    className="font-medium text-foreground hover:text-foreground/60"
                  >
                    Back to sign in
                  </a>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
