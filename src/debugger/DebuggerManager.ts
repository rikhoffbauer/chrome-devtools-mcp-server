/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Debugger} from 'debug';
import type Protocol from 'devtools-protocol';
import type {CDPSession, Page} from 'puppeteer-core';
import {SourceMapConsumer, type RawSourceMap} from 'source-map-js';

const DEFAULT_SCRIPT_MIME = 'text/javascript';
const ORIGINAL_SOURCE_MIME = 'text/plain';

type SourceKind = 'compiled' | 'original';

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf-8');
}

function guessMimeType(
  url?: string,
  fallback: string = ORIGINAL_SOURCE_MIME,
): string {
  if (!url) {
    return fallback;
  }
  const lower = url.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    return 'text/typescript';
  }
  if (lower.endsWith('.jsx')) {
    return 'text/jsx';
  }
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  ) {
    return 'text/javascript';
  }
  if (lower.endsWith('.json')) {
    return 'application/json';
  }
  if (lower.endsWith('.css')) {
    return 'text/css';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'text/html';
  }
  return fallback;
}

function formatRemoteObject(value?: Protocol.Runtime.RemoteObject): string {
  if (!value) {
    return '<unavailable>';
  }
  if (value.type === 'undefined') {
    return 'undefined';
  }
  if (value.type === 'string') {
    return JSON.stringify(value.value ?? value.description ?? '');
  }
  if (
    value.type === 'number' ||
    value.type === 'boolean' ||
    value.type === 'bigint'
  ) {
    if (value.value !== undefined) {
      return String(value.value);
    }
    if (value.description) {
      return value.description;
    }
  }
  if (value.type === 'symbol') {
    return value.description ?? 'Symbol';
  }
  if (value.type === 'function') {
    return value.description ?? 'function';
  }
  if (value.type === 'object') {
    if (value.subtype === 'null') {
      return 'null';
    }
    if (value.className) {
      return value.className;
    }
    if (value.description) {
      return value.description;
    }
  }
  if (value.description) {
    return value.description;
  }
  return value.type ?? 'unknown';
}

export interface BreakpointInfo {
  breakpointId: string;
  requested: {
    url: string;
    lineNumber: number;
    columnNumber?: number;
    condition?: string;
    sourceId?: string;
    originalUrl?: string;
  };
  resolvedLocation?: Protocol.Debugger.Location;
}

export interface PausedDetails {
  reason: Protocol.Debugger.PausedEvent['reason'];
  hitBreakpoints: string[];
  callFrames: Protocol.Debugger.CallFrame[];
  description?: string;
}

export interface ScopeDescription {
  type: Protocol.Debugger.Scope['type'];
  name: string;
  variables: Array<{name: string; value: string}>;
}

export interface PageSourceDescriptor {
  id: string;
  kind: SourceKind;
  scriptId: string;
  displayName: string;
  url?: string;
  originalUrl?: string;
  mimeType: string;
}

export interface PageSourceContent {
  kind: SourceKind;
  url?: string;
  mimeType: string;
  text: string;
}

interface ScriptSourceRecord {
  scriptId: string;
  url?: string;
  executionContextId?: number;
  sourceMapUrl?: string;
  sourceText?: string;
  sourceTextLoaded?: boolean;
  sourceMap?: RawSourceMap;
  sourceMapLoaded?: boolean;
  originalSources: Map<string, OriginalSourceRecord>;
}

interface OriginalSourceRecord {
  id: string;
  scriptId: string;
  mapIndex: number;
  url: string;
  mimeType: string;
  content?: string;
  contentLoaded?: boolean;
}

export class DebuggerSession {
  #page: Page;
  #logger: Debugger;
  #session?: CDPSession;
  #debuggerEnabled = false;
  #runtimeEnabled = false;
  #pageDomainEnabled = false;
  #breakpoints = new Map<string, BreakpointInfo>();
  #pausedDetails?: PausedDetails;
  #scriptIdToUrl = new Map<string, string>();
  #executionContextToFrameId = new Map<number, string>();
  #scriptSources = new Map<string, ScriptSourceRecord>();
  #sourcesById = new Map<string, OriginalSourceRecord | ScriptSourceRecord>();

  constructor(page: Page, logger: Debugger) {
    this.#page = page;
    this.#logger = logger;
    this.#page.once('close', () => {
      void this.dispose();
    });
  }

  async dispose(): Promise<void> {
    if (this.#session) {
      try {
        await this.#session.detach();
      } catch {
        // Ignore failures when detaching.
      }
    }
    this.#session = undefined;
    this.#debuggerEnabled = false;
    this.#runtimeEnabled = false;
    this.#pageDomainEnabled = false;
    this.#pausedDetails = undefined;
    this.#breakpoints.clear();
    this.#scriptIdToUrl.clear();
    this.#executionContextToFrameId.clear();
    this.#scriptSources.clear();
    this.#sourcesById.clear();
  }

  async #ensureSession(): Promise<CDPSession> {
    if (this.#session) {
      return this.#session;
    }
    this.#session = await this.#page.target().createCDPSession();
    this.#session.on('Debugger.paused', event => {
      this.#pausedDetails = {
        reason: event.reason,
        hitBreakpoints: event.hitBreakpoints ?? [],
        callFrames: event.callFrames,
        description: event.data?.description,
      };
    });
    this.#session.on('Debugger.resumed', () => {
      this.#pausedDetails = undefined;
    });
    this.#session.on('Debugger.breakpointResolved', event => {
      const info = this.#breakpoints.get(event.breakpointId);
      if (info) {
        info.resolvedLocation = event.location;
      }
    });
    this.#session.on('Debugger.scriptParsed', event => {
      if (event.url) {
        this.#scriptIdToUrl.set(event.scriptId, event.url);
      }
      this.#recordScript(event);
    });
    this.#session.on('Runtime.executionContextCreated', event => {
      const frameId = event.context.auxData?.frameId;
      if (frameId) {
        this.#executionContextToFrameId.set(event.context.id, frameId);
      }
    });
    this.#session.on('Runtime.executionContextDestroyed', event => {
      this.#executionContextToFrameId.delete(event.executionContextId);
    });
    this.#session.on('Runtime.executionContextsCleared', () => {
      this.#executionContextToFrameId.clear();
    });
    return this.#session;
  }

  async start(): Promise<void> {
    const session = await this.#ensureSession();
    if (!this.#runtimeEnabled) {
      await session.send('Runtime.enable');
      this.#runtimeEnabled = true;
    }
    if (!this.#debuggerEnabled) {
      await session.send('Debugger.enable');
      this.#debuggerEnabled = true;
      this.#scriptSources.clear();
      this.#sourcesById.clear();
    }
  }

  async stop(): Promise<void> {
    if (!this.#session || !this.#debuggerEnabled) {
      return;
    }
    try {
      await this.#session.send('Debugger.disable');
    } catch (error) {
      this.#logger(`Failed to disable Debugger domain: ${String(error)}`);
    }
    this.#debuggerEnabled = false;
    this.#pausedDetails = undefined;
    this.#breakpoints.clear();
    this.#scriptIdToUrl.clear();
    this.#executionContextToFrameId.clear();
    this.#scriptSources.clear();
    this.#sourcesById.clear();
    if (this.#runtimeEnabled) {
      try {
        await this.#session.send('Runtime.disable');
      } catch (error) {
        this.#logger(`Failed to disable Runtime domain: ${String(error)}`);
      }
      this.#runtimeEnabled = false;
    }
    if (this.#pageDomainEnabled) {
      try {
        await this.#session.send('Page.disable');
      } catch (error) {
        this.#logger(`Failed to disable Page domain: ${String(error)}`);
      }
      this.#pageDomainEnabled = false;
    }
  }

  isEnabled(): boolean {
    return this.#debuggerEnabled;
  }

  isPaused(): boolean {
    return this.#pausedDetails !== undefined;
  }

  getPausedDetails(): PausedDetails | undefined {
    return this.#pausedDetails;
  }

  listBreakpoints(): BreakpointInfo[] {
    return Array.from(this.#breakpoints.values());
  }

  async setBreakpoint(options: {
    url?: string;
    sourceId?: string;
    lineNumber: number;
    columnNumber?: number;
    condition?: string;
  }): Promise<BreakpointInfo> {
    if (!options.url && !options.sourceId) {
      throw new Error('Provide a script URL or sourceId to set a breakpoint.');
    }
    await this.start();
    const session = await this.#ensureSession();
    const requestedLineNumber = options.lineNumber;
    const requestedColumnNumber = options.columnNumber;
    let targetUrl = options.url;
    let lineNumber = options.lineNumber;
    let columnNumber = options.columnNumber;
    let originalUrl: string | undefined;

    if (options.sourceId) {
      const mapped = await this.#mapOriginalLocation(
        options.sourceId,
        options.lineNumber,
        options.columnNumber,
      );
      targetUrl = mapped.url;
      lineNumber = mapped.lineNumber;
      columnNumber = mapped.columnNumber ?? undefined;
      originalUrl = mapped.originalUrl;
    }

    if (!targetUrl) {
      throw new Error('Failed to resolve a script URL for the breakpoint.');
    }

    const params: Protocol.Debugger.SetBreakpointByUrlRequest = {
      url: targetUrl,
      lineNumber: Math.max(0, lineNumber - 1),
    };
    if (columnNumber !== undefined) {
      params.columnNumber = Math.max(0, columnNumber - 1);
    }
    if (options.condition) {
      params.condition = options.condition;
    }

    const result = await session.send('Debugger.setBreakpointByUrl', params);
    const info: BreakpointInfo = {
      breakpointId: result.breakpointId,
      requested: {
        url: targetUrl,
        lineNumber: requestedLineNumber,
        columnNumber: requestedColumnNumber,
        condition: options.condition,
        sourceId: options.sourceId,
        originalUrl,
      },
      resolvedLocation: result.locations[0],
    };
    this.#breakpoints.set(info.breakpointId, info);
    return info;
  }

  async removeBreakpointById(breakpointId: string): Promise<boolean> {
    await this.start();
    const session = await this.#ensureSession();
    if (!this.#breakpoints.has(breakpointId)) {
      return false;
    }
    await session.send('Debugger.removeBreakpoint', {breakpointId});
    this.#breakpoints.delete(breakpointId);
    return true;
  }

  async removeBreakpointsByLocation(options: {
    url?: string;
    sourceId?: string;
    lineNumber: number;
    columnNumber?: number;
  }): Promise<string[]> {
    await this.start();
    const toRemove: string[] = [];
    for (const [breakpointId, info] of this.#breakpoints.entries()) {
      if (options.sourceId) {
        if (info.requested.sourceId !== options.sourceId) {
          continue;
        }
      } else if (options.url) {
        if (info.requested.url !== options.url) {
          continue;
        }
      } else {
        continue;
      }

      const requestedLine = info.requested.lineNumber;
      const resolvedLine = info.resolvedLocation
        ? info.resolvedLocation.lineNumber + 1
        : undefined;
      if (
        requestedLine !== options.lineNumber &&
        resolvedLine !== options.lineNumber
      ) {
        continue;
      }

      if (options.columnNumber !== undefined) {
        const requestedColumn = info.requested.columnNumber;
        const resolvedColumn =
          info.resolvedLocation?.columnNumber !== undefined
            ? info.resolvedLocation.columnNumber + 1
            : undefined;
        if (
          requestedColumn !== options.columnNumber &&
          resolvedColumn !== options.columnNumber
        ) {
          continue;
        }
      }

      toRemove.push(breakpointId);
    }

    if (toRemove.length === 0) {
      return toRemove;
    }

    const session = await this.#ensureSession();
    await Promise.all(
      toRemove.map(async breakpointId => {
        await session.send('Debugger.removeBreakpoint', {breakpointId});
        this.#breakpoints.delete(breakpointId);
      }),
    );
    return toRemove;
  }

  async pause(): Promise<void> {
    await this.start();
    const session = await this.#ensureSession();
    await session.send('Debugger.pause');
  }

  async resume(): Promise<void> {
    await this.start();
    const session = await this.#ensureSession();
    await session.send('Debugger.resume');
    this.#pausedDetails = undefined;
  }

  async stepInto(): Promise<void> {
    await this.start();
    const session = await this.#ensureSession();
    await session.send('Debugger.stepInto');
  }

  async stepOut(): Promise<void> {
    await this.start();
    const session = await this.#ensureSession();
    await session.send('Debugger.stepOut');
  }

  async stepOver(): Promise<void> {
    await this.start();
    const session = await this.#ensureSession();
    await session.send('Debugger.stepOver');
  }

  async evaluateOnCallFrame(options: {
    callFrameId: string;
    expression: string;
  }): Promise<string> {
    await this.start();
    const session = await this.#ensureSession();
    const result = await session.send('Debugger.evaluateOnCallFrame', {
      callFrameId: options.callFrameId,
      expression: options.expression,
      generatePreview: true,
    });
    if (result.exceptionDetails) {
      const text =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'Evaluation failed';
      throw new Error(text);
    }
    if (result.result.objectId) {
      try {
        await session.send('Runtime.releaseObject', {
          objectId: result.result.objectId,
        });
      } catch (error) {
        this.#logger(`Failed to release remote object: ${String(error)}`);
      }
    }
    return formatRemoteObject(result.result);
  }

  async describeScopes(callFrameId: string): Promise<ScopeDescription[]> {
    await this.start();
    const session = await this.#ensureSession();
    if (!this.#pausedDetails) {
      throw new Error('Debugger is not paused.');
    }
    const callFrame = this.#pausedDetails.callFrames.find(
      frame => frame.callFrameId === callFrameId,
    );
    if (!callFrame) {
      throw new Error('Call frame not found.');
    }
    const scopes: ScopeDescription[] = [];
    for (const scope of callFrame.scopeChain) {
      if (!scope.object.objectId) {
        continue;
      }
      let properties: Protocol.Runtime.GetPropertiesResponse;
      try {
        properties = await session.send('Runtime.getProperties', {
          objectId: scope.object.objectId,
          ownProperties: true,
        });
      } catch (error) {
        this.#logger(`Failed to read scope properties: ${String(error)}`);
        continue;
      }
      const variables: Array<{name: string; value: string}> = [];
      for (const property of properties.result) {
        if (!property.enumerable) {
          continue;
        }
        const valueString = formatRemoteObject(property.value);
        variables.push({
          name: property.name,
          value: valueString,
        });
        if (property.value?.objectId) {
          try {
            await session.send('Runtime.releaseObject', {
              objectId: property.value.objectId,
            });
          } catch (error) {
            this.#logger(`Failed to release property object: ${String(error)}`);
          }
        }
      }
      scopes.push({
        type: scope.type,
        name: scope.name ?? scope.type,
        variables,
      });
      if (scope.object.objectId) {
        try {
          await session.send('Runtime.releaseObject', {
            objectId: scope.object.objectId,
          });
        } catch (error) {
          this.#logger(`Failed to release scope object: ${String(error)}`);
        }
      }
    }
    return scopes;
  }

  resolveLocation(location?: Protocol.Debugger.Location): {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  } {
    if (!location) {
      return {};
    }
    const url = this.#scriptIdToUrl.get(location.scriptId);
    return {
      url,
      lineNumber: location.lineNumber + 1,
      columnNumber:
        location.columnNumber !== undefined
          ? location.columnNumber + 1
          : undefined,
    };
  }

  async listSources(): Promise<PageSourceDescriptor[]> {
    await this.start();
    await this.#ensureSession();
    const descriptors: PageSourceDescriptor[] = [];
    for (const record of this.#scriptSources.values()) {
      descriptors.push(this.#describeCompiledSource(record));
      await this.#ensureSourceMap(record);
      for (const original of record.originalSources.values()) {
        descriptors.push(this.#describeOriginalSource(record, original));
      }
    }
    return descriptors;
  }

  async getSourceContent(sourceId: string): Promise<PageSourceContent> {
    await this.start();
    await this.#ensureSession();
    const descriptor = this.#sourcesById.get(sourceId);
    if (!descriptor) {
      throw new Error(`Unknown source ${sourceId}`);
    }
    if ('mapIndex' in descriptor) {
      const scriptRecord = this.#scriptSources.get(descriptor.scriptId);
      if (!scriptRecord) {
        throw new Error(`Script ${descriptor.scriptId} no longer available.`);
      }
      const text = await this.#loadOriginalSourceText(scriptRecord, descriptor);
      return {
        kind: 'original',
        url: descriptor.url,
        mimeType: descriptor.mimeType,
        text,
      };
    }
    const scriptRecord = descriptor;
    const text = await this.#loadCompiledSourceText(scriptRecord);
    return {
      kind: 'compiled',
      url: scriptRecord.url,
      mimeType: guessMimeType(scriptRecord.url, DEFAULT_SCRIPT_MIME),
      text,
    };
  }

  #describeCompiledSource(record: ScriptSourceRecord): PageSourceDescriptor {
    const id = this.#compiledSourceId(record.scriptId);
    this.#sourcesById.set(id, record);
    const displayName = record.url ?? `<anonymous script ${record.scriptId}>`;
    return {
      id,
      kind: 'compiled',
      scriptId: record.scriptId,
      displayName,
      url: record.url,
      mimeType: guessMimeType(record.url, DEFAULT_SCRIPT_MIME),
    };
  }

  #describeOriginalSource(
    record: ScriptSourceRecord,
    original: OriginalSourceRecord,
  ): PageSourceDescriptor {
    this.#sourcesById.set(original.id, original);
    return {
      id: original.id,
      kind: 'original',
      scriptId: record.scriptId,
      displayName: original.url,
      url: record.url,
      originalUrl: original.url,
      mimeType: original.mimeType,
    };
  }

  async #loadCompiledSourceText(record: ScriptSourceRecord): Promise<string> {
    if (record.sourceTextLoaded && record.sourceText !== undefined) {
      return record.sourceText;
    }
    const session = await this.#ensureSession();
    const result = await session.send('Debugger.getScriptSource', {
      scriptId: record.scriptId,
    });
    record.sourceText = result.scriptSource ?? '';
    record.sourceTextLoaded = true;
    return record.sourceText;
  }

  async #loadOriginalSourceText(
    record: ScriptSourceRecord,
    original: OriginalSourceRecord,
  ): Promise<string> {
    if (original.contentLoaded && original.content !== undefined) {
      return original.content ?? '';
    }
    const sourceMap = await this.#ensureSourceMap(record);
    if (!sourceMap) {
      throw new Error('Source map data unavailable for original source.');
    }
    if (sourceMap.sourcesContent?.[original.mapIndex]) {
      original.content = sourceMap.sourcesContent[original.mapIndex] ?? '';
      original.contentLoaded = true;
      return original.content ?? '';
    }
    const content = await this.#fetchResourceContent(
      record,
      sourceMap,
      original.url,
    );
    original.content = content;
    original.contentLoaded = true;
    return content;
  }

  async #mapOriginalLocation(
    sourceId: string,
    lineNumber: number,
    columnNumber?: number,
  ): Promise<{
    url: string;
    lineNumber: number;
    columnNumber?: number;
    originalUrl?: string;
  }> {
    const descriptor = this.#sourcesById.get(sourceId);
    if (!descriptor || !('mapIndex' in descriptor)) {
      throw new Error(`Source ${sourceId} is not an original source.`);
    }
    const scriptRecord = this.#scriptSources.get(descriptor.scriptId);
    if (!scriptRecord) {
      throw new Error(`Script ${descriptor.scriptId} not found for mapping.`);
    }
    const sourceMap = await this.#ensureSourceMap(scriptRecord);
    if (!sourceMap) {
      throw new Error('No source map available to resolve original location.');
    }
    const scriptUrl = scriptRecord.url;
    if (!scriptUrl) {
      throw new Error('Cannot resolve generated URL for anonymous script.');
    }

    const consumer = new SourceMapConsumer(sourceMap) as SourceMapConsumer & {
      sources: ReadonlyArray<string>;
      destroy?: () => void;
    };
    const sources = consumer.sources;
    const sourceForIndex = sources[descriptor.mapIndex];
    if (!sourceForIndex) {
      consumer.destroy?.();
      throw new Error('Could not resolve original source entry from map.');
    }
    const generated = consumer.generatedPositionFor({
      source: sourceForIndex,
      line: lineNumber,
      column: columnNumber !== undefined ? Math.max(columnNumber - 1, 0) : 0,
      bias: SourceMapConsumer.GREATEST_LOWER_BOUND,
    });

    if (!generated || generated.line === null) {
      consumer.destroy?.();
      throw new Error('Could not map requested location to generated code.');
    }

    consumer.destroy?.();

    return {
      url: scriptUrl,
      lineNumber: generated.line,
      columnNumber:
        generated.column !== null && generated.column !== undefined
          ? generated.column + 1
          : undefined,
      originalUrl: descriptor.url,
    };
  }

  async #fetchResourceContent(
    record: ScriptSourceRecord,
    sourceMap: RawSourceMap | undefined,
    url: string,
  ): Promise<string> {
    const session = await this.#ensureSession();
    const frameId = record.executionContextId
      ? this.#executionContextToFrameId.get(record.executionContextId)
      : undefined;
    const resolvedUrl = this.#resolveSourceUrl(sourceMap, record.url, url);
    try {
      if (!this.#pageDomainEnabled) {
        await session.send('Page.enable');
        this.#pageDomainEnabled = true;
      }
      if (!frameId) {
        throw new Error('Frame id unavailable to fetch resource content.');
      }
      const result = await session.send('Page.getResourceContent', {
        frameId,
        url: resolvedUrl,
      });
      if (result.base64Encoded) {
        return Buffer.from(result.content, 'base64').toString('utf-8');
      }
      return result.content;
    } catch (error) {
      this.#logger(
        `Failed to fetch content for ${resolvedUrl}: ${String(error)}`,
      );
      throw new Error(
        `Unable to retrieve source content for ${resolvedUrl}. Ensure the file is accessible to the browser context.`,
      );
    }
  }

  #resolveSourceUrl(
    sourceMap: RawSourceMap | undefined,
    scriptUrl: string | undefined,
    sourceUrl: string,
  ): string {
    try {
      if (sourceUrl.startsWith('data:')) {
        return sourceUrl;
      }
      if (sourceUrl.includes('://')) {
        return sourceUrl;
      }
      if (sourceMap?.sourceRoot) {
        return new URL(sourceUrl, sourceMap.sourceRoot).toString();
      }
      if (scriptUrl) {
        return new URL(sourceUrl, scriptUrl).toString();
      }
    } catch (error) {
      this.#logger(
        `Failed to resolve source URL ${sourceUrl}: ${String(error)}`,
      );
    }
    return sourceUrl;
  }

  async #ensureSourceMap(
    record: ScriptSourceRecord,
  ): Promise<RawSourceMap | undefined> {
    if (!record.sourceMapUrl) {
      return undefined;
    }
    if (record.sourceMapLoaded && record.sourceMap) {
      return record.sourceMap;
    }
    const mapText = await this.#loadSourceMapText(record);
    if (!mapText) {
      record.sourceMapLoaded = true;
      return undefined;
    }
    try {
      const parsed: RawSourceMap = JSON.parse(mapText);
      record.sourceMap = parsed;
      record.sourceMapLoaded = true;
      record.originalSources = new Map(
        parsed.sources.map((sourceUrl: string, index: number) => {
          const resolvedUrl = this.#resolveSourceUrl(
            parsed,
            record.url,
            sourceUrl,
          );
          const id = this.#originalSourceId(record.scriptId, resolvedUrl);
          return [
            id,
            {
              id,
              scriptId: record.scriptId,
              mapIndex: index,
              url: resolvedUrl,
              mimeType: guessMimeType(resolvedUrl),
            },
          ];
        }),
      );
      return parsed;
    } catch (error) {
      this.#logger(`Failed to parse source map: ${String(error)}`);
      record.sourceMapLoaded = true;
      return undefined;
    }
  }

  async #loadSourceMapText(
    record: ScriptSourceRecord,
  ): Promise<string | undefined> {
    const url = record.sourceMapUrl;
    if (!url) {
      return undefined;
    }
    if (url.startsWith('data:')) {
      try {
        const commaIdx = url.indexOf(',');
        if (commaIdx === -1) {
          return undefined;
        }
        const metadata = url.substring(5, commaIdx);
        const data = url.substring(commaIdx + 1);
        if (metadata.includes('base64')) {
          return Buffer.from(data, 'base64').toString('utf-8');
        }
        return decodeURIComponent(data);
      } catch (error) {
        this.#logger(`Failed to decode inline source map: ${String(error)}`);
        return undefined;
      }
    }
    try {
      const sourceMapUrl = record.url
        ? new URL(url, record.url).toString()
        : url;
      return await this.#fetchResourceContent(record, undefined, sourceMapUrl);
    } catch (error) {
      this.#logger(`Failed to download source map: ${String(error)}`);
      return undefined;
    }
  }

  #recordScript(event: Protocol.Debugger.ScriptParsedEvent): void {
    const existing: ScriptSourceRecord = {
      scriptId: event.scriptId,
      url: event.url || undefined,
      executionContextId: event.executionContextId,
      sourceMapUrl: event.sourceMapURL || undefined,
      originalSources: new Map(),
    };
    this.#scriptSources.set(event.scriptId, existing);
  }

  #compiledSourceId(scriptId: string): string {
    return `compiled:${scriptId}`;
  }

  #originalSourceId(scriptId: string, sourceUrl: string): string {
    return `original:${scriptId}:${toBase64Url(sourceUrl)}`;
  }

  decodeSourceId(sourceId: string): {
    kind: SourceKind;
    scriptId: string;
    sourceUrl?: string;
  } {
    const [kind, scriptId, encodedUrl] = sourceId.split(':', 3);
    if (kind === 'compiled') {
      return {kind: 'compiled', scriptId};
    }
    if (kind === 'original' && encodedUrl) {
      return {
        kind: 'original',
        scriptId,
        sourceUrl: fromBase64Url(encodedUrl),
      };
    }
    throw new Error(`Invalid source identifier: ${sourceId}`);
  }
}

export class DebuggerManager {
  #sessions = new WeakMap<Page, DebuggerSession>();
  #logger: Debugger;

  constructor(logger: Debugger) {
    this.#logger = logger;
  }

  getSession(page: Page): DebuggerSession {
    const existing = this.#sessions.get(page);
    if (existing) {
      return existing;
    }
    const session = new DebuggerSession(page, this.#logger);
    this.#sessions.set(page, session);
    return session;
  }
}
