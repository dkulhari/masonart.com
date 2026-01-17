/**
 * AI Generator Page - MasonArt E-commerce Platform
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

import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Sparkles, Wand2, HelpCircle, Loader2 } from 'lucide-react'

import { cn } from '~/lib/utils'
import { aiApi } from '~/lib/api'
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
      { title: 'Create AI Poster | MasonArt' },
      {
        name: 'description',
        content:
          'Create unique, custom posters using AI. Choose from various styles like Wabi-Sabi, Abstract, Botanical, and more.',
      },
      { property: 'og:title', content: 'Create AI Poster | MasonArt' },
      {
        property: 'og:description',
        content:
          'Create unique, custom posters using AI. Choose from various styles.',
      },
    ],
  }),
  component: CreatePage,
})

// ============================================================================
// Main Component
// ============================================================================

function CreatePage() {
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

  return (
    <div className="flex flex-col">
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

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!isFormValid || isGenerating}
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
    </div>
  )
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
