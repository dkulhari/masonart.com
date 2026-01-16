import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Tests to verify @masonart/shared package builds correctly
 *
 * This test suite validates:
 * - Package configuration (package.json)
 * - TypeScript configuration (tsconfig.json)
 * - Source files structure
 * - Build process and output
 * - Package exports configuration
 */
describe('Shared Package Build', () => {
  const packageDir = join(process.cwd(), 'packages', 'shared');
  const packageJsonPath = join(packageDir, 'package.json');
  const tsconfigPath = join(packageDir, 'tsconfig.json');
  const srcDir = join(packageDir, 'src');
  const distDir = join(packageDir, 'dist');

  let packageJson: any;
  let tsconfig: any;

  beforeAll(() => {
    // Load package.json and tsconfig.json once for all tests
    if (existsSync(packageJsonPath)) {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    }
    if (existsSync(tsconfigPath)) {
      tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    }
  });

  describe('Package Configuration', () => {
    it('should have package.json in the correct location', () => {
      expect(existsSync(packageJsonPath)).toBe(true);
    });

    it('should have correct package name', () => {
      expect(packageJson.name).toBe('@masonart/shared');
    });

    it('should be marked as private', () => {
      expect(packageJson.private).toBe(true);
    });

    it('should use ES modules', () => {
      expect(packageJson.type).toBe('module');
    });

    it('should have main entry point configured', () => {
      expect(packageJson.main).toBeDefined();
      expect(packageJson.main).toContain('dist/index.js');
    });

    it('should have types entry point configured', () => {
      expect(packageJson.types).toBeDefined();
      expect(packageJson.types).toContain('dist/index.d.ts');
    });

    it('should have proper exports configuration', () => {
      expect(packageJson.exports).toBeDefined();
      expect(packageJson.exports['.']).toBeDefined();
      expect(packageJson.exports['./schemas']).toBeDefined();
      expect(packageJson.exports['./constants']).toBeDefined();
    });

    it('should have root export with types and import fields', () => {
      expect(packageJson.exports['.']).toHaveProperty('types');
      expect(packageJson.exports['.']).toHaveProperty('import');
      expect(packageJson.exports['.'].types).toContain('dist/index.d.ts');
      expect(packageJson.exports['.'].import).toContain('dist/index.js');
    });

    it('should have schemas export configured', () => {
      expect(packageJson.exports['./schemas']).toHaveProperty('types');
      expect(packageJson.exports['./schemas']).toHaveProperty('import');
      expect(packageJson.exports['./schemas'].types).toContain('dist/schemas/index.d.ts');
      expect(packageJson.exports['./schemas'].import).toContain('dist/schemas/index.js');
    });

    it('should have constants export configured', () => {
      expect(packageJson.exports['./constants']).toHaveProperty('types');
      expect(packageJson.exports['./constants']).toHaveProperty('import');
      expect(packageJson.exports['./constants'].types).toContain('dist/constants/index.d.ts');
      expect(packageJson.exports['./constants'].import).toContain('dist/constants/index.js');
    });
  });

  describe('Build Scripts', () => {
    it('should have build script configured', () => {
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts.build).toBeDefined();
      expect(packageJson.scripts.build).toContain('tsc');
    });

    it('should have test scripts configured', () => {
      expect(packageJson.scripts.test).toBeDefined();
      expect(packageJson.scripts['test:coverage']).toBeDefined();
    });
  });

  describe('Dependencies', () => {
    it('should have Zod as a runtime dependency', () => {
      expect(packageJson.dependencies).toBeDefined();
      expect(packageJson.dependencies.zod).toBeDefined();
    });

    it('should have TypeScript as a dev dependency', () => {
      expect(packageJson.devDependencies).toBeDefined();
      expect(packageJson.devDependencies.typescript).toBeDefined();
    });

    it('should have Vitest as a dev dependency', () => {
      expect(packageJson.devDependencies.vitest).toBeDefined();
      expect(packageJson.devDependencies['@vitest/coverage-v8']).toBeDefined();
    });
  });

  describe('TypeScript Configuration', () => {
    it('should have tsconfig.json', () => {
      expect(existsSync(tsconfigPath)).toBe(true);
    });

    it('should target modern JavaScript (ES2022)', () => {
      expect(tsconfig.compilerOptions.target).toBe('ES2022');
    });

    it('should use ESNext modules', () => {
      expect(tsconfig.compilerOptions.module).toBe('ESNext');
    });

    it('should have output directory configured', () => {
      expect(tsconfig.compilerOptions.outDir).toBeDefined();
      expect(tsconfig.compilerOptions.outDir).toContain('dist');
    });

    it('should have root directory configured', () => {
      expect(tsconfig.compilerOptions.rootDir).toBeDefined();
      expect(tsconfig.compilerOptions.rootDir).toContain('src');
    });

    it('should generate declaration files', () => {
      expect(tsconfig.compilerOptions.declaration).toBe(true);
    });

    it('should generate declaration maps', () => {
      expect(tsconfig.compilerOptions.declarationMap).toBe(true);
    });

    it('should generate source maps', () => {
      expect(tsconfig.compilerOptions.sourceMap).toBe(true);
    });

    it('should have strict mode enabled', () => {
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it('should include src directory', () => {
      expect(tsconfig.include).toBeDefined();
      expect(tsconfig.include).toContain('src/**/*');
    });

    it('should exclude node_modules and dist', () => {
      expect(tsconfig.exclude).toBeDefined();
      expect(tsconfig.exclude).toContain('node_modules');
      expect(tsconfig.exclude).toContain('dist');
    });
  });

  describe('Source Structure', () => {
    it('should have src directory', () => {
      expect(existsSync(srcDir)).toBe(true);
    });

    it('should have main index file', () => {
      const indexPath = join(srcDir, 'index.ts');
      expect(existsSync(indexPath)).toBe(true);
    });

    it('should have schemas directory', () => {
      const schemasDir = join(srcDir, 'schemas');
      expect(existsSync(schemasDir)).toBe(true);
    });

    it('should have schemas index file', () => {
      const schemasIndexPath = join(srcDir, 'schemas', 'index.ts');
      expect(existsSync(schemasIndexPath)).toBe(true);
    });

    it('should have constants directory', () => {
      const constantsDir = join(srcDir, 'constants');
      expect(existsSync(constantsDir)).toBe(true);
    });

    it('should have constants index file', () => {
      const constantsIndexPath = join(srcDir, 'constants', 'index.ts');
      expect(existsSync(constantsIndexPath)).toBe(true);
    });

    it('should have valid TypeScript in main index', () => {
      const indexPath = join(srcDir, 'index.ts');
      const content = readFileSync(indexPath, 'utf-8');

      // Should export from schemas and constants
      expect(content).toContain('export');
      expect(content).toContain('schemas');
      expect(content).toContain('constants');
    });
  });

  describe('Vitest Configuration', () => {
    it('should have vitest.config.ts', () => {
      const vitestConfigPath = join(packageDir, 'vitest.config.ts');
      expect(existsSync(vitestConfigPath)).toBe(true);
    });

    it('should have tests directory', () => {
      const testsDir = join(packageDir, 'tests');
      expect(existsSync(testsDir)).toBe(true);
    });
  });

  describe('Build Process', () => {
    it('should successfully run TypeScript compiler', () => {
      try {
        // Run build in the shared package directory
        execSync('bun run build', {
          cwd: packageDir,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        // If we reach here, build succeeded
        expect(true).toBe(true);
      } catch (error: any) {
        // If build fails, show the error
        throw new Error(`Build failed: ${error.message}\n${error.stdout}\n${error.stderr}`);
      }
    });

    it('should generate dist directory', () => {
      expect(existsSync(distDir)).toBe(true);
    });

    it('should generate main JavaScript file', () => {
      const mainJsPath = join(distDir, 'index.js');
      expect(existsSync(mainJsPath)).toBe(true);
    });

    it('should generate main type declarations', () => {
      const mainDtsPath = join(distDir, 'index.d.ts');
      expect(existsSync(mainDtsPath)).toBe(true);
    });

    it('should generate schemas directory in dist', () => {
      const schemasDistDir = join(distDir, 'schemas');
      expect(existsSync(schemasDistDir)).toBe(true);
    });

    it('should generate schemas JavaScript file', () => {
      const schemasJsPath = join(distDir, 'schemas', 'index.js');
      expect(existsSync(schemasJsPath)).toBe(true);
    });

    it('should generate schemas type declarations', () => {
      const schemasDtsPath = join(distDir, 'schemas', 'index.d.ts');
      expect(existsSync(schemasDtsPath)).toBe(true);
    });

    it('should generate constants directory in dist', () => {
      const constantsDistDir = join(distDir, 'constants');
      expect(existsSync(constantsDistDir)).toBe(true);
    });

    it('should generate constants JavaScript file', () => {
      const constantsJsPath = join(distDir, 'constants', 'index.js');
      expect(existsSync(constantsJsPath)).toBe(true);
    });

    it('should generate constants type declarations', () => {
      const constantsDtsPath = join(distDir, 'constants', 'index.d.ts');
      expect(existsSync(constantsDtsPath)).toBe(true);
    });

    it('should generate source maps', () => {
      const mainJsMapPath = join(distDir, 'index.js.map');
      expect(existsSync(mainJsMapPath)).toBe(true);
    });

    it('should be importable as a module', async () => {
      // Verify the built package can be imported
      try {
        const distIndexPath = join(distDir, 'index.js');
        const module = await import(distIndexPath);
        expect(module).toBeDefined();
      } catch (error: any) {
        throw new Error(`Failed to import built package: ${error.message}`);
      }
    });
  });

  describe('Package Integrity', () => {
    it('should have consistent package structure', () => {
      // Verify all critical files exist
      const criticalFiles = [
        packageJsonPath,
        tsconfigPath,
        join(packageDir, 'vitest.config.ts'),
        join(srcDir, 'index.ts'),
        join(srcDir, 'schemas', 'index.ts'),
        join(srcDir, 'constants', 'index.ts'),
      ];

      criticalFiles.forEach(file => {
        expect(existsSync(file)).toBe(true);
      });
    });

    it('should have version number', () => {
      expect(packageJson.version).toBeDefined();
      expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should be a workspace package', () => {
      // Verify this is part of the monorepo workspace
      const rootPackageJsonPath = join(process.cwd(), 'package.json');
      const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));

      expect(rootPackageJson.workspaces).toBeDefined();
      expect(rootPackageJson.workspaces).toContain('packages/*');
    });
  });
});
