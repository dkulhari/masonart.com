/**
 * Register Page - MasonArt E-commerce Platform
 *
 * User registration page with email/password and Google OAuth.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Loader2,
  Check,
} from 'lucide-react'
import { z } from 'zod'
import { cn, isValidEmail } from '~/lib/utils'
import { signIn, signUp } from '~/lib/auth-client'

// ============================================================================
// Route Definition
// ============================================================================

const searchParamsSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/auth/register')({
  validateSearch: searchParamsSchema,
  head: () => ({
    meta: [
      { title: 'Create Account | MasonArt' },
      {
        name: 'description',
        content: 'Create a MasonArt account to save your favorites, track orders, and get personalized recommendations.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: RegisterPage,
})

// ============================================================================
// Types
// ============================================================================

interface FormData {
  name: string
  email: string
  password: string
  confirmPassword: string
}

interface FormErrors {
  name?: string
  email?: string
  password?: string
  confirmPassword?: string
  general?: string
}

// ============================================================================
// Password Requirements
// ============================================================================

interface PasswordRequirement {
  label: string
  validator: (password: string) => boolean
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'At least 8 characters', validator: (p) => p.length >= 8 },
  { label: 'Contains a number', validator: (p) => /\d/.test(p) },
  { label: 'Contains a lowercase letter', validator: (p) => /[a-z]/.test(p) },
  { label: 'Contains an uppercase letter', validator: (p) => /[A-Z]/.test(p) },
]

// ============================================================================
// Main Component
// ============================================================================

function RegisterPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/auth/register' })
  const redirectUrl = search.redirect || '/'

  // Form state
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  // Check if password meets all requirements
  const passwordMeetsRequirements = PASSWORD_REQUIREMENTS.every((req) =>
    req.validator(formData.password)
  )

  // Validate form
  const validateForm = (data: FormData): FormErrors => {
    const newErrors: FormErrors = {}

    if (!data.name.trim()) {
      newErrors.name = 'Name is required'
    } else if (data.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }

    if (!data.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!isValidEmail(data.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!data.password) {
      newErrors.password = 'Password is required'
    } else if (!passwordMeetsRequirements) {
      newErrors.password = 'Password does not meet requirements'
    }

    if (!data.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (data.password !== data.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
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
    setTouched({ name: true, email: true, password: true, confirmPassword: true })

    // Validate
    const validationErrors = validateForm(formData)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      const result = await signUp.email({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      })

      if (result.error) {
        setErrors({ general: result.error.message || 'Registration failed' })
        return
      }

      // Redirect to login with success message
      navigate({
        to: '/auth/login',
        search: {
          redirect: redirectUrl,
          registered: true,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed'
      setErrors({ general: message })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Google sign-in
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    await signIn.social({
      provider: 'google',
      callbackURL: redirectUrl,
    })
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
              Create your account to get started.
            </p>
          </div>

          {/* Register Card */}
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            {/* Google Sign Up */}
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
              <span className="text-xs text-muted-foreground">or sign up with email</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* General Error */}
            {errors.general && (
              <div className="mb-6 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <p>{errors.general}</p>
              </div>
            )}

            {/* Register Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-foreground">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    onBlur={() => handleBlur('name')}
                    placeholder="Your full name"
                    autoComplete="name"
                    disabled={isLoading}
                    className={cn(
                      'w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      getFieldError('name')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-input hover:border-brand-300'
                    )}
                  />
                </div>
                {getFieldError('name') && (
                  <p className="mt-1 text-xs text-red-500">{getFieldError('name')}</p>
                )}
              </div>

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
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    onBlur={() => handleBlur('password')}
                    placeholder="Create a password"
                    autoComplete="new-password"
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

                {/* Password Requirements */}
                {formData.password && (
                  <div className="mt-2 space-y-1">
                    {PASSWORD_REQUIREMENTS.map((req, index) => {
                      const isMet = req.validator(formData.password)
                      return (
                        <div
                          key={index}
                          className={cn(
                            'flex items-center gap-2 text-xs',
                            isMet ? 'text-green-600' : 'text-muted-foreground'
                          )}
                        >
                          <Check
                            className={cn(
                              'h-3.5 w-3.5',
                              isMet ? 'text-green-500' : 'text-muted-foreground/50'
                            )}
                          />
                          {req.label}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-foreground">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    onBlur={() => handleBlur('confirmPassword')}
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                    disabled={isLoading}
                    className={cn(
                      'w-full rounded-lg border bg-background py-2.5 pl-10 pr-12 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      getFieldError('confirmPassword')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-input hover:border-brand-300'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {getFieldError('confirmPassword') && (
                  <p className="mt-1 text-xs text-red-500">{getFieldError('confirmPassword')}</p>
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
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Sign In Link */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <a
              href={`/auth/login${redirectUrl !== '/' ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`}
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              Sign in
            </a>
          </p>

          {/* Terms */}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            By creating an account, you agree to our{' '}
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
