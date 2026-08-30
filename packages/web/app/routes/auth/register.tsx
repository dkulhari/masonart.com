/**
 * Register Page - chobii.art E-commerce Platform
 *
 * User registration page with email/password and Google OAuth.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState } from 'react'
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
  Sparkles,
} from 'lucide-react'
import { cn, isValidEmail } from '~/lib/utils'
import { signIn, signUp } from '~/lib/auth-client'
import { useCartAuthTransition } from '~/hooks/useCartAuthTransition'
import { clearJoinIntent, setJoinIntent } from '~/lib/joinIntent'

// ============================================================================
// Route Definition
// ============================================================================

/** The value `?join=` carries when the sale offer sent the visitor here. */
export const GALLERY_JOIN_INTENT = 'gallery'

export interface RegisterSearch {
  /** Where to return the visitor once they have an account. */
  redirect?: string
  /** `gallery` when the join modal (#444) sent them; absent otherwise. */
  join?: string
  /** The address the modal already collected, so it is not asked for twice. */
  email?: string
}

/**
 * Turn raw search into typed params.
 *
 * Exported so it can be tested without a router, and hand-written rather than
 * left to a bare Zod object because getting it wrong is not a subtle failure:
 * `app/router.tsx` overrides TanStack's search serialisation, so every value
 * arrives as a STRING. A schema that assumes otherwise throws inside
 * `validateSearch`, and a throw there error-boundaries the whole route to a
 * blank page rather than degrading to an ordinary signup form.
 *
 * This is also the defect #444 walked into: the schema here validated
 * `{ redirect }` alone, so the `?join=gallery&email=…` the modal sends was
 * stripped on arrival and the offer dead-ended.
 */
export function parseRegisterSearch(
  search: Record<string, unknown>
): RegisterSearch {
  const text = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined
    if (typeof value === 'object') return undefined
    const asString = String(value)
    return asString === '' ? undefined : asString
  }

  const parsed: RegisterSearch = {}

  const redirect = text(search.redirect)
  if (redirect !== undefined) parsed.redirect = redirect

  const join = text(search.join)
  if (join !== undefined) parsed.join = join

  const email = text(search.email)
  if (email !== undefined) parsed.email = email

  return parsed
}

export const Route = createFileRoute('/auth/register')({
  validateSearch: parseRegisterSearch,
  head: () => ({
    meta: [
      { title: 'Create Account | chobii.art' },
      {
        name: 'description',
        content: 'Create a chobii.art account to save your favorites, track orders, and get personalized recommendations.',
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

export function RegisterPage() {
  const navigate = useNavigate()
  // Registration can establish a session directly (auto sign-in), so it is an
  // auth transition like any other and the cart has to be re-read (#511).
  const { onSignedIn } = useCartAuthTransition()
  const search = useSearch({ from: '/auth/register' })
  const redirectUrl = search.redirect || '/'

  /** The sale offer sent them here; they already said yes in the modal (#444). */
  const arrivedWithJoinIntent = search.join === GALLERY_JOIN_INTENT

  // Form state
  const [formData, setFormData] = useState<FormData>({
    name: '',
    // The modal already asked for this. Asking again is a field the visitor
    // has to fill twice, which is the cost minimal-field capture exists to
    // avoid (design §2).
    email: search.email ?? '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  /**
   * The gallery opt-in. UNCHECKED for someone who arrived the ordinary way —
   * consent that was never given is not consent, and a default-on marketing
   * box is exactly how a consent record becomes worthless. Arriving with
   * `?join=gallery` is a different case: the visitor already pressed join in
   * the modal, so the box shows the answer they gave rather than asking twice.
   */
  const [joinGallery, setJoinGallery] = useState(arrivedWithJoinIntent)

  /**
   * Mirror the box into a cookie, because the box itself does not survive what
   * happens next. Google sign-in is a full navigation to another origin and
   * back; this component and all of its state are gone by the time a session
   * exists. The API reads the cookie in better-auth's `session.create.after`
   * hook and joins with `joinSource: 'registration'` (#441).
   *
   * Written on arrival rather than at submit so the "Sign in" link works too:
   * a visitor who took the offer but already has an account still gets joined.
   * Unticking clears it — withdrawing has to actually withdraw.
   */
  useEffect(() => {
    if (joinGallery) setJoinIntent()
    else clearJoinIntent()
  }, [joinGallery])

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

      onSignedIn()
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
    onSignedIn()
    await signIn.social({
      provider: 'google',
      callbackURL: redirectUrl,
    })
  }

  const isFormValid = Object.keys(validateForm(formData)).length === 0

  /**
   * The intent itself rides the cookie, not this link — but carrying
   * `redirect` keeps a visitor who already has an account landing back where
   * the offer found them rather than on the home page.
   */
  const signInHref =
    redirectUrl !== '/'
      ? `/auth/login?redirect=${encodeURIComponent(redirectUrl)}`
      : '/auth/login'

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
              Create your account to get started.
            </p>
          </div>

          {/* Register Card */}
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            {/**
             * What joining unlocks, shown only to someone who arrived on the
             * offer. It names no discount of its own — the depth comes from
             * the active promotion (#432), and a number written down here
             * would keep advertising a sale after it changed or ended.
             */}
            {arrivedWithJoinIntent && (
              <div
                data-testid="gallery-join-unlock"
                className="mb-6 rounded-lg border border-border bg-muted/50 p-4"
              >
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Your member price is waiting
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>Member-only pricing unlocks the moment your account exists.</li>
                  <li>Early access to every drop and sale that follows.</li>
                  <li>One email when something worth knowing happens. Leave whenever.</li>
                </ul>
              </div>
            )}

            {/* Google Sign Up */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading}
              className={cn(
                'flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors',
                'hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
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
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      getFieldError('name')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-input hover:border-foreground/30'
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
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      getFieldError('email')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-input hover:border-foreground/30'
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
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      getFieldError('password')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-input hover:border-foreground/30'
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
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      getFieldError('confirmPassword')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-input hover:border-foreground/30'
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

              {/**
               * The gallery opt-in. Unchecked by default — see the state
               * declaration. It is a real checkbox with a real label rather
               * than a styled div so it is reachable by keyboard and readable
               * by a screen reader, which a consent control has to be.
               */}
              <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                <input
                  type="checkbox"
                  id="joinGallery"
                  data-testid="gallery-opt-in"
                  checked={joinGallery}
                  onChange={(e) => setJoinGallery(e.target.checked)}
                  disabled={isLoading}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
                <label
                  htmlFor="joinGallery"
                  className="cursor-pointer text-sm text-foreground"
                >
                  Join the gallery for member pricing
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Member-only prices, early access to drops, and the occasional
                    email. Leave whenever you like.
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !isFormValid}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                  isFormValid && !isLoading
                    ? 'bg-primary text-primary-foreground hover:bg-primary/85'
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
              href={signInHref}
              className="font-medium text-foreground hover:text-foreground/60"
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
