/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimal type stubs for chrome-devtools-frontend testing utilities referenced by tsconfig include paths.
 */

declare module '../../../../testing/TraceLoader.js' {
  const TraceLoader: unknown;
  export = TraceLoader;
}

declare namespace Mocha {
  interface Suite {}
  interface Context {}
}
