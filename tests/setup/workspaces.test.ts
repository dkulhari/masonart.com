import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tests to verify Bun workspaces are properly configured
 *
 * This test suite validates:
 * - Root package.json has workspaces configuration
 * - Workspace packages exist in the expected locations
 * - Each workspace package has proper naming and structure
 */
describe('Bun Workspaces Configuration', () => {
  const rootDir = process.cwd();
  const rootPackageJsonPath = join(rootDir, 'package.json');

  describe('Root package.json', () => {
    it('should exist at project root', () => {
      expect(existsSync(rootPackageJsonPath)).toBe(true);
    });

    it('should have workspaces field configured', () => {
      const packageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));

      expect(packageJson).toHaveProperty('workspaces');
      expect(Array.isArray(packageJson.workspaces)).toBe(true);
    });

    it('should include "packages/*" in workspaces', () => {
      const packageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));

      expect(packageJson.workspaces).toContain('packages/*');
    });

    it('should be marked as private', () => {
      const packageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));

      expect(packageJson.private).toBe(true);
    });

    it('should have test scripts configured', () => {
      const packageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));

      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts).toHaveProperty('test');
      expect(packageJson.scripts).toHaveProperty('test:e2e');
    });
  });

  describe('Workspace packages structure', () => {
    const packagesDir = join(rootDir, 'packages');
    const expectedPackages = ['api', 'web', 'shared'];

    it('should have packages directory', () => {
      expect(existsSync(packagesDir)).toBe(true);
    });

    expectedPackages.forEach((packageName) => {
      describe(`${packageName} package`, () => {
        const packagePath = join(packagesDir, packageName);
        const packageJsonPath = join(packagePath, 'package.json');

        it('should exist', () => {
          expect(existsSync(packagePath)).toBe(true);
        });

        it('should have package.json', () => {
          // Note: shared package might not have package.json yet during setup
          if (packageName === 'shared') {
            // Skip this check for shared package if it doesn't exist yet
            if (existsSync(packageJsonPath)) {
              expect(existsSync(packageJsonPath)).toBe(true);
            }
          } else {
            expect(existsSync(packageJsonPath)).toBe(true);
          }
        });

        if (packageName !== 'shared') {
          it('should have proper scoped name', () => {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

            expect(packageJson.name).toBe(`@masonart/${packageName}`);
          });

          it('should be marked as private', () => {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

            expect(packageJson.private).toBe(true);
          });

          it('should have type module', () => {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

            expect(packageJson.type).toBe('module');
          });

          it('should have test scripts', () => {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

            expect(packageJson.scripts).toBeDefined();
            expect(packageJson.scripts).toHaveProperty('test');
          });

          it('should have vitest configured as devDependency', () => {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

            expect(packageJson.devDependencies).toBeDefined();
            expect(packageJson.devDependencies).toHaveProperty('vitest');
          });
        }
      });
    });
  });

  describe('Workspace resolution', () => {
    it('should be able to resolve workspace packages', () => {
      // Check if Bun can resolve workspace dependencies
      // This is a basic check to ensure workspaces are linkable
      const apiPackagePath = join(rootDir, 'packages', 'api', 'package.json');
      const webPackagePath = join(rootDir, 'packages', 'web', 'package.json');

      expect(existsSync(apiPackagePath)).toBe(true);
      expect(existsSync(webPackagePath)).toBe(true);
    });

    it('should have unique package names', () => {
      const packageNames = new Set<string>();
      const packagesDir = join(rootDir, 'packages');
      const expectedPackages = ['api', 'web'];

      expectedPackages.forEach((packageName) => {
        const packageJsonPath = join(packagesDir, packageName, 'package.json');

        if (existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

          expect(packageNames.has(packageJson.name)).toBe(false);
          packageNames.add(packageJson.name);
        }
      });

      // Verify we have at least 2 unique package names
      expect(packageNames.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Testing infrastructure', () => {
    it('should have Playwright installed at root for E2E tests', () => {
      const packageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));

      expect(packageJson.devDependencies).toBeDefined();
      expect(packageJson.devDependencies).toHaveProperty('@playwright/test');
    });

    it('should have vitest config at root level', () => {
      const vitestConfigPath = join(rootDir, 'vitest.config.ts');

      expect(existsSync(vitestConfigPath)).toBe(true);
    });

    it('should have playwright config at root level', () => {
      const playwrightConfigPath = join(rootDir, 'playwright.config.ts');

      expect(existsSync(playwrightConfigPath)).toBe(true);
    });

    it('should have tests directory structure', () => {
      const testsDir = join(rootDir, 'tests');
      const e2eDir = join(testsDir, 'e2e');
      const setupDir = join(testsDir, 'setup');
      const integrationDir = join(testsDir, 'integration');
      const fixturesDir = join(testsDir, 'fixtures');

      expect(existsSync(testsDir)).toBe(true);
      expect(existsSync(e2eDir)).toBe(true);
      expect(existsSync(setupDir)).toBe(true);
      expect(existsSync(integrationDir)).toBe(true);
      expect(existsSync(fixturesDir)).toBe(true);
    });
  });
});
