import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './assets/icon'
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: './assets/icon.ico',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/renderer/index.html',
            js: './src/renderer/renderer.tsx',
            name: 'main_window',
            preload: {
              js: './src/main/preload.ts',
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    packageAfterCopy: async (
      forgeConfig, 
      buildPath, 
      electronVersion, 
      platform, 
      arch
    ) => {
      console.log('Hook: Installing external dependencies...');
      
      // 1. Use process.cwd() instead of __dirname for ESM compatibility
      const rootDir = process.cwd();
      const pkgPath = path.join(rootDir, 'package.json');
      
      // 2. Read and parse your app's main package.json
      const appPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      // 3. Create a minimal package.json in the packaged app directory
      const buildPkgPath = path.join(buildPath, 'package.json');
      const buildPkg = {
        name: 'your-app-externals',
        private: true,
        dependencies: {
          // Explicitly type assert or safely access the dependency
          '@github/copilot-sdk': appPkg.dependencies?.['@github/copilot-sdk']
        }
      };
      
      fs.writeFileSync(buildPkgPath, JSON.stringify(buildPkg, null, 2));

      // 4. Run npm install inside the packaged folder
      execSync('npm install --omit=dev', { 
        cwd: buildPath, 
        stdio: 'inherit' 
      });
      
      console.log('Hook: External dependencies installed successfully!');
    }
  },
};

export default config;
