/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimal type stubs for chrome-devtools-frontend testing utilities referenced by tsconfig include paths.
 */

declare module '../../../../testing/TraceLoader.js' {
  export const TraceLoader: unknown;
}

declare namespace Mocha {
  type Suite = Record<string, unknown>;
  type Context = Record<string, unknown>;
}
