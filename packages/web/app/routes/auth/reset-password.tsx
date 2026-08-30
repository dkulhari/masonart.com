/**
 * Reset Password Page - chobii.art E-commerce Platform
 *
 * Completes the password-reset flow (#242): Better Auth's emailed link
 * redirects here with ?token=... (or ?error=INVALID_TOKEN when the link is
 * expired/used). Submits the new password with the token.
 *
 * Following patterns from routes/auth/login.tsx
 */

import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Lock, Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { z } from 'zod'
import { cn } from '~/lib/utils'
import { authClient } from '~/lib/auth-client'

const searchParamsSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute('/auth/reset-password')({
  validateSearch: searchParamsSchema,
  head: () => ({
    meta: [
      { title: 'Reset Password | chobii.art' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const invalidLink = Boolean(linkError) || !token

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (!token) return

    setIsLoading(true)
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      })
      if (resetError) {
        setError(
          resetError.message ||
            'This reset link is invalid or has expired. Please request a new one.'
        )
        return
      }
      setIsDone(true)
      setTimeout(() => navigate({ to: '/auth/login' }), 2500)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide flex min-h-screen items-center justify-center py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <a href="/" className="inline-block">
              <h1 className="text-3xl tracking-tight text-foreground">
                chobii.art
              </h1>
            </a>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a new password
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            {invalidLink ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
                <h2 className="text-lg text-foreground">
                  Invalid or expired link
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  This password reset link is invalid or has expired. Reset
                  links are valid for one hour.
                </p>
                <a
                  href="/auth/forgot-password"
                  className="mt-6 inline-block text-sm font-medium text-foreground hover:text-foreground/60"
                >
                  Request a new link
                </a>
              </div>
            ) : isDone ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-lg text-foreground">
                  Password updated
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your password has been reset. Redirecting you to sign in…
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
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
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  New password
                </label>
                <div className="relative mb-4">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="h-12 w-full rounded-lg border border-border bg-background pl-11 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>

                <label
                  htmlFor="confirm"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Confirm new password
                </label>
                <div className="relative mb-6">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="confirm"
                    name="confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat your new password"
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
                    'Reset Password'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResetPasswordPage
