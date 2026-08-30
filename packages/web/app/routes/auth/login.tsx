/**
 * Login Page - chobii.art E-commerce Platform
 *
 * User authentication page with email/password, phone OTP, and Google OAuth.
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
  Phone,
  KeyRound,
} from 'lucide-react'
import { z } from 'zod'
import { cn, isValidEmail, getApiUrl } from '~/lib/utils'
import { signIn } from '~/lib/auth-client'
import { useCartAuthTransition } from '~/hooks/useCartAuthTransition'

// ============================================================================
// Route Definition
// ============================================================================

const searchParamsSchema = z.object({
  redirect: z.string().optional(),
  registered: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
})

export const Route = createFileRoute('/auth/login')({
  validateSearch: searchParamsSchema,
  head: () => ({
    meta: [
      { title: 'Sign In | chobii.art' },
      {
        name: 'description',
        content: 'Sign in to your chobii.art account to access your orders, wishlist, and more.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: LoginPage,
})

// ============================================================================
// Types
// ============================================================================

type LoginMethod = 'email' | 'phone'

interface EmailFormData {
  email: string
  password: string
}

interface PhoneFormData {
  phone: string
  otp: string
  name: string
}

interface FormErrors {
  email?: string
  password?: string
  phone?: string
  otp?: string
  general?: string
}

// ============================================================================
// Main Component
// ============================================================================

export function LoginPage() {
  const navigate = useNavigate()
  // Whoever signs in here inherits whatever they put in the cart as a guest —
  // but only if something asks the server for the cart, which is the one thing
  // a client-side navigate() back to checkout does not do (#511).
  const { onSignedIn } = useCartAuthTransition()
  const search = useSearch({ from: '/auth/login' })
  const redirectUrl = search.redirect || '/'
  const justRegistered = search.registered

  // Login method state
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email')

  // Email form state
  const [emailFormData, setEmailFormData] = useState<EmailFormData>({
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)

  // Phone form state
  const [phoneFormData, setPhoneFormData] = useState<PhoneFormData>({
    phone: '',
    otp: '',
    name: '',
  })
  const [otpSent, setOtpSent] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isExistingUser, setIsExistingUser] = useState(true)
  const [resendTimer, setResendTimer] = useState(0)

  // Common state
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  // ============================================================================
  // Email Login Handlers
  // ============================================================================

  const validateEmailForm = (data: EmailFormData): FormErrors => {
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

  const handleEmailChange = (field: keyof EmailFormData, value: string) => {
    setEmailFormData((prev) => ({ ...prev, [field]: value }))
    if (errors.general) {
      setErrors((prev) => ({ ...prev, general: undefined }))
    }
  }

  const handleEmailBlur = (field: keyof EmailFormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    const newErrors = validateEmailForm(emailFormData)
    setErrors((prev) => ({
      ...prev,
      [field]: newErrors[field as keyof FormErrors],
    }))
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ email: true, password: true })

    const validationErrors = validateEmailForm(emailFormData)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      const result = await signIn.email({
        email: emailFormData.email,
        password: emailFormData.password,
      })

      if (result.error) {
        setErrors({ general: result.error.message || 'Sign in failed' })
        return
      }

      onSignedIn()
      navigate({ to: redirectUrl })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed'
      setErrors({ general: message })
    } finally {
      setIsLoading(false)
    }
  }

  // ============================================================================
  // Phone Login Handlers
  // ============================================================================

  const validatePhone = (phone: string): string | undefined => {
    const cleaned = phone.replace(/\D/g, '')
    if (!cleaned) {
      return 'Phone number is required'
    }
    // Remove country code if present
    const phoneDigits = cleaned.startsWith('91') && cleaned.length === 12
      ? cleaned.slice(2)
      : cleaned
    if (phoneDigits.length !== 10) {
      return 'Please enter a valid 10-digit phone number'
    }
    if (!['6', '7', '8', '9'].includes(phoneDigits.charAt(0))) {
      return 'Please enter a valid Indian mobile number'
    }
    return undefined
  }

  const handlePhoneChange = (field: keyof PhoneFormData, value: string) => {
    setPhoneFormData((prev) => ({ ...prev, [field]: value }))
    if (errors.general) {
      setErrors((prev) => ({ ...prev, general: undefined }))
    }
  }

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()

    const phoneError = validatePhone(phoneFormData.phone)
    if (phoneError) {
      setErrors({ phone: phoneError })
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      const apiUrl = getApiUrl()
      const response = await fetch(`${apiUrl}/api/phone-auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: phoneFormData.phone }),
      })

      const data = await response.json()

      if (!data.success) {
        setErrors({ general: data.error || 'Failed to send OTP' })
        return
      }

      setSessionId(data.sessionId)
      setIsExistingUser(data.isExistingUser)
      setOtpSent(true)
      startResendTimer()
    } catch (error) {
      setErrors({ general: 'Failed to send OTP. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()

    if (phoneFormData.otp.length !== 6) {
      setErrors({ otp: 'Please enter the 6-digit OTP' })
      return
    }

    if (!isExistingUser && !phoneFormData.name.trim()) {
      setErrors({ general: 'Please enter your name' })
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      const apiUrl = getApiUrl()
      const response = await fetch(`${apiUrl}/api/phone-auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          phone: phoneFormData.phone,
          otp: phoneFormData.otp,
          sessionId,
          name: phoneFormData.name || undefined,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        setErrors({ general: data.error || 'Invalid OTP' })
        return
      }

      onSignedIn()
      // Redirect to intended destination
      navigate({ to: redirectUrl })
    } catch (error) {
      setErrors({ general: 'Verification failed. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOTP = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setErrors({})

    try {
      const apiUrl = getApiUrl()
      const response = await fetch(`${apiUrl}/api/phone-auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: phoneFormData.phone }),
      })

      const data = await response.json()

      if (!data.success) {
        if (data.retryAfter) {
          setResendTimer(data.retryAfter)
        }
        setErrors({ general: data.error || 'Failed to resend OTP' })
        return
      }

      setSessionId(data.sessionId)
      startResendTimer()
    } catch (error) {
      setErrors({ general: 'Failed to resend OTP' })
    } finally {
      setIsLoading(false)
    }
  }

  const startResendTimer = () => {
    setResendTimer(30)
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleBackToPhone = () => {
    setOtpSent(false)
    setSessionId(null)
    setPhoneFormData((prev) => ({ ...prev, otp: '' }))
    setErrors({})
  }

  // ============================================================================
  // Google Login Handler
  // ============================================================================

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    onSignedIn()
    await signIn.social({
      provider: 'google',
      callbackURL: redirectUrl,
    })
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  const getFieldError = (field: keyof FormErrors) => {
    return touched[field] ? errors[field] : undefined
  }

  const isEmailFormValid = Object.keys(validateEmailForm(emailFormData)).length === 0
  const isPhoneValid = !validatePhone(phoneFormData.phone)

  // ============================================================================
  // Render
  // ============================================================================

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
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Login Method Tabs */}
            <div className="mb-6 flex rounded-lg border border-border bg-muted/50 p-1">
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('email')
                  setErrors({})
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  loginMethod === 'email'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Mail className="h-4 w-4" />
                Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('phone')
                  setErrors({})
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  loginMethod === 'phone'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Phone className="h-4 w-4" />
                Phone
              </button>
            </div>

            {/* General Error */}
            {errors.general && (
              <div className="mb-6 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <p>{errors.general}</p>
              </div>
            )}

            {/* Email Login Form */}
            {loginMethod === 'email' && (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
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
                      value={emailFormData.email}
                      onChange={(e) => handleEmailChange('email', e.target.value)}
                      onBlur={() => handleEmailBlur('email')}
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
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="password" className="block text-sm font-medium text-foreground">
                      Password
                    </label>
                    <a
                      href="/auth/forgot-password"
                      className="text-xs font-medium text-foreground hover:text-foreground/60"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={emailFormData.password}
                      onChange={(e) => handleEmailChange('password', e.target.value)}
                      onBlur={() => handleEmailBlur('password')}
                      placeholder="Enter your password"
                      autoComplete="current-password"
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
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading || !isEmailFormValid}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    isEmailFormValid && !isLoading
                      ? 'bg-primary text-primary-foreground hover:bg-primary/85'
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
            )}

            {/* Phone Login Form */}
            {loginMethod === 'phone' && !otpSent && (
              <form onSubmit={handleSendOTP} className="space-y-4">
                {/* Phone Number */}
                <div>
                  <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-foreground">
                    Phone Number
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-muted-foreground">
                      <span className="text-sm">+91</span>
                    </div>
                    <input
                      type="tel"
                      id="phone"
                      value={phoneFormData.phone}
                      onChange={(e) => handlePhoneChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9876543210"
                      autoComplete="tel"
                      disabled={isLoading}
                      className={cn(
                        'w-full rounded-lg border bg-background py-2.5 pl-14 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        errors.phone
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-input hover:border-foreground/30'
                      )}
                    />
                  </div>
                  {errors.phone && (
                    <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
                  )}
                </div>

                {/* Send OTP Button */}
                <button
                  type="submit"
                  disabled={isLoading || !isPhoneValid}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    isPhoneValid && !isLoading
                      ? 'bg-primary text-primary-foreground hover:bg-primary/85'
                      : 'cursor-not-allowed bg-muted text-muted-foreground'
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    <>
                      Send OTP
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* OTP Verification Form */}
            {loginMethod === 'phone' && otpSent && (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                {/* OTP Sent Message */}
                <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                  <p>
                    OTP sent to{' '}
                    <span className="font-medium">
                      +91 {phoneFormData.phone.slice(0, 2)}****{phoneFormData.phone.slice(-4)}
                    </span>
                  </p>
                </div>

                {/* Name Field (for new users) */}
                {!isExistingUser && (
                  <div>
                    <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-foreground">
                      Your Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      value={phoneFormData.name}
                      onChange={(e) => handlePhoneChange('name', e.target.value)}
                      placeholder="Enter your name"
                      disabled={isLoading}
                      className={cn(
                        'w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        'border-input hover:border-foreground/30'
                      )}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      This is your first time. Please enter your name.
                    </p>
                  </div>
                )}

                {/* OTP Input */}
                <div>
                  <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-foreground">
                    Enter OTP
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      id="otp"
                      value={phoneFormData.otp}
                      onChange={(e) => handlePhoneChange('otp', e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter 6-digit OTP"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      disabled={isLoading}
                      className={cn(
                        'w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors tracking-widest',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        errors.otp
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-input hover:border-foreground/30'
                      )}
                    />
                  </div>
                  {errors.otp && (
                    <p className="mt-1 text-xs text-red-500">{errors.otp}</p>
                  )}
                </div>

                {/* Resend OTP */}
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={handleBackToPhone}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Change number
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOTP}
                    disabled={resendTimer > 0 || isLoading}
                    className={cn(
                      'font-medium',
                      resendTimer > 0 || isLoading
                        ? 'cursor-not-allowed text-muted-foreground'
                        : 'text-foreground hover:text-foreground/60'
                    )}
                  >
                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                  </button>
                </div>

                {/* Verify Button */}
                <button
                  type="submit"
                  disabled={isLoading || phoneFormData.otp.length !== 6}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    phoneFormData.otp.length === 6 && !isLoading
                      ? 'bg-primary text-primary-foreground hover:bg-primary/85'
                      : 'cursor-not-allowed bg-muted text-muted-foreground'
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify & Sign In
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Sign Up Link */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <a
              href={`/auth/register${redirectUrl !== '/' ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`}
              className="font-medium text-foreground hover:text-foreground/60"
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
