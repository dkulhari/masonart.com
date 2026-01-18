import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
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
 * - Module imports work correctly
 */
describe('Shared Package Build', () => {
  // Detect if we're running from the shared package directory or from root
  const cwd = process.cwd();
  const isInSharedDir = cwd.endsWith('packages/shared') || cwd.endsWith('packages\\shared');
  const packageDir = isInSharedDir ? cwd : join(cwd, 'packages', 'shared');
  const packageJsonPath = join(packageDir, 'package.json');
  const tsconfigPath = join(packageDir, 'tsconfig.json');
  const rootTsconfigPath = join(packageDir, '..', '..', 'tsconfig.json');
  const srcDir = join(packageDir, 'src');
  const distDir = join(packageDir, 'dist');

  let packageJson: Record<string, unknown>;
  let tsconfig: Record<string, unknown>;
  let rootTsconfig: Record<string, unknown>;

  beforeAll(() => {
    // Load package.json and tsconfig.json once for all tests
    if (existsSync(packageJsonPath)) {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    }
    if (existsSync(tsconfigPath)) {
      tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    }
    if (existsSync(rootTsconfigPath)) {
      rootTsconfig = JSON.parse(readFileSync(rootTsconfigPath, 'utf-8'));
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

    it('should have module entry point configured', () => {
      expect(packageJson.module).toBeDefined();
      expect(packageJson.module).toContain('dist/index.js');
    });

    it('should have types entry point configured', () => {
      expect(packageJson.types).toBeDefined();
      expect(packageJson.types).toContain('dist/index.d.ts');
    });

    it('should have proper exports configuration', () => {
      const exports = packageJson.exports as Record<string, unknown>;
      expect(exports).toBeDefined();
      expect(exports['.']).toBeDefined();
    });

    it('should have root export with types and import fields', () => {
      const exports = packageJson.exports as Record<string, { types?: string; import?: string }>;
      expect(exports['.']).toHaveProperty('types');
      expect(exports['.']).toHaveProperty('import');
      expect(exports['.'].types).toContain('dist/index.d.ts');
      expect(exports['.'].import).toContain('dist/index.js');
    });

    it('should have types wildcard export configured', () => {
      const exports = packageJson.exports as Record<string, { types?: string; import?: string }>;
      expect(exports['./types/*']).toBeDefined();
      expect(exports['./types/*']).toHaveProperty('types');
      expect(exports['./types/*']).toHaveProperty('import');
    });

    it('should have schemas wildcard export configured', () => {
      const exports = packageJson.exports as Record<string, { types?: string; import?: string }>;
      expect(exports['./schemas/*']).toBeDefined();
      expect(exports['./schemas/*']).toHaveProperty('types');
      expect(exports['./schemas/*']).toHaveProperty('import');
    });

    it('should have constants wildcard export configured', () => {
      const exports = packageJson.exports as Record<string, { types?: string; import?: string }>;
      expect(exports['./constants/*']).toBeDefined();
      expect(exports['./constants/*']).toHaveProperty('types');
      expect(exports['./constants/*']).toHaveProperty('import');
    });

    it('should have files field configured to include dist', () => {
      const files = packageJson.files as string[];
      expect(files).toBeDefined();
      expect(files).toContain('dist');
    });
  });

  describe('Build Scripts', () => {
    it('should have build script configured', () => {
      const scripts = packageJson.scripts as Record<string, string>;
      expect(scripts).toBeDefined();
      expect(scripts.build).toBeDefined();
      expect(scripts.build).toContain('tsc');
    });

    it('should have dev script for watch mode', () => {
      const scripts = packageJson.scripts as Record<string, string>;
      expect(scripts.dev).toBeDefined();
      expect(scripts.dev).toContain('tsc');
      expect(scripts.dev).toContain('--watch');
    });

    it('should have typecheck script', () => {
      const scripts = packageJson.scripts as Record<string, string>;
      expect(scripts.typecheck).toBeDefined();
      expect(scripts.typecheck).toContain('tsc');
      expect(scripts.typecheck).toContain('--noEmit');
    });

    it('should have clean script', () => {
      const scripts = packageJson.scripts as Record<string, string>;
      expect(scripts.clean).toBeDefined();
    });
  });

  describe('Dependencies', () => {
    it('should have Zod as a runtime dependency', () => {
      const deps = packageJson.dependencies as Record<string, string>;
      expect(deps).toBeDefined();
      expect(deps.zod).toBeDefined();
    });

    it('should have Zod version ^3.x', () => {
      const deps = packageJson.dependencies as Record<string, string>;
      expect(deps.zod).toMatch(/^\^?3\./);
    });

    it('should have TypeScript as a dev dependency', () => {
      const devDeps = packageJson.devDependencies as Record<string, string>;
      expect(devDeps).toBeDefined();
      expect(devDeps.typescript).toBeDefined();
    });

    it('should have TypeScript version ^5.x', () => {
      const devDeps = packageJson.devDependencies as Record<string, string>;
      expect(devDeps.typescript).toMatch(/^\^?5\./);
    });
  });

  describe('TypeScript Configuration', () => {
    it('should have tsconfig.json', () => {
      expect(existsSync(tsconfigPath)).toBe(true);
    });

    it('should extend from root tsconfig', () => {
      expect(tsconfig.extends).toBeDefined();
      expect(tsconfig.extends).toContain('../../tsconfig.json');
    });

    it('should have output directory configured', () => {
      const compilerOptions = tsconfig.compilerOptions as Record<string, unknown>;
      expect(compilerOptions.outDir).toBeDefined();
      expect(compilerOptions.outDir).toContain('dist');
    });

    it('should have root directory configured', () => {
      const compilerOptions = tsconfig.compilerOptions as Record<string, unknown>;
      expect(compilerOptions.rootDir).toBeDefined();
      expect(compilerOptions.rootDir).toContain('src');
    });

    it('should generate declaration files', () => {
      const compilerOptions = tsconfig.compilerOptions as Record<string, unknown>;
      expect(compilerOptions.declaration).toBe(true);
    });

    it('should generate declaration maps', () => {
      const compilerOptions = tsconfig.compilerOptions as Record<string, unknown>;
      expect(compilerOptions.declarationMap).toBe(true);
    });

    it('should have composite enabled for project references', () => {
      const compilerOptions = tsconfig.compilerOptions as Record<string, unknown>;
      expect(compilerOptions.composite).toBe(true);
    });

    it('should include src directory', () => {
      const include = tsconfig.include as string[];
      expect(include).toBeDefined();
      expect(include.some(pattern => pattern.includes('src'))).toBe(true);
    });

    it('should exclude node_modules and dist', () => {
      const exclude = tsconfig.exclude as string[];
      expect(exclude).toBeDefined();
      expect(exclude).toContain('node_modules');
      expect(exclude).toContain('dist');
    });
  });

  describe('Root TypeScript Configuration (inherited)', () => {
    it('should target modern JavaScript (ES2022)', () => {
      const compilerOptions = rootTsconfig.compilerOptions as Record<string, unknown>;
      expect(compilerOptions.target).toBe('ES2022');
    });

    it('should use ESNext modules', () => {
      const compilerOptions = rootTsconfig.compilerOptions as Record<string, unknown>;
      expect(compilerOptions.module).toBe('ESNext');
    });

    it('should have strict mode enabled', () => {
      const compilerOptions = rootTsconfig.compilerOptions as Record<string, unknown>;
      expect(compilerOptions.strict).toBe(true);
    });

    it('should generate source maps', () => {
      const compilerOptions = rootTsconfig.compilerOptions as Record<string, unknown>;
      expect(compilerOptions.sourceMap).toBe(true);
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

    it('should have types directory', () => {
      const typesDir = join(srcDir, 'types');
      expect(existsSync(typesDir)).toBe(true);
    });

    it('should have type definition files', () => {
      const typesDir = join(srcDir, 'types');
      const expectedTypeFiles = ['product.ts', 'order.ts', 'user.ts', 'ai.ts'];
      expectedTypeFiles.forEach(file => {
        expect(existsSync(join(typesDir, file))).toBe(true);
      });
    });

    it('should have schemas directory', () => {
      const schemasDir = join(srcDir, 'schemas');
      expect(existsSync(schemasDir)).toBe(true);
    });

    it('should have schemas index file', () => {
      const schemasIndexPath = join(srcDir, 'schemas', 'index.ts');
      expect(existsSync(schemasIndexPath)).toBe(true);
    });

    it('should have schema definition files', () => {
      const schemasDir = join(srcDir, 'schemas');
      const expectedSchemaFiles = ['product.ts', 'order.ts', 'user.ts', 'ai.ts'];
      expectedSchemaFiles.forEach(file => {
        expect(existsSync(join(schemasDir, file))).toBe(true);
      });
    });

    it('should have constants directory', () => {
      const constantsDir = join(srcDir, 'constants');
      expect(existsSync(constantsDir)).toBe(true);
    });

    it('should have constants index file', () => {
      const constantsIndexPath = join(srcDir, 'constants', 'index.ts');
      expect(existsSync(constantsIndexPath)).toBe(true);
    });

    it('should have constant definition files', () => {
      const constantsDir = join(srcDir, 'constants');
      const expectedConstantFiles = ['sizes.ts', 'frames.ts', 'styles.ts'];
      expectedConstantFiles.forEach(file => {
        expect(existsSync(join(constantsDir, file))).toBe(true);
      });
    });

    it('should have valid TypeScript in main index with all exports', () => {
      const indexPath = join(srcDir, 'index.ts');
      const content = readFileSync(indexPath, 'utf-8');

      // Should export Zod
      expect(content).toContain('zod');
      // Should export types
      expect(content).toContain('./types/product');
      expect(content).toContain('./types/order');
      expect(content).toContain('./types/user');
      expect(content).toContain('./types/ai');
      // Should export schemas
      expect(content).toContain('./schemas/product');
      // Should export constants
      expect(content).toContain('./constants/sizes');
      expect(content).toContain('./constants/frames');
      expect(content).toContain('./constants/styles');
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
      } catch (error: unknown) {
        const err = error as { message: string; stdout?: string; stderr?: string };
        throw new Error(`Build failed: ${err.message}\n${err.stdout ?? ''}\n${err.stderr ?? ''}`);
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

    it('should generate main declaration maps', () => {
      const mainDtsMapPath = join(distDir, 'index.d.ts.map');
      expect(existsSync(mainDtsMapPath)).toBe(true);
    });

    it('should generate types directory in dist', () => {
      const typesDistDir = join(distDir, 'types');
      expect(existsSync(typesDistDir)).toBe(true);
    });

    it('should generate types JavaScript files', () => {
      const typesDir = join(distDir, 'types');
      const expectedFiles = ['product.js', 'order.js', 'user.js', 'ai.js'];
      expectedFiles.forEach(file => {
        expect(existsSync(join(typesDir, file))).toBe(true);
      });
    });

    it('should generate types declaration files', () => {
      const typesDir = join(distDir, 'types');
      const expectedFiles = ['product.d.ts', 'order.d.ts', 'user.d.ts', 'ai.d.ts'];
      expectedFiles.forEach(file => {
        expect(existsSync(join(typesDir, file))).toBe(true);
      });
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

    it('should generate schema definition files in dist', () => {
      const schemasDir = join(distDir, 'schemas');
      const expectedJsFiles = ['product.js', 'order.js', 'user.js', 'ai.js'];
      expectedJsFiles.forEach(file => {
        expect(existsSync(join(schemasDir, file))).toBe(true);
      });
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

    it('should generate constant definition files in dist', () => {
      const constantsDir = join(distDir, 'constants');
      const expectedJsFiles = ['sizes.js', 'frames.js', 'styles.js'];
      expectedJsFiles.forEach(file => {
        expect(existsSync(join(constantsDir, file))).toBe(true);
      });
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
      } catch (error: unknown) {
        const err = error as { message: string };
        throw new Error(`Failed to import built package: ${err.message}`);
      }
    });

    it('should export Zod correctly', async () => {
      try {
        const distIndexPath = join(distDir, 'index.js');
        const module = await import(distIndexPath);
        expect(module.z).toBeDefined();
        expect(typeof module.z.string).toBe('function');
      } catch (error: unknown) {
        const err = error as { message: string };
        throw new Error(`Failed to import Zod from package: ${err.message}`);
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
      const rootPackageJsonPath = isInSharedDir
        ? join(packageDir, '..', '..', 'package.json')
        : join(process.cwd(), 'package.json');
      const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));

      expect(rootPackageJson.workspaces).toBeDefined();
      expect(rootPackageJson.workspaces).toContain('packages/*');
    });
  });
});
