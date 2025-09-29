/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Debugger} from 'debug';
import type {CDPSession, Page} from 'puppeteer-core';
import type Protocol from 'devtools-protocol';

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
  if (value.type === 'number' || value.type === 'boolean' || value.type === 'bigint') {
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

export class DebuggerSession {
  #page: Page;
  #logger: Debugger;
  #session?: CDPSession;
  #debuggerEnabled = false;
  #runtimeEnabled = false;
  #breakpoints = new Map<string, BreakpointInfo>();
  #pausedDetails?: PausedDetails;
  #scriptIdToUrl = new Map<string, string>();

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
    this.#pausedDetails = undefined;
    this.#breakpoints.clear();
    this.#scriptIdToUrl.clear();
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
    }
  }

  async stop(): Promise<void> {
    if (!this.#session || !this.#debuggerEnabled) {
      return;
    }
    await this.#session.send('Debugger.disable');
    this.#debuggerEnabled = false;
    this.#pausedDetails = undefined;
    this.#breakpoints.clear();
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
    url: string;
    lineNumber: number;
    columnNumber?: number;
    condition?: string;
  }): Promise<BreakpointInfo> {
    if (!options.url) {
      throw new Error('A script URL is required to set a breakpoint.');
    }
    await this.start();
    const session = await this.#ensureSession();
    const params: Protocol.Debugger.SetBreakpointByUrlRequest = {
      url: options.url,
      lineNumber: Math.max(0, options.lineNumber - 1),
    };
    if (options.columnNumber !== undefined) {
      params.columnNumber = Math.max(0, options.columnNumber - 1);
    }
    if (options.condition) {
      params.condition = options.condition;
    }

    const result = await session.send('Debugger.setBreakpointByUrl', params);
    const info: BreakpointInfo = {
      breakpointId: result.breakpointId,
      requested: {...options},
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
    url: string;
    lineNumber: number;
    columnNumber?: number;
  }): Promise<string[]> {
    await this.start();
    const toRemove: string[] = [];
    for (const [breakpointId, info] of this.#breakpoints.entries()) {
      if (info.requested.url !== options.url) {
        continue;
      }
      if (info.requested.lineNumber !== options.lineNumber) {
        continue;
      }
      if (
        options.columnNumber !== undefined &&
        info.requested.columnNumber !== options.columnNumber
      ) {
        continue;
      }
      toRemove.push(breakpointId);
    }
    await Promise.all(toRemove.map(id => this.removeBreakpointById(id)));
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
        variables.push({
          name: property.name,
          value: formatRemoteObject(property.value),
        });
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
