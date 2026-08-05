import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Tests to verify Tailwind CSS and PostCSS configuration for @chobii/web package
 *
 * This test suite validates:
 * - Configuration file existence and structure
 * - Tailwind CSS configuration (content paths, theme, plugins, no dark mode)
 * - PostCSS configuration (plugins: tailwindcss, autoprefixer)
 * - Global styles (CSS custom properties, layers, utilities)
 * - Dependencies verification
 * - Theme color system (brand colors, semantic colors, chart colors)
 * - Animation and keyframe definitions
 * - Custom utilities and components
 *
 * References:
 * - https://tailwindcss.com/docs/configuration
 * - https://tailwindcss.com/docs/using-with-preprocessors
 */
describe('Tailwind CSS and PostCSS Configuration', () => {
  // Detect if we're running from the web package directory or from root
  const cwd = process.cwd();
  const isInWebDir = cwd.endsWith('packages/web') || cwd.endsWith('packages\\web');
  const packageDir = isInWebDir ? cwd : join(cwd, 'packages', 'web');
  const appDir = join(packageDir, 'app');

  // Configuration file paths
  const tailwindConfigPath = join(packageDir, 'tailwind.config.ts');
  const postcssConfigPath = join(packageDir, 'postcss.config.js');
  const globalsCssPath = join(appDir, 'styles', 'globals.css');
  const packageJsonPath = join(packageDir, 'package.json');

  let tailwindConfig: string;
  let postcssConfig: string;
  let globalsCss: string;
  let packageJson: Record<string, unknown>;
  let sourceFiles: string[];

  // Every .ts/.tsx/.css under app/, so a source-wide assertion can be made
  // without shelling out to grep.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx|css)$/.test(entry.name) ? [full] : [];
    });

  beforeAll(() => {
    sourceFiles = existsSync(appDir) ? walk(appDir) : [];
    if (existsSync(tailwindConfigPath)) {
      tailwindConfig = readFileSync(tailwindConfigPath, 'utf-8');
    }
    if (existsSync(postcssConfigPath)) {
      postcssConfig = readFileSync(postcssConfigPath, 'utf-8');
    }
    if (existsSync(globalsCssPath)) {
      globalsCss = readFileSync(globalsCssPath, 'utf-8');
    }
    if (existsSync(packageJsonPath)) {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    }
  });

  describe('Configuration Files Existence', () => {
    it('should have tailwind.config.ts', () => {
      expect(existsSync(tailwindConfigPath)).toBe(true);
    });

    it('should have postcss.config.js', () => {
      expect(existsSync(postcssConfigPath)).toBe(true);
    });

    it('should have styles directory', () => {
      const stylesDir = join(appDir, 'styles');
      expect(existsSync(stylesDir)).toBe(true);
    });

    it('should have globals.css', () => {
      expect(existsSync(globalsCssPath)).toBe(true);
    });
  });

  describe('Tailwind Configuration Structure', () => {
    it('should be a TypeScript configuration file', () => {
      expect(tailwindConfig).toBeDefined();
      expect(tailwindConfigPath).toMatch(/\.ts$/);
    });

    it('should import Config type from tailwindcss', () => {
      expect(tailwindConfig).toContain("import type { Config } from 'tailwindcss'");
    });

    it('should export config as default', () => {
      expect(tailwindConfig).toContain('export default config');
    });

    it('should define config with type annotation', () => {
      expect(tailwindConfig).toContain('const config: Config');
    });
  });

  // Dark mode was removed on 2026-08-05 (#449). mesonart is light-only, and the
  // .dark palette was unreachable anyway — nothing ever set the class on the root.
  describe('Tailwind Dark Mode Removal', () => {
    it('should not configure dark mode at all', () => {
      expect(tailwindConfig).not.toContain('darkMode');
    });
  });

  describe('Tailwind Content Paths', () => {
    it('should have content array defined', () => {
      expect(tailwindConfig).toContain('content:');
    });

    it('should include app directory in content paths', () => {
      expect(tailwindConfig).toContain("'./app/**/*.{js,ts,jsx,tsx,mdx}'");
    });

    it('should include components directory in content paths', () => {
      expect(tailwindConfig).toContain("'./components/**/*.{js,ts,jsx,tsx,mdx}'");
    });
  });

  describe('Tailwind Theme Container', () => {
    it('should have container configuration', () => {
      expect(tailwindConfig).toContain('container:');
    });

    it('should center container by default', () => {
      expect(tailwindConfig).toContain('center: true');
    });

    // Was 2rem / 1400px. Moved to the measured mesonart page box; the
    // authoritative values are --page-padding / --page-width in globals.css,
    // and design-tokens.test.ts asserts the two stay in step.
    it('should have the measured 20px container padding', () => {
      expect(tailwindConfig).toContain("padding: '20px'");
    });

    it('should have 2xl screen breakpoint for container', () => {
      expect(tailwindConfig).toContain("'2xl': '1600px'");
    });
  });

  describe('Tailwind Theme Extended Colors', () => {
    describe('Base Colors', () => {
      it('should extend colors in theme', () => {
        expect(tailwindConfig).toContain('extend:');
        expect(tailwindConfig).toContain('colors:');
      });

      it('should have border color using CSS variable', () => {
        expect(tailwindConfig).toContain("border: 'hsl(var(--border))'");
      });

      it('should have input color using CSS variable', () => {
        expect(tailwindConfig).toContain("input: 'hsl(var(--input))'");
      });

      it('should have ring color using CSS variable', () => {
        expect(tailwindConfig).toContain("ring: 'hsl(var(--ring))'");
      });

      it('should have background color using CSS variable', () => {
        expect(tailwindConfig).toContain("background: 'hsl(var(--background))'");
      });

      it('should have foreground color using CSS variable', () => {
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--foreground))'");
      });
    });

    describe('Semantic Colors', () => {
      it('should have primary color with DEFAULT and foreground', () => {
        expect(tailwindConfig).toContain('primary:');
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--primary))'");
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--primary-foreground))'");
      });

      it('should have secondary color with DEFAULT and foreground', () => {
        expect(tailwindConfig).toContain('secondary:');
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--secondary))'");
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--secondary-foreground))'");
      });

      it('should have destructive color with DEFAULT and foreground', () => {
        expect(tailwindConfig).toContain('destructive:');
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--destructive))'");
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--destructive-foreground))'");
      });

      it('should have muted color with DEFAULT and foreground', () => {
        expect(tailwindConfig).toContain('muted:');
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--muted))'");
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--muted-foreground))'");
      });

      it('should have accent color with DEFAULT and foreground', () => {
        expect(tailwindConfig).toContain('accent:');
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--accent))'");
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--accent-foreground))'");
      });

      it('should have popover color with DEFAULT and foreground', () => {
        expect(tailwindConfig).toContain('popover:');
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--popover))'");
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--popover-foreground))'");
      });

      it('should have card color with DEFAULT and foreground', () => {
        expect(tailwindConfig).toContain('card:');
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--card))'");
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--card-foreground))'");
      });

      it('should have success color with DEFAULT and foreground', () => {
        expect(tailwindConfig).toContain('success:');
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--success))'");
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--success-foreground))'");
      });

      it('should have warning color with DEFAULT and foreground', () => {
        expect(tailwindConfig).toContain('warning:');
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--warning))'");
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--warning-foreground))'");
      });
    });

    describe('Brand Colors', () => {
      it('should have brand color with DEFAULT and foreground', () => {
        expect(tailwindConfig).toContain('brand:');
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--brand))'");
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--brand-foreground))'");
      });

      it('should have brand color scale from 50 to 950', () => {
        const brandShades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
        brandShades.forEach(shade => {
          expect(tailwindConfig).toContain(`${shade}: 'hsl(var(--brand-${shade}))'`);
        });
      });
    });

    describe('Chart Colors', () => {
      it('should have chart colors 1-5', () => {
        expect(tailwindConfig).toContain('chart:');
        for (let i = 1; i <= 5; i++) {
          expect(tailwindConfig).toContain(`'${i}': 'hsl(var(--chart-${i}))'`);
        }
      });
    });

    describe('Sidebar Colors', () => {
      it('should have sidebar color configuration', () => {
        expect(tailwindConfig).toContain('sidebar:');
      });

      it('should have sidebar DEFAULT using background variable', () => {
        expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--sidebar-background))'");
      });

      it('should have sidebar foreground', () => {
        expect(tailwindConfig).toContain("foreground: 'hsl(var(--sidebar-foreground))'");
      });

      it('should have sidebar primary', () => {
        expect(tailwindConfig).toContain("primary: 'hsl(var(--sidebar-primary))'");
      });

      it('should have sidebar primary-foreground', () => {
        expect(tailwindConfig).toContain("'primary-foreground': 'hsl(var(--sidebar-primary-foreground))'");
      });

      it('should have sidebar accent', () => {
        expect(tailwindConfig).toContain("accent: 'hsl(var(--sidebar-accent))'");
      });

      it('should have sidebar accent-foreground', () => {
        expect(tailwindConfig).toContain("'accent-foreground': 'hsl(var(--sidebar-accent-foreground))'");
      });

      it('should have sidebar border', () => {
        expect(tailwindConfig).toContain("border: 'hsl(var(--sidebar-border))'");
      });

      it('should have sidebar ring', () => {
        expect(tailwindConfig).toContain("ring: 'hsl(var(--sidebar-ring))'");
      });
    });
  });

  describe('Tailwind Theme Border Radius', () => {
    it('should have border radius configuration', () => {
      expect(tailwindConfig).toContain('borderRadius:');
    });

    it('should have lg border radius using CSS variable', () => {
      expect(tailwindConfig).toContain("lg: 'var(--radius)'");
    });

    it('should have md border radius calculated from CSS variable', () => {
      expect(tailwindConfig).toContain("md: 'calc(var(--radius) - 2px)'");
    });

    it('should have sm border radius calculated from CSS variable', () => {
      expect(tailwindConfig).toContain("sm: 'calc(var(--radius) - 4px)'");
    });
  });

  describe('Tailwind Theme Font Family', () => {
    it('should have font family configuration', () => {
      expect(tailwindConfig).toContain('fontFamily:');
    });

    it('should have sans font family with CSS variable', () => {
      expect(tailwindConfig).toContain("sans: ['var(--font-sans)'");
    });

    it('should have heading font family with CSS variable', () => {
      expect(tailwindConfig).toContain("heading: ['var(--font-heading)'");
    });

    it('should have system-ui as fallback', () => {
      expect(tailwindConfig).toContain("'system-ui'");
    });
  });

  describe('Tailwind Theme Keyframes', () => {
    it('should have keyframes configuration', () => {
      expect(tailwindConfig).toContain('keyframes:');
    });

    it('should have accordion-down keyframe', () => {
      expect(tailwindConfig).toContain("'accordion-down':");
      expect(tailwindConfig).toContain("from: { height: '0' }");
      expect(tailwindConfig).toContain("to: { height: 'var(--radix-accordion-content-height)' }");
    });

    it('should have accordion-up keyframe', () => {
      expect(tailwindConfig).toContain("'accordion-up':");
    });

    it('should have fade-in keyframe', () => {
      expect(tailwindConfig).toContain("'fade-in':");
      expect(tailwindConfig).toContain("from: { opacity: '0' }");
      expect(tailwindConfig).toContain("to: { opacity: '1' }");
    });

    it('should have fade-out keyframe', () => {
      expect(tailwindConfig).toContain("'fade-out':");
    });

    it('should have slide-in-from-top keyframe', () => {
      expect(tailwindConfig).toContain("'slide-in-from-top':");
    });

    it('should have slide-in-from-bottom keyframe', () => {
      expect(tailwindConfig).toContain("'slide-in-from-bottom':");
    });

    it('should have slide-in-from-left keyframe', () => {
      expect(tailwindConfig).toContain("'slide-in-from-left':");
    });

    it('should have slide-in-from-right keyframe', () => {
      expect(tailwindConfig).toContain("'slide-in-from-right':");
    });

    it('should have shimmer keyframe', () => {
      expect(tailwindConfig).toContain('shimmer:');
      expect(tailwindConfig).toContain("'100%': { transform: 'translateX(100%)' }");
    });

    it('should have pulse keyframe', () => {
      expect(tailwindConfig).toContain('pulse:');
    });

    it('should have spin keyframe', () => {
      expect(tailwindConfig).toContain('spin:');
      expect(tailwindConfig).toContain("from: { transform: 'rotate(0deg)' }");
      expect(tailwindConfig).toContain("to: { transform: 'rotate(360deg)' }");
    });
  });

  describe('Tailwind Theme Animations', () => {
    it('should have animation configuration', () => {
      expect(tailwindConfig).toContain('animation:');
    });

    it('should have accordion-down animation', () => {
      expect(tailwindConfig).toContain("'accordion-down': 'accordion-down 0.2s ease-out'");
    });

    it('should have accordion-up animation', () => {
      expect(tailwindConfig).toContain("'accordion-up': 'accordion-up 0.2s ease-out'");
    });

    it('should have fade-in animation', () => {
      expect(tailwindConfig).toContain("'fade-in': 'fade-in 0.3s ease-out'");
    });

    it('should have fade-out animation', () => {
      expect(tailwindConfig).toContain("'fade-out': 'fade-out 0.3s ease-out'");
    });

    it('should have slide-in animations', () => {
      expect(tailwindConfig).toContain("'slide-in-from-top': 'slide-in-from-top 0.3s ease-out'");
      expect(tailwindConfig).toContain("'slide-in-from-bottom': 'slide-in-from-bottom 0.3s ease-out'");
      expect(tailwindConfig).toContain("'slide-in-from-left': 'slide-in-from-left 0.3s ease-out'");
      expect(tailwindConfig).toContain("'slide-in-from-right': 'slide-in-from-right 0.3s ease-out'");
    });

    it('should have shimmer animation', () => {
      expect(tailwindConfig).toContain("shimmer: 'shimmer 2s infinite'");
    });

    it('should have pulse animation', () => {
      expect(tailwindConfig).toContain("pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'");
    });

    it('should have spin animation', () => {
      expect(tailwindConfig).toContain("spin: 'spin 1s linear infinite'");
    });
  });

  describe('Tailwind Theme Custom Spacing', () => {
    it('should have spacing configuration', () => {
      expect(tailwindConfig).toContain('spacing:');
    });

    it('should have custom spacing value 18 (4.5rem)', () => {
      expect(tailwindConfig).toContain("'18': '4.5rem'");
    });

    it('should have custom spacing value 88 (22rem)', () => {
      expect(tailwindConfig).toContain("'88': '22rem'");
    });

    it('should have custom spacing value 128 (32rem)', () => {
      expect(tailwindConfig).toContain("'128': '32rem'");
    });
  });

  describe('Tailwind Theme Aspect Ratios', () => {
    it('should have aspect ratio configuration', () => {
      expect(tailwindConfig).toContain('aspectRatio:');
    });

    it('should have poster aspect ratio (2/3)', () => {
      expect(tailwindConfig).toContain("poster: '2/3'");
    });

    it('should have poster-landscape aspect ratio (3/2)', () => {
      expect(tailwindConfig).toContain("'poster-landscape': '3/2'");
    });

    it('should have poster-square aspect ratio (1/1)', () => {
      expect(tailwindConfig).toContain("'poster-square': '1/1'");
    });

    it('should have poster-panoramic aspect ratio (16/9)', () => {
      expect(tailwindConfig).toContain("'poster-panoramic': '16/9'");
    });
  });

  describe('Tailwind Theme Background Images', () => {
    it('should have background image configuration', () => {
      expect(tailwindConfig).toContain('backgroundImage:');
    });

    it('should have gradient-radial background', () => {
      expect(tailwindConfig).toContain("'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))'");
    });

    it('should have gradient-conic background', () => {
      expect(tailwindConfig).toContain("'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))'");
    });
  });

  describe('Tailwind Plugins', () => {
    it('should have plugins array', () => {
      expect(tailwindConfig).toContain('plugins:');
    });

    it('should import tailwindcss-animate', () => {
      expect(tailwindConfig).toContain("import tailwindcssAnimate from 'tailwindcss-animate'");
    });

    it('should use tailwindcss-animate plugin', () => {
      expect(tailwindConfig).toContain('tailwindcssAnimate');
    });
  });

  describe('PostCSS Configuration', () => {
    it('should have PostCSS configuration file', () => {
      expect(postcssConfig).toBeDefined();
    });

    it('should export configuration as default', () => {
      expect(postcssConfig).toContain('export default');
    });

    it('should have plugins object', () => {
      expect(postcssConfig).toContain('plugins:');
    });

    it('should configure tailwindcss plugin', () => {
      expect(postcssConfig).toContain('tailwindcss: {}');
    });

    it('should configure autoprefixer plugin', () => {
      expect(postcssConfig).toContain('autoprefixer: {}');
    });

    it('should have JSDoc type annotation for PostCSS config', () => {
      expect(postcssConfig).toContain("@type {import('postcss').Config}");
    });
  });

  describe('Global Styles - Tailwind Directives', () => {
    it('should have @tailwind base directive', () => {
      expect(globalsCss).toContain('@tailwind base;');
    });

    it('should have @tailwind components directive', () => {
      expect(globalsCss).toContain('@tailwind components;');
    });

    it('should have @tailwind utilities directive', () => {
      expect(globalsCss).toContain('@tailwind utilities;');
    });

    it('should have directives in correct order', () => {
      const baseIndex = globalsCss.indexOf('@tailwind base;');
      const componentsIndex = globalsCss.indexOf('@tailwind components;');
      const utilitiesIndex = globalsCss.indexOf('@tailwind utilities;');

      expect(baseIndex).toBeLessThan(componentsIndex);
      expect(componentsIndex).toBeLessThan(utilitiesIndex);
    });
  });

  describe('Global Styles - CSS Custom Properties (Light Mode)', () => {
    it('should have :root selector for light mode variables', () => {
      expect(globalsCss).toContain(':root {');
    });

    describe('Base Color Variables', () => {
      it('should define --background variable', () => {
        expect(globalsCss).toContain('--background:');
      });

      it('should define --foreground variable', () => {
        expect(globalsCss).toContain('--foreground:');
      });

      it('should define --card variable', () => {
        expect(globalsCss).toContain('--card:');
      });

      it('should define --card-foreground variable', () => {
        expect(globalsCss).toContain('--card-foreground:');
      });

      it('should define --popover variable', () => {
        expect(globalsCss).toContain('--popover:');
      });

      it('should define --popover-foreground variable', () => {
        expect(globalsCss).toContain('--popover-foreground:');
      });
    });

    describe('Semantic Color Variables', () => {
      it('should define --primary variable', () => {
        expect(globalsCss).toContain('--primary:');
      });

      it('should define --primary-foreground variable', () => {
        expect(globalsCss).toContain('--primary-foreground:');
      });

      it('should define --secondary variable', () => {
        expect(globalsCss).toContain('--secondary:');
      });

      it('should define --secondary-foreground variable', () => {
        expect(globalsCss).toContain('--secondary-foreground:');
      });

      it('should define --muted variable', () => {
        expect(globalsCss).toContain('--muted:');
      });

      it('should define --muted-foreground variable', () => {
        expect(globalsCss).toContain('--muted-foreground:');
      });

      it('should define --accent variable', () => {
        expect(globalsCss).toContain('--accent:');
      });

      it('should define --accent-foreground variable', () => {
        expect(globalsCss).toContain('--accent-foreground:');
      });

      it('should define --destructive variable', () => {
        expect(globalsCss).toContain('--destructive:');
      });

      it('should define --destructive-foreground variable', () => {
        expect(globalsCss).toContain('--destructive-foreground:');
      });

      it('should define --success variable', () => {
        expect(globalsCss).toContain('--success:');
      });

      it('should define --success-foreground variable', () => {
        expect(globalsCss).toContain('--success-foreground:');
      });

      it('should define --warning variable', () => {
        expect(globalsCss).toContain('--warning:');
      });

      it('should define --warning-foreground variable', () => {
        expect(globalsCss).toContain('--warning-foreground:');
      });
    });

    describe('UI Element Variables', () => {
      it('should define --border variable', () => {
        expect(globalsCss).toContain('--border:');
      });

      it('should define --input variable', () => {
        expect(globalsCss).toContain('--input:');
      });

      it('should define --ring variable', () => {
        expect(globalsCss).toContain('--ring:');
      });

      it('should define --radius variable', () => {
        expect(globalsCss).toContain('--radius:');
        expect(globalsCss).toContain('--radius: 0.5rem');
      });
    });

    describe('Brand Color Scale Variables', () => {
      it('should define --brand variable', () => {
        expect(globalsCss).toContain('--brand:');
      });

      it('should define --brand-foreground variable', () => {
        expect(globalsCss).toContain('--brand-foreground:');
      });

      const brandShades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
      brandShades.forEach(shade => {
        it(`should define --brand-${shade} variable`, () => {
          expect(globalsCss).toContain(`--brand-${shade}:`);
        });
      });
    });

    describe('Chart Color Variables', () => {
      for (let i = 1; i <= 5; i++) {
        it(`should define --chart-${i} variable`, () => {
          expect(globalsCss).toContain(`--chart-${i}:`);
        });
      }
    });

    describe('Sidebar Variables', () => {
      it('should define --sidebar-background variable', () => {
        expect(globalsCss).toContain('--sidebar-background:');
      });

      it('should define --sidebar-foreground variable', () => {
        expect(globalsCss).toContain('--sidebar-foreground:');
      });

      it('should define --sidebar-primary variable', () => {
        expect(globalsCss).toContain('--sidebar-primary:');
      });

      it('should define --sidebar-primary-foreground variable', () => {
        expect(globalsCss).toContain('--sidebar-primary-foreground:');
      });

      it('should define --sidebar-accent variable', () => {
        expect(globalsCss).toContain('--sidebar-accent:');
      });

      it('should define --sidebar-accent-foreground variable', () => {
        expect(globalsCss).toContain('--sidebar-accent-foreground:');
      });

      it('should define --sidebar-border variable', () => {
        expect(globalsCss).toContain('--sidebar-border:');
      });

      it('should define --sidebar-ring variable', () => {
        expect(globalsCss).toContain('--sidebar-ring:');
      });
    });

    describe('Typography Variables', () => {
      it('should define --font-sans variable', () => {
        expect(globalsCss).toContain('--font-sans:');
      });

      it('should define --font-heading variable', () => {
        expect(globalsCss).toContain('--font-heading:');
      });
    });
  });

  describe('Global Styles - Dark Mode Removal', () => {
    it('should have no .dark selector', () => {
      expect(globalsCss).not.toContain('.dark');
    });

    it('should still define the light tokens the .dark block used to override', () => {
      // The overrides are gone; the tokens themselves are load-bearing in :root.
      const tokens = [
        '--background:',
        '--foreground:',
        '--primary:',
        '--brand:',
        '--chart-1:',
        '--sidebar-background:',
      ];
      tokens.forEach(token => expect(globalsCss).toContain(token));
    });
  });

  describe('Global Styles - Base Layer', () => {
    it('should have @layer base', () => {
      expect(globalsCss).toContain('@layer base {');
    });

    it('should apply border-border to all elements', () => {
      expect(globalsCss).toContain('@apply border-border;');
    });

    it('should apply scroll-smooth to html', () => {
      expect(globalsCss).toContain('html {');
      expect(globalsCss).toContain('@apply scroll-smooth;');
    });

    it('should apply background and text to body', () => {
      expect(globalsCss).toContain('body {');
      expect(globalsCss).toContain('@apply bg-background text-foreground antialiased;');
    });

    it('should set font-feature-settings on body', () => {
      expect(globalsCss).toContain('font-feature-settings:');
    });

    it('should constrain images', () => {
      expect(globalsCss).toContain('img,');
      expect(globalsCss).toContain('@apply max-w-full h-auto;');
    });

    it('should have focus-visible styles', () => {
      expect(globalsCss).toContain(':focus-visible {');
      expect(globalsCss).toContain('ring-2');
      expect(globalsCss).toContain('ring-ring');
    });

    it('should have selection styles', () => {
      expect(globalsCss).toContain('::selection {');
      expect(globalsCss).toContain('bg-primary/20');
    });
  });

  describe('Global Styles - Components Layer', () => {
    it('should have @layer components', () => {
      expect(globalsCss).toContain('@layer components {');
    });

    it('should have container-narrow component', () => {
      expect(globalsCss).toContain('.container-narrow {');
      expect(globalsCss).toContain('max-w-4xl');
    });

    it('should have container-wide component', () => {
      expect(globalsCss).toContain('.container-wide {');
      expect(globalsCss).toContain('max-w-7xl');
    });

    it('should have skeleton component', () => {
      expect(globalsCss).toContain('.skeleton {');
      expect(globalsCss).toContain('animate-pulse');
    });

    it('should have poster aspect ratio components', () => {
      expect(globalsCss).toContain('.poster-portrait {');
      expect(globalsCss).toContain('aspect-[2/3]');
      expect(globalsCss).toContain('.poster-landscape {');
      expect(globalsCss).toContain('aspect-[3/2]');
      expect(globalsCss).toContain('.poster-square {');
      expect(globalsCss).toContain('aspect-square');
      expect(globalsCss).toContain('.poster-panoramic {');
      expect(globalsCss).toContain('aspect-video');
    });

    it('should have card-hover component', () => {
      expect(globalsCss).toContain('.card-hover {');
      expect(globalsCss).toContain('hover:shadow-lg');
      expect(globalsCss).toContain('hover:-translate-y-1');
    });

    it('should have gradient-text component', () => {
      expect(globalsCss).toContain('.gradient-text {');
      expect(globalsCss).toContain('bg-gradient-to-r');
      expect(globalsCss).toContain('bg-clip-text');
      expect(globalsCss).toContain('text-transparent');
    });
  });

  describe('Global Styles - Utilities Layer', () => {
    it('should have @layer utilities', () => {
      expect(globalsCss).toContain('@layer utilities {');
    });

    describe('Scrollbar Utilities', () => {
      it('should have scrollbar-hide utility', () => {
        expect(globalsCss).toContain('.scrollbar-hide {');
        expect(globalsCss).toContain('scrollbar-width: none');
        expect(globalsCss).toContain('-ms-overflow-style: none');
      });

      it('should hide webkit scrollbar for scrollbar-hide', () => {
        expect(globalsCss).toContain('.scrollbar-hide::-webkit-scrollbar {');
        expect(globalsCss).toContain('display: none');
      });

      it('should have scrollbar-thin utility', () => {
        expect(globalsCss).toContain('.scrollbar-thin {');
        expect(globalsCss).toContain('scrollbar-width: thin');
      });
    });

    describe('Text Utilities', () => {
      it('should have text-balance utility', () => {
        expect(globalsCss).toContain('.text-balance {');
        expect(globalsCss).toContain('text-wrap: balance');
      });
    });

    describe('Glass Effect Utility', () => {
      it('should have glass utility', () => {
        expect(globalsCss).toContain('.glass {');
        expect(globalsCss).toContain('bg-background/80');
        expect(globalsCss).toContain('backdrop-blur-md');
      });
    });

    describe('Line Clamp Utilities', () => {
      it('should have line-clamp-1 utility', () => {
        expect(globalsCss).toContain('.line-clamp-1 {');
        expect(globalsCss).toContain('-webkit-line-clamp: 1');
      });

      it('should have line-clamp-2 utility', () => {
        expect(globalsCss).toContain('.line-clamp-2 {');
        expect(globalsCss).toContain('-webkit-line-clamp: 2');
      });

      it('should have line-clamp-3 utility', () => {
        expect(globalsCss).toContain('.line-clamp-3 {');
        expect(globalsCss).toContain('-webkit-line-clamp: 3');
      });
    });

    describe('Selection Utility', () => {
      it('should have no-select utility', () => {
        expect(globalsCss).toContain('.no-select {');
        expect(globalsCss).toContain('user-select: none');
        expect(globalsCss).toContain('-webkit-user-select: none');
        expect(globalsCss).toContain('-moz-user-select: none');
      });
    });

    describe('Print Utilities', () => {
      it('should have print-hidden utility', () => {
        expect(globalsCss).toContain('.print-hidden {');
        expect(globalsCss).toContain('display: none !important');
      });

      it('should have print-only utility', () => {
        expect(globalsCss).toContain('.print-only {');
        expect(globalsCss).toContain('display: block !important');
      });

      it('should wrap print utilities in @media print', () => {
        expect(globalsCss).toContain('@media print {');
      });
    });

    describe('Animation Delay Utilities', () => {
      it('should have animation-delay-100 utility', () => {
        expect(globalsCss).toContain('.animation-delay-100 {');
        expect(globalsCss).toContain('animation-delay: 100ms');
      });

      it('should have animation-delay-200 utility', () => {
        expect(globalsCss).toContain('.animation-delay-200 {');
        expect(globalsCss).toContain('animation-delay: 200ms');
      });

      it('should have animation-delay-300 utility', () => {
        expect(globalsCss).toContain('.animation-delay-300 {');
        expect(globalsCss).toContain('animation-delay: 300ms');
      });

      it('should have animation-delay-500 utility', () => {
        expect(globalsCss).toContain('.animation-delay-500 {');
        expect(globalsCss).toContain('animation-delay: 500ms');
      });

      it('should have animation-delay-700 utility', () => {
        expect(globalsCss).toContain('.animation-delay-700 {');
        expect(globalsCss).toContain('animation-delay: 700ms');
      });

      it('should have animation-delay-1000 utility', () => {
        expect(globalsCss).toContain('.animation-delay-1000 {');
        expect(globalsCss).toContain('animation-delay: 1000ms');
      });
    });
  });

  describe('Dependencies Verification', () => {
    it('should have tailwindcss as a dev dependency', () => {
      const devDeps = packageJson.devDependencies as Record<string, string>;
      expect(devDeps).toBeDefined();
      expect(devDeps.tailwindcss).toBeDefined();
    });

    it('should have postcss as a dev dependency', () => {
      const devDeps = packageJson.devDependencies as Record<string, string>;
      expect(devDeps).toBeDefined();
      expect(devDeps.postcss).toBeDefined();
    });

    it('should have autoprefixer as a dev dependency', () => {
      const devDeps = packageJson.devDependencies as Record<string, string>;
      expect(devDeps).toBeDefined();
      expect(devDeps.autoprefixer).toBeDefined();
    });

    it('should have tailwindcss-animate as a dev dependency', () => {
      const devDeps = packageJson.devDependencies as Record<string, string>;
      expect(devDeps).toBeDefined();
      expect(devDeps['tailwindcss-animate']).toBeDefined();
    });
  });

  describe('Configuration Consistency', () => {
    it('should have matching content paths in tailwind config', () => {
      // Verify the content paths match actual file structure
      expect(existsSync(appDir)).toBe(true);
      expect(tailwindConfig).toContain('./app/**/*.{js,ts,jsx,tsx,mdx}');
    });

    it('should have CSS variables referenced in both tailwind config and globals.css', () => {
      // Check that colors defined in tailwind.config.ts reference variables defined in globals.css
      const tailwindColors = [
        '--border', '--input', '--ring', '--background', '--foreground',
        '--primary', '--primary-foreground', '--secondary', '--secondary-foreground',
        '--muted', '--muted-foreground', '--accent', '--accent-foreground',
        '--destructive', '--destructive-foreground', '--popover', '--popover-foreground',
        '--card', '--card-foreground', '--brand', '--brand-foreground',
        '--success', '--success-foreground', '--warning', '--warning-foreground'
      ];

      tailwindColors.forEach(variable => {
        // Variable is referenced in tailwind config
        expect(tailwindConfig).toContain(variable);
        // Variable is defined in globals.css
        expect(globalsCss).toContain(`${variable}:`);
      });
    });

    it('should have radius variable defined and used correctly', () => {
      expect(globalsCss).toContain('--radius: 0.5rem');
      expect(tailwindConfig).toContain("lg: 'var(--radius)'");
    });

    it('should have font variables defined and used correctly', () => {
      expect(globalsCss).toContain('--font-sans:');
      expect(globalsCss).toContain('--font-heading:');
      expect(tailwindConfig).toContain("sans: ['var(--font-sans)'");
      expect(tailwindConfig).toContain("heading: ['var(--font-heading)'");
    });
  });

  describe('shadcn/ui Compatibility', () => {
    it('should use HSL color format for shadcn/ui compatibility', () => {
      // shadcn/ui expects colors in HSL format using CSS variables
      expect(tailwindConfig).toContain("hsl(var(--");
      expect(globalsCss).toMatch(/--\w+:\s*\d+\s+[\d.]+%\s+[\d.]+%/);
    });

    it('should have all shadcn/ui required color tokens', () => {
      const requiredTokens = [
        '--background', '--foreground',
        '--card', '--card-foreground',
        '--popover', '--popover-foreground',
        '--primary', '--primary-foreground',
        '--secondary', '--secondary-foreground',
        '--muted', '--muted-foreground',
        '--accent', '--accent-foreground',
        '--destructive', '--destructive-foreground',
        '--border', '--input', '--ring'
      ];

      requiredTokens.forEach(token => {
        expect(globalsCss).toContain(`${token}:`);
      });
    });

    it('should be light-only — shadcn tokens without a dark counterpart', () => {
      expect(tailwindConfig).not.toContain('darkMode');
      expect(globalsCss).not.toContain('.dark');
    });

    it('should have no dark: utility variants in app source', () => {
      const offenders = sourceFiles.filter(file => /\bdark:/.test(readFileSync(file, 'utf-8')));
      expect(offenders.map(f => f.replace(appDir, 'app'))).toEqual([]);
    });
  });

  describe('chobii.art Brand Theming', () => {
    it('should have chobii.art brand color comment', () => {
      expect(tailwindConfig).toContain('// chobii.art brand colors');
    });

    it('should have primary as the measured mesonart near-black, not amber', () => {
      // Was `--primary: 25 95% 53%` (warm amber/terracotta). The mesonart
      // parity work moved the storefront onto a single near-black pill and
      // reserved the accent role for --sale. The amber scale survives as
      // --brand-* below, which /admin and the AI generator still consume.
      expect(globalsCss).toContain('--primary: 0 0% 9%');
      expect(globalsCss).not.toContain('--primary: 25 95% 53%');
    });

    it('should keep the warm amber scale for /admin and the AI surface', () => {
      expect(globalsCss).toContain('--brand: 25 95% 53%');
    });

    it('should have complete brand color scale', () => {
      // Verify brand color scale exists with proper gradation
      const brandVars = [
        '--brand-50', '--brand-100', '--brand-200', '--brand-300', '--brand-400',
        '--brand-500', '--brand-600', '--brand-700', '--brand-800', '--brand-900', '--brand-950'
      ];
      brandVars.forEach(v => {
        expect(globalsCss).toContain(`${v}:`);
      });
    });

    it('should have poster-specific aspect ratios', () => {
      // chobii.art-specific poster aspect ratios
      expect(tailwindConfig).toContain("poster: '2/3'");
      expect(tailwindConfig).toContain("'poster-landscape': '3/2'");
      expect(tailwindConfig).toContain("'poster-square': '1/1'");
      expect(tailwindConfig).toContain("'poster-panoramic': '16/9'");
    });
  });

  describe('Performance Considerations', () => {
    it('should not include unused plugins', () => {
      // Only tailwindcss-animate should be in plugins
      const pluginsMatch = tailwindConfig.match(/plugins:\s*\[([^\]]*)\]/s);
      expect(pluginsMatch).toBeTruthy();
      expect(pluginsMatch![1]).toContain('tailwindcssAnimate');
    });

    it('should have specific content paths (not overly broad)', () => {
      // Content paths should be specific, not **/*
      expect(tailwindConfig).not.toContain("content: ['**/*']");
      expect(tailwindConfig).toContain("'./app/**/*.{js,ts,jsx,tsx,mdx}'");
    });
  });
});
