/**
 * Default Banned Terms for AI Content Moderation
 *
 * Categories:
 * - nsfw: Sexual/adult content
 * - violence: Gore, weapons, harm
 * - hate_speech: Discrimination, slurs
 * - illegal_content: Drugs, weapons trafficking
 * - copyright: Copyrighted characters/brands
 */

export interface BannedTermSeed {
  pattern: string;
  isRegex: boolean;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
}

export const DEFAULT_BANNED_TERMS: BannedTermSeed[] = [
  // NSFW - Critical (immediate block)
  {
    pattern: "nude",
    isRegex: false,
    category: "nsfw",
    severity: "critical",
    reason: "Adult content not allowed",
  },
  {
    pattern: "naked",
    isRegex: false,
    category: "nsfw",
    severity: "critical",
    reason: "Adult content not allowed",
  },
  {
    pattern: "porn",
    isRegex: false,
    category: "nsfw",
    severity: "critical",
    reason: "Adult content not allowed",
  },
  {
    pattern: "xxx",
    isRegex: false,
    category: "nsfw",
    severity: "critical",
    reason: "Adult content not allowed",
  },
  {
    pattern: "explicit",
    isRegex: false,
    category: "nsfw",
    severity: "high",
    reason: "Potentially adult content",
  },
  {
    pattern: "erotic",
    isRegex: false,
    category: "nsfw",
    severity: "critical",
    reason: "Adult content not allowed",
  },
  {
    pattern: "sensual",
    isRegex: false,
    category: "nsfw",
    severity: "medium",
    reason: "Potentially suggestive",
  },
  {
    pattern: "lingerie",
    isRegex: false,
    category: "nsfw",
    severity: "medium",
    reason: "Potentially suggestive",
  },
  {
    pattern: "\\bsexy\\b",
    isRegex: true,
    category: "nsfw",
    severity: "medium",
    reason: "Potentially suggestive",
  },

  // Violence - Critical
  {
    pattern: "gore",
    isRegex: false,
    category: "violence",
    severity: "critical",
    reason: "Violent content not allowed",
  },
  {
    pattern: "blood",
    isRegex: false,
    category: "violence",
    severity: "high",
    reason: "Potentially violent",
  },
  {
    pattern: "murder",
    isRegex: false,
    category: "violence",
    severity: "critical",
    reason: "Violent content not allowed",
  },
  {
    pattern: "killing",
    isRegex: false,
    category: "violence",
    severity: "critical",
    reason: "Violent content not allowed",
  },
  {
    pattern: "torture",
    isRegex: false,
    category: "violence",
    severity: "critical",
    reason: "Violent content not allowed",
  },
  {
    pattern: "weapon",
    isRegex: false,
    category: "violence",
    severity: "high",
    reason: "Weapon-related content",
  },
  {
    pattern: "gun",
    isRegex: false,
    category: "violence",
    severity: "high",
    reason: "Weapon-related content",
  },
  {
    pattern: "knife attack",
    isRegex: false,
    category: "violence",
    severity: "critical",
    reason: "Violent content not allowed",
  },
  {
    pattern: "\\bdead bod",
    isRegex: true,
    category: "violence",
    severity: "critical",
    reason: "Violent content not allowed",
  },

  // Hate Speech - Critical
  {
    pattern: "nazi",
    isRegex: false,
    category: "hate_speech",
    severity: "critical",
    reason: "Hate symbols not allowed",
  },
  {
    pattern: "swastika",
    isRegex: false,
    category: "hate_speech",
    severity: "critical",
    reason: "Hate symbols not allowed",
  },
  {
    pattern: "white supremac",
    isRegex: false,
    category: "hate_speech",
    severity: "critical",
    reason: "Hate content not allowed",
  },
  {
    pattern: "kkk",
    isRegex: false,
    category: "hate_speech",
    severity: "critical",
    reason: "Hate symbols not allowed",
  },
  {
    pattern: "\\bracist\\b",
    isRegex: true,
    category: "hate_speech",
    severity: "high",
    reason: "Potentially discriminatory",
  },

  // Illegal Content
  {
    pattern: "drug dealer",
    isRegex: false,
    category: "illegal_content",
    severity: "critical",
    reason: "Illegal activity not allowed",
  },
  {
    pattern: "cocaine",
    isRegex: false,
    category: "illegal_content",
    severity: "critical",
    reason: "Drug content not allowed",
  },
  {
    pattern: "heroin",
    isRegex: false,
    category: "illegal_content",
    severity: "critical",
    reason: "Drug content not allowed",
  },
  {
    pattern: "meth",
    isRegex: false,
    category: "illegal_content",
    severity: "critical",
    reason: "Drug content not allowed",
  },

  // Copyright - High (needs review)
  {
    pattern: "mickey mouse",
    isRegex: false,
    category: "copyright",
    severity: "high",
    reason: "Copyrighted character",
  },
  {
    pattern: "disney",
    isRegex: false,
    category: "copyright",
    severity: "medium",
    reason: "Potentially copyrighted",
  },
  {
    pattern: "marvel",
    isRegex: false,
    category: "copyright",
    severity: "medium",
    reason: "Potentially copyrighted",
  },
  {
    pattern: "pokemon",
    isRegex: false,
    category: "copyright",
    severity: "high",
    reason: "Copyrighted characters",
  },
  {
    pattern: "pikachu",
    isRegex: false,
    category: "copyright",
    severity: "high",
    reason: "Copyrighted character",
  },
];

/**
 * Get severity level value for comparison
 */
export function getSeverityLevel(
  severity: BannedTermSeed["severity"]
): number {
  const levels: Record<BannedTermSeed["severity"], number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return levels[severity];
}
