/**
 * Login Page - MasonArt E-commerce Platform
 *
 * User authentication page with email/password and Google OAuth.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { z } from 'zod'
import { cn, isValidEmail, getApiUrl } from '~/lib/utils'
import { signIn } from '~/lib/auth-client'

// ============================================================================
// Route Definition
// ============================================================================

const searchParamsSchema = z.object({
  redirect: z.string().optional(),
  registered: z.boolean().optional(),
})

export const Route = createFileRoute('/auth/login')({
  validateSearch: searchParamsSchema,
  head: () => ({
    meta: [
      { title: 'Sign In | MasonArt' },
      {
        name: 'description',
        content: 'Sign in to your MasonArt account to access your orders, wishlist, and more.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: LoginPage,
})

// ============================================================================
// Types
// ============================================================================

interface FormData {
  email: string
  password: string
}

interface FormErrors {
  email?: string
  password?: string
  general?: string
}

// ============================================================================
// Main Component
// ============================================================================

function LoginPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/auth/login' })
  const redirectUrl = search.redirect || '/'
  const justRegistered = search.registered

  // Form state
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  // Validate form
  const validateForm = (data: FormData): FormErrors => {
    const newErrors: FormErrors = {}

    if (!data.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!isValidEmail(data.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!data.password) {
      newErrors.password = 'Password is required'
    } else if (data.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    return newErrors
  }

  // Handle field change
  const handleChange = (field: keyof FormData, value: string) => {
    const newData = { ...formData, [field]: value }
    setFormData(newData)

    // Clear general error on any input change
    if (errors.general) {
      setErrors((prev) => ({ ...prev, general: undefined }))
    }
  }

  // Handle field blur
  const handleBlur = (field: keyof FormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    const newErrors = validateForm(formData)
    setErrors((prev) => ({
      ...prev,
      [field]: newErrors[field],
    }))
  }

  // Get field error (only show if touched)
  const getFieldError = (field: keyof FormErrors) => {
    return touched[field] ? errors[field] : undefined
  }

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Touch all fields
    setTouched({ email: true, password: true })

    // Validate
    const validationErrors = validateForm(formData)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      const result = await signIn.email({
        email: formData.email,
        password: formData.password,
      })

      if (result.error) {
        setErrors({ general: result.error.message || 'Sign in failed' })
        return
      }

      // Redirect to intended destination
      navigate({ to: redirectUrl })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed'
      setErrors({ general: message })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Google sign-in
  const handleGoogleSignIn = () => {
    setIsGoogleLoading(true)
    // Redirect to Google OAuth - Better Auth handles the flow
    const apiUrl = getApiUrl()
    const googleUrl = `${apiUrl}/api/auth/sign-in/social?provider=google`
    // Add redirect URL as state parameter (Better Auth will handle this)
    window.location.href = `${googleUrl}&redirectTo=${encodeURIComponent(redirectUrl)}`
  }

  const isFormValid = Object.keys(validateForm(formData)).length === 0

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide flex min-h-screen items-center justify-center py-12">
        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="mb-8 text-center">
            <a href="/" className="inline-block">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Mason<span className="text-brand-500">Art</span>
              </h1>
            </a>
            <p className="mt-2 text-sm text-muted-foreground">
              Welcome back! Sign in to continue.
            </p>
          </div>

          {/* Success Message (after registration) */}
          {justRegistered && (
            <div className="mb-6 flex items-center gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              <AlertCircle className="h-5 w-5 text-green-500" />
              <p>Account created successfully! Please sign in.</p>
            </div>
          )}

          {/* Login Card */}
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            {/* Google Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading}
              className={cn(
                'flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors',
                'hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {isGoogleLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              Continue with Google
            </button>

            {/* Divider */}
            <div className="my-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or sign in with email</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* General Error */}
            {errors.general && (
              <div className="mb-6 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <p>{errors.general}</p>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    onBlur={() => handleBlur('email')}
                    placeholder="your@email.com"
                    autoComplete="email"
                    disabled={isLoading}
                    className={cn(
                      'w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      getFieldError('email')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-input hover:border-brand-300'
                    )}
                  />
                </div>
                {getFieldError('email') && (
                  <p className="mt-1 text-xs text-red-500">{getFieldError('email')}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-foreground">
                    Password
                  </label>
                  <a
                    href="/auth/forgot-password"
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    onBlur={() => handleBlur('password')}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={isLoading}
                    className={cn(
                      'w-full rounded-lg border bg-background py-2.5 pl-10 pr-12 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      getFieldError('password')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-input hover:border-brand-300'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {getFieldError('password') && (
                  <p className="mt-1 text-xs text-red-500">{getFieldError('password')}</p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !isFormValid}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                  isFormValid && !isLoading
                    ? 'bg-brand-500 text-white hover:bg-brand-600'
                    : 'cursor-not-allowed bg-muted text-muted-foreground'
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Sign Up Link */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <a
              href={`/auth/register${redirectUrl !== '/' ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`}
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              Create account
            </a>
          </p>

          {/* Terms */}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            By signing in, you agree to our{' '}
            <a href="/terms" className="underline hover:text-foreground">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
