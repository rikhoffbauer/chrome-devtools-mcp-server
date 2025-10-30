/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const URI_PREFIX = 'chrome-devtools://pages/';
const SEGMENT_SOURCES = '/sources/';

export function buildPageSourceUri(
  pageIndex: number,
  sourceId: string,
): string {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new Error('Page index must be a non-negative integer.');
  }
  if (!sourceId) {
    throw new Error('Source id is required to build a resource URI.');
  }
  return `${URI_PREFIX}${pageIndex}${SEGMENT_SOURCES}${encodeURIComponent(sourceId)}`;
}

export function parsePageSourceUri(uri: string): {
  pageIndex: number;
  sourceId: string;
} {
  if (!uri.startsWith(URI_PREFIX) || !uri.includes(SEGMENT_SOURCES)) {
    throw new Error('Invalid page source URI.');
  }
  const [pagePart, sourcePart] = uri
    .substring(URI_PREFIX.length)
    .split(SEGMENT_SOURCES);
  const pageIndex = Number.parseInt(pagePart, 10);
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new Error('Invalid page index in page source URI.');
  }
  const sourceId = decodeURIComponent(sourcePart ?? '');
  if (!sourceId) {
    throw new Error('Missing source identifier in page source URI.');
  }
  return {pageIndex, sourceId};
}
