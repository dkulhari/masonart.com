/**
 * ColorPaletteSelector Component
 *
 * Color palette selection for AI poster generation.
 * Features:
 * - System preset palettes (warm, cool, neutral, etc.)
 * - User's saved custom palettes
 * - Color picker for custom colors
 * - Integration with palette API
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from "react";
import { Palette, Plus, Check, Trash2, Save, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "~/lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
  isSystem?: boolean;
  isDefault?: boolean;
}

export interface ColorPaletteSelectorProps {
  /** Selected palette colors */
  selectedColors: string[];
  /** Callback when colors change */
  onColorsChange: (colors: string[]) => void;
  /** User's saved palettes */
  userPalettes?: ColorPalette[];
  /** Callback when user saves a new palette */
  onSavePalette?: (name: string, colors: string[]) => void;
  /** Callback when user deletes a palette */
  onDeletePalette?: (id: string) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Custom className */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SYSTEM_PALETTES: ColorPalette[] = [
  {
    id: "preset-warm",
    name: "Warm",
    colors: ["#FF5733", "#FFC300", "#FF8D1A", "#FF6B6B", "#FFE66D"],
    isSystem: true,
  },
  {
    id: "preset-cool",
    name: "Cool",
    colors: ["#4A90D9", "#5BC0DE", "#7B68EE", "#20B2AA", "#87CEEB"],
    isSystem: true,
  },
  {
    id: "preset-neutral",
    name: "Neutral",
    colors: ["#A0A0A0", "#D3D3D3", "#F5F5DC", "#C4B7A6", "#E8E8E8"],
    isSystem: true,
  },
  {
    id: "preset-vibrant",
    name: "Vibrant",
    colors: ["#FF0080", "#00FF00", "#0080FF", "#FFFF00", "#FF00FF"],
    isSystem: true,
  },
  {
    id: "preset-muted",
    name: "Muted",
    colors: ["#D4A5A5", "#A8C8A8", "#B8B8D4", "#D4C8A5", "#C8C8C8"],
    isSystem: true,
  },
  {
    id: "preset-earth",
    name: "Earth Tones",
    colors: ["#8B4513", "#556B2F", "#D2B48C", "#BC8F8F", "#6B4423"],
    isSystem: true,
  },
  {
    id: "preset-pastel",
    name: "Pastel",
    colors: ["#FFB3BA", "#BAFFC9", "#BAE1FF", "#FFFFBA", "#E0BBE4"],
    isSystem: true,
  },
  {
    id: "preset-monochrome",
    name: "Monochrome",
    colors: ["#000000", "#333333", "#666666", "#999999", "#CCCCCC"],
    isSystem: true,
  },
];

const MAX_CUSTOM_COLORS = 8;
const MIN_CUSTOM_COLORS = 3;

// ============================================================================
// Component
// ============================================================================

/**
 * ColorPaletteSelector - Color palette selection for AI generation
 */
export function ColorPaletteSelector({
  selectedColors,
  onColorsChange,
  userPalettes = [],
  onSavePalette,
  onDeletePalette,
  disabled = false,
  className,
}: ColorPaletteSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [customColors, setCustomColors] = useState<string[]>(["#FF5733", "#FFC300", "#00FF00"]);
  const [newPaletteName, setNewPaletteName] = useState("");
  const [selectedPaletteId, setSelectedPaletteId] = useState<string | null>(null);

  // Check if current colors match a palette
  const matchingPalette = [...SYSTEM_PALETTES, ...userPalettes].find(
    (p) => JSON.stringify(p.colors) === JSON.stringify(selectedColors)
  );

  const handlePaletteSelect = useCallback(
    (palette: ColorPalette) => {
      if (disabled) return;
      setSelectedPaletteId(palette.id);
      onColorsChange(palette.colors);
      setShowCustomEditor(false);
    },
    [disabled, onColorsChange]
  );

  const handleClearSelection = useCallback(() => {
    if (disabled) return;
    setSelectedPaletteId(null);
    onColorsChange([]);
  }, [disabled, onColorsChange]);

  const handleCustomColorChange = useCallback(
    (index: number, color: string) => {
      const newColors = [...customColors];
      newColors[index] = color;
      setCustomColors(newColors);
    },
    [customColors]
  );

  const handleAddCustomColor = useCallback(() => {
    if (customColors.length < MAX_CUSTOM_COLORS) {
      setCustomColors([...customColors, "#808080"]);
    }
  }, [customColors]);

  const handleRemoveCustomColor = useCallback(
    (index: number) => {
      if (customColors.length > MIN_CUSTOM_COLORS) {
        setCustomColors(customColors.filter((_, i) => i !== index));
      }
    },
    [customColors]
  );

  const handleApplyCustomColors = useCallback(() => {
    setSelectedPaletteId(null);
    onColorsChange(customColors);
  }, [customColors, onColorsChange]);

  const handleSavePalette = useCallback(() => {
    if (onSavePalette && newPaletteName.trim() && customColors.length >= MIN_CUSTOM_COLORS) {
      onSavePalette(newPaletteName.trim(), customColors);
      setNewPaletteName("");
    }
  }, [onSavePalette, newPaletteName, customColors]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
        className="flex items-center justify-between gap-2 text-left disabled:opacity-50"
      >
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Color Palette</span>
          {selectedColors.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({matchingPalette?.name || "Custom"})
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Selected Colors Preview */}
      {selectedColors.length > 0 && !isExpanded && (
        <div className="flex items-center gap-1">
          {selectedColors.map((color, index) => (
            <div
              key={index}
              className="h-6 w-6 rounded border border-border"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          <button
            type="button"
            onClick={handleClearSelection}
            disabled={disabled}
            className="ml-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          {/* System Palettes */}
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">Preset Palettes</h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SYSTEM_PALETTES.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => handlePaletteSelect(palette)}
                  disabled={disabled}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-2 transition-all",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    selectedPaletteId === palette.id
                      ? "border-primary ring-2 ring-primary ring-offset-1"
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  <div className="flex gap-0.5">
                    {palette.colors.slice(0, 5).map((color, index) => (
                      <div
                        key={index}
                        className="h-4 flex-1 first:rounded-l last:rounded-r"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-medium text-foreground">{palette.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* User Palettes */}
          {userPalettes.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">My Palettes</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {userPalettes.map((palette) => (
                  <div
                    key={palette.id}
                    className={cn(
                      "group relative flex flex-col gap-1 rounded-lg border p-2 transition-all",
                      selectedPaletteId === palette.id
                        ? "border-primary ring-2 ring-primary ring-offset-1"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handlePaletteSelect(palette)}
                      disabled={disabled}
                      className="flex flex-col gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex gap-0.5">
                        {palette.colors.slice(0, 5).map((color, index) => (
                          <div
                            key={index}
                            className="h-4 flex-1 first:rounded-l last:rounded-r"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-medium text-foreground">
                        {palette.name}
                      </span>
                    </button>
                    {onDeletePalette && (
                      <button
                        type="button"
                        onClick={() => onDeletePalette(palette.id)}
                        className="absolute -right-1 -top-1 hidden rounded-full bg-destructive p-0.5 text-destructive-foreground group-hover:block"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Color Editor */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowCustomEditor(!showCustomEditor)}
              className="flex items-center gap-2 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="h-3 w-3" />
              {showCustomEditor ? "Hide Custom Editor" : "Create Custom Palette"}
            </button>

            {showCustomEditor && (
              <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
                {/* Color Inputs */}
                <div className="flex flex-wrap gap-2">
                  {customColors.map((color, index) => (
                    <div key={index} className="flex flex-col items-center gap-1">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => handleCustomColorChange(index, e.target.value)}
                        disabled={disabled}
                        className="h-8 w-8 cursor-pointer rounded border-0"
                      />
                      {customColors.length > MIN_CUSTOM_COLORS && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomColor(index)}
                          disabled={disabled}
                          className="text-[10px] text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {customColors.length < MAX_CUSTOM_COLORS && (
                    <button
                      type="button"
                      onClick={handleAddCustomColor}
                      disabled={disabled}
                      className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-muted-foreground text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplyCustomColors}
                    disabled={disabled || customColors.length < MIN_CUSTOM_COLORS}
                    className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                    Apply
                  </button>

                  {onSavePalette && (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newPaletteName}
                        onChange={(e) => setNewPaletteName(e.target.value)}
                        placeholder="Palette name..."
                        disabled={disabled}
                        className="h-8 rounded border border-input bg-background px-2 text-xs disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={handleSavePalette}
                        disabled={
                          disabled ||
                          !newPaletteName.trim() ||
                          customColors.length < MIN_CUSTOM_COLORS
                        }
                        className="flex items-center gap-1 rounded border border-input px-2 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        <Save className="h-3 w-3" />
                        Save
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground">
                  {MIN_CUSTOM_COLORS}-{MAX_CUSTOM_COLORS} colors required
                </p>
              </div>
            )}
          </div>

          {/* Clear Selection */}
          {selectedColors.length > 0 && (
            <button
              type="button"
              onClick={handleClearSelection}
              disabled={disabled}
              className="self-start text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Clear selection (no color preference)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ColorPaletteSelector;
