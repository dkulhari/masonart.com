/**
 * AI Generator Page - chobii.art E-commerce Platform
 *
 * Create custom AI-generated posters with:
 * - Text prompt input with examples
 * - Style preset selection
 * - Aspect ratio selection
 * - Real-time generation progress
 * - Image selection and cart integration
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Sparkles, Wand2, HelpCircle, Loader2, Wallet, Gift, AlertCircle } from 'lucide-react'

import { cn, formatPrice } from '~/lib/utils'
import { aiApi, walletApi, type WalletBalance, type CostEstimate } from '~/lib/api'
import { AddFundsButton } from '~/components/wallet/AddFundsButton'
import { PromptInput } from '~/components/ai-generator/PromptInput'
import {
  StyleSelector,
  type StylePreset,
  type AspectRatio,
} from '~/components/ai-generator/StyleSelector'
import {
  GenerationResults,
  type Generation,
  type GenerationStatus,
  type GeneratedImage,
} from '~/components/ai-generator/GenerationResults'

// ============================================================================
// Types
// ============================================================================

interface AIGenerationResponse {
  message: string
  generation: {
    id: string
    status: string
    stylePreset: string
    aspectRatio: string
    variationCount: number
    queuedAt: string
  }
  jobId: string
}

interface AIGenerationStatusResponse {
  id: string
  status: GenerationStatus
  images: GeneratedImage[] | null
  selectedImageId: string | null
  selectedImageUrl: string | null
  processingTimeMs: number | null
  errorMessage: string | null
  timestamps: {
    createdAt: string
    queuedAt: string | null
    processingStartedAt: string | null
    completedAt: string | null
  }
}

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/create/')({
  head: () => ({
    meta: [
      { title: 'Create AI Poster | chobii.art' },
      {
        name: 'description',
        content:
          'Create unique, custom posters using AI. Choose from various styles like Wabi-Sabi, Abstract, Botanical, and more.',
      },
      { property: 'og:title', content: 'Create AI Poster | chobii.art' },
      {
        property: 'og:description',
        content:
          'Create unique, custom posters using AI. Choose from various styles.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://chobii.art/create' },
      { property: 'og:image', content: 'https://chobii.art/og-default.jpg' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: 'https://chobii.art/og-default.jpg' },
    ],
    links: [{ rel: 'canonical', href: 'https://chobii.art/create' }],
  }),
  component: CreatePage,
})

// ============================================================================
// Main Component
// ============================================================================

function CreatePage() {
  // Get session from route context if available
  const routeContext = useRouteContext({ from: '__root__' })
  const session = routeContext?.session
  const user = session?.user

  // Form state
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [selectedStyle, setSelectedStyle] = useState<StylePreset>('wabi-sabi')
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('portrait')

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentGeneration, setCurrentGeneration] = useState<Generation | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Wallet state
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null)
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)

  // Polling reference
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  // Fetch wallet balance when user is logged in
  useEffect(() => {
    if (!user) {
      setWalletBalance(null)
      return
    }

    async function fetchWalletData() {
      setIsLoadingWallet(true)
      try {
        const [balance, cost] = await Promise.all([
          walletApi.getBalance(),
          walletApi.estimateCost({ variationCount: 4 }),
        ])
        setWalletBalance(balance)
        setCostEstimate(cost)
      } catch (err) {
        console.error('Failed to fetch wallet data:', err)
      } finally {
        setIsLoadingWallet(false)
      }
    }

    fetchWalletData()
  }, [user])

  // Refresh wallet balance after successful payment
  const handleWalletTopUpSuccess = useCallback((newBalance: number) => {
    setWalletBalance((prev) =>
      prev ? { ...prev, balancePaise: newBalance } : null
    )
  }, [])

  // Poll for generation status
  const pollGenerationStatus = useCallback(async (generationId: string) => {
    try {
      const status: AIGenerationStatusResponse = await aiApi.getGenerationStatus(generationId)

      // Update progress based on status
      if (status.status === 'queued') {
        setProgress(10)
        setProgressMessage('Waiting in queue...')
      } else if (status.status === 'processing') {
        setProgress(50)
        setProgressMessage('AI is generating your poster...')
      } else if (status.status === 'completed') {
        setProgress(100)
        setProgressMessage('Complete!')
        setIsGenerating(false)

        // Update generation with results
        setCurrentGeneration((prev) =>
          prev
            ? {
                ...prev,
                status: 'completed',
                images: status.images || [],
                selectedImageId: status.selectedImageId || undefined,
                selectedImageUrl: status.selectedImageUrl || undefined,
                processingTimeMs: status.processingTimeMs || undefined,
                completedAt: status.timestamps.completedAt || undefined,
              }
            : null
        )

        // Refresh wallet balance after generation
        if (user) {
          walletApi.getBalance().then(setWalletBalance).catch(console.error)
        }

        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
      } else if (status.status === 'failed') {
        setIsGenerating(false)
        setError(status.errorMessage || 'Generation failed')

        // Update generation with error
        setCurrentGeneration((prev) =>
          prev
            ? {
                ...prev,
                status: 'failed',
                errorMessage: status.errorMessage || 'Generation failed',
              }
            : null
        )

        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
      } else if (status.status === 'cancelled') {
        setIsGenerating(false)
        setCurrentGeneration((prev) =>
          prev ? { ...prev, status: 'cancelled' } : null
        )

        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
      }
    } catch (err) {
      // Don't stop polling on individual errors, but log them
      console.error('Error polling generation status:', err)
    }
  }, [])

  // Handle generate button click
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt')
      return
    }

    setError(null)
    setIsGenerating(true)
    setProgress(0)
    setProgressMessage('Submitting request...')

    try {
      const response: AIGenerationResponse = await aiApi.generate({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        stylePreset: selectedStyle,
        aspectRatio: selectedAspectRatio,
      })

      // Create initial generation object
      const newGeneration: Generation = {
        id: response.generation.id,
        promptText: prompt.trim(),
        stylePreset: response.generation.stylePreset,
        aspectRatio: response.generation.aspectRatio,
        status: response.generation.status as GenerationStatus,
        images: [],
        createdAt: response.generation.queuedAt,
      }

      setCurrentGeneration(newGeneration)
      setProgress(10)
      setProgressMessage('In queue...')

      // Start polling for status
      pollingIntervalRef.current = setInterval(() => {
        pollGenerationStatus(response.generation.id)
      }, 2000)
    } catch (err) {
      setIsGenerating(false)
      setError(err instanceof Error ? err.message : 'Failed to start generation')
    }
  }, [prompt, negativePrompt, selectedStyle, selectedAspectRatio, pollGenerationStatus])

  // Handle image selection
  const handleSelectImage = useCallback(
    async (_generationId: string, imageId: string) => {
      try {
        // Optimistically update UI
        setCurrentGeneration((prev) => {
          if (!prev) return null
          const selectedImage = prev.images.find((img) => img.id === imageId)
          return {
            ...prev,
            selectedImageId: imageId,
            selectedImageUrl: selectedImage?.imageUrl,
            images: prev.images.map((img) => ({
              ...img,
              isSelected: img.id === imageId,
            })),
          }
        })

        // Call API to persist selection
        // Note: This would typically be an API call
        // await aiApi.selectImage(_generationId, imageId);
      } catch (err) {
        console.error('Failed to select image:', err)
      }
    },
    []
  )

  // Handle add to cart
  const handleAddToCart = useCallback(
    (generation: Generation) => {
      if (!generation.selectedImageUrl) {
        setError('Please select an image first')
        return
      }

      // TODO: Navigate to product creation/cart flow
      // For now, just log
      console.log('Add to cart:', {
        generationId: generation.id,
        imageUrl: generation.selectedImageUrl,
        stylePreset: generation.stylePreset,
      })

      // Could navigate to a product customization page
      // navigate({ to: '/create/customize', search: { generationId: generation.id } })
    },
    []
  )

  // Handle retry
  const handleRetry = useCallback(() => {
    setError(null)
    setCurrentGeneration(null)
    setProgress(0)
    // User can click Generate again
  }, [])

  // Handle generate variations
  const handleGenerateVariations = useCallback(() => {
    // Keep the same prompt/style but regenerate
    handleGenerate()
  }, [handleGenerate])

  // Check if form is valid
  const isFormValid = prompt.trim().length >= 3 && prompt.trim().length <= 500

  // On mobile the inline Generate button sits ~3 screens down, below 15 style
  // presets and the ratio picker, so the primary action is invisible for most
  // of the flow (#356). A sticky bar surfaces it — but only while the real
  // button is off-screen, so the two never compete.
  const inlineGenerateRef = useRef<HTMLButtonElement>(null)
  const [isInlineGenerateVisible, setIsInlineGenerateVisible] = useState(true)

  useEffect(() => {
    const target = inlineGenerateRef.current
    if (!target || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => setIsInlineGenerateVisible(entry?.isIntersecting ?? true),
      { rootMargin: '0px 0px -80px 0px' }
    )
    observer.observe(target)

    return () => observer.disconnect()
  }, [])

  return (
    // Bottom padding on mobile reserves room for the sticky generate bar so
    // it never covers the last of the page content.
    <div className="flex flex-col pb-24 md:pb-0">
      {/* Page Header */}
      <section className="border-b border-border bg-gradient-to-br from-primary/5 via-background to-primary/10 py-8 sm:py-12">
        <div className="container-wide">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Create AI Poster
              </h1>
              <p className="text-sm text-muted-foreground">
                Describe your vision and let AI bring it to life
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="container-wide py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left Column - Form */}
          <div className="flex flex-col gap-8">
            {/* Prompt Input */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <PromptInput
                prompt={prompt}
                onPromptChange={setPrompt}
                negativePrompt={negativePrompt}
                onNegativePromptChange={setNegativePrompt}
                disabled={isGenerating}
              />
            </div>

            {/* Style and Aspect Ratio Selection */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <StyleSelector
                selectedStyle={selectedStyle}
                onStyleChange={setSelectedStyle}
                selectedAspectRatio={selectedAspectRatio}
                onAspectRatioChange={setSelectedAspectRatio}
                hasPremiumAccess={false} // TODO: Get from auth context
                disabled={isGenerating}
              />
            </div>

            {/* Generate Button */}
            <div className="flex flex-col gap-4">
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Wallet & Cost Preview */}
              {user && (
                <CostPreviewCard
                  walletBalance={walletBalance}
                  costEstimate={costEstimate}
                  isLoading={isLoadingWallet}
                  onTopUpSuccess={handleWalletTopUpSuccess}
                  userDetails={{
                    name: user.name,
                    email: user.email,
                  }}
                />
              )}

              {/* Insufficient Balance Warning */}
              {user &&
                walletBalance &&
                costEstimate &&
                !costEstimate.canUseFreeGeneration &&
                walletBalance.balance.paise < costEstimate.cost.userPricePaise && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-800">
                          Insufficient balance
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          You need {formatPrice(costEstimate.cost.userPricePaise - walletBalance.balance.paise)} more to generate.
                        </p>
                        <div className="mt-3">
                          <AddFundsButton
                            amountPaise={Math.max(10000, costEstimate.cost.userPricePaise - walletBalance.balance.paise)}
                            label="Add Funds"
                            onSuccess={handleWalletTopUpSuccess}
                            userDetails={{
                              name: user.name,
                              email: user.email,
                            }}
                            variant="compact"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              <button
                ref={inlineGenerateRef}
                type="button"
                onClick={handleGenerate}
                disabled={!isFormValid || isGenerating || !!(user && walletBalance && costEstimate && !costEstimate.canUseFreeGeneration && walletBalance.balance.paise < costEstimate.cost.userPricePaise)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg px-8 py-4 text-base font-semibold transition-all',
                  isFormValid && !isGenerating
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30'
                    : 'cursor-not-allowed bg-muted text-muted-foreground'
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-5 w-5" />
                    Generate Poster
                  </>
                )}
              </button>

              <p className="text-center text-xs text-muted-foreground">
                Each generation creates 4 unique variations
              </p>
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <GenerationResults
                currentGeneration={currentGeneration}
                isGenerating={isGenerating}
                progress={progress}
                progressMessage={progressMessage}
                onSelectImage={handleSelectImage}
                onAddToCart={handleAddToCart}
                onRetry={handleRetry}
                onGenerateVariations={handleGenerateVariations}
              />
            </div>

            {/* Tips Section */}
            <TipsSection />
          </div>
        </div>
      </div>

      {/* Sticky mobile generate bar (#356).
       *
       * Mirrors the "Apply Filters" affordance on /posters. Shown only while
       * the inline button is scrolled out of view, so there is never a pair of
       * competing CTAs, and it doubles as a readout of the current selection —
       * otherwise nothing on screen confirms a style was picked.
       */}
      {!isInlineGenerateVisible && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-[0_-4px_16px_rgb(0_0_0_/_8%)] backdrop-blur md:hidden">
          <div className="container-wide flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {formatPresetLabel(selectedStyle)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatPresetLabel(selectedAspectRatio)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={
                !isFormValid ||
                isGenerating ||
                !!(
                  user &&
                  walletBalance &&
                  costEstimate &&
                  !costEstimate.canUseFreeGeneration &&
                  walletBalance.balance.paise < costEstimate.cost.userPricePaise
                )
              }
              className={cn(
                'flex flex-shrink-0 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all',
                isFormValid && !isGenerating
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                  : 'cursor-not-allowed bg-muted text-muted-foreground'
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Turn a kebab-case preset id into something readable ("wabi-sabi" ->
 * "Wabi Sabi") for the compact mobile readout.
 */
function formatPresetLabel(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

// ============================================================================
// Tips Section Component
// ============================================================================

function TipsSection() {
  const tips = [
    {
      title: 'Be Descriptive',
      description:
        'Include details about colors, mood, composition, and lighting for better results.',
    },
    {
      title: 'Try Different Styles',
      description:
        'Each style has unique characteristics. Experiment to find your favorite.',
    },
    {
      title: 'Use Negative Prompts',
      description:
        "Specify what you don't want to refine the output. E.g., 'no text, no people'.",
    },
    {
      title: 'Iterate',
      description:
        "Don't settle on the first result. Generate variations and refine your prompt.",
    },
  ]

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-6">
      <div className="mb-4 flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">Tips for Better Results</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {tips.map((tip, index) => (
          <div key={index} className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">{tip.title}</span>
            <span className="text-xs text-muted-foreground">{tip.description}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Cost Preview Card Component
// ============================================================================

interface CostPreviewCardProps {
  walletBalance: WalletBalance | null
  costEstimate: CostEstimate | null
  isLoading: boolean
  onTopUpSuccess: (newBalance: number) => void
  userDetails?: {
    name?: string
    email?: string
    phone?: string
  }
}

function CostPreviewCard({
  walletBalance,
  costEstimate,
  isLoading,
  onTopUpSuccess,
  userDetails,
}: CostPreviewCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading wallet info...
        </div>
      </div>
    )
  }

  if (!walletBalance || !costEstimate) {
    return null
  }

  // User has free generations
  if (costEstimate.canUseFreeGeneration) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-emerald-800">
                Free Generation Available
              </p>
              <p className="text-xs text-emerald-700">
                {walletBalance.freeGenerationsRemaining} of 3 free generations remaining
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            FREE
          </span>
        </div>
      </div>
    )
  }

  // User will pay from wallet
  const hasSufficientBalance = walletBalance.balance.paise >= costEstimate.cost.userPricePaise

  return (
    <div className={cn(
      'rounded-lg border px-4 py-3',
      hasSufficientBalance
        ? 'border-border bg-muted/30'
        : 'border-amber-200 bg-amber-50'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className={cn(
            'h-5 w-5',
            hasSufficientBalance ? 'text-muted-foreground' : 'text-amber-600'
          )} />
          <div>
            <p className="text-sm font-medium text-foreground">
              Generation Cost
            </p>
            <p className="text-xs text-muted-foreground">
              Balance: {walletBalance.balance.formatted}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-foreground">
            {costEstimate.cost.formatted}
          </p>
          {costEstimate.cost.markupPercentage > 0 && (
            <p className="text-xs text-muted-foreground">
              incl. {costEstimate.cost.markupPercentage}% fee
            </p>
          )}
        </div>
      </div>

      {/* Quick top-up if balance is low but not insufficient */}
      {hasSufficientBalance && walletBalance.balance.paise < costEstimate.cost.userPricePaise * 3 && (
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Running low? Add funds now</p>
          <AddFundsButton
            amountPaise={10000}
            label="+ ₹100"
            onSuccess={onTopUpSuccess}
            userDetails={userDetails}
            variant="compact"
            showIcon={false}
          />
        </div>
      )}
    </div>
  )
}
