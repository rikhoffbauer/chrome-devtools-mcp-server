/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

function formatLocation(location: {
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}): string {
  const parts: string[] = [];
  if (location.url) {
    parts.push(location.url);
  }
  if (location.lineNumber !== undefined) {
    const column =
      location.columnNumber !== undefined ? `:${location.columnNumber}` : '';
    parts.push(`line ${location.lineNumber}${column}`);
  }
  if (!parts.length) {
    return '<unresolved location>';
  }
  return parts.join(' ');
}

export const startDebuggerSession = defineTool({
  name: 'debugger_start_session',
  description:
    'Enable the Chrome DevTools debugger on the selected page so you can manage breakpoints, expose page sources, and inspect execution state. Run this before listing resources or installing breakpoints.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const session = context.getDebuggerSession();
    await session.start();
    response.appendResponseLine('Debugger enabled for the selected page.');
  },
});

export const stopDebuggerSession = defineTool({
  name: 'debugger_stop_session',
  description:
    'Disable the debugger on the selected page and clear all breakpoints. Use this after finishing a debugging session to avoid unexpected pauses.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const session = context.getDebuggerSession();
    await session.stop();
    response.appendResponseLine('Debugger disabled and breakpoints cleared.');
  },
});

export const setBreakpoint = defineTool({
  name: 'debugger_set_breakpoint',
  description:
    'Install a breakpoint on the selected page using either a compiled script URL or a `sourceUri` from the `page-sources` resource. Typical flow: `debugger_start_session` -> inspect the source list -> call `debugger_set_breakpoint` -> trigger an action such as `click` -> read pause state with `debugger_get_status`.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    url: z
      .string()
      .optional()
      .describe('Absolute or relative compiled script URL to match.'),
    sourceUri: z
      .string()
      .optional()
      .describe(
        'Resource URI from page-sources pointing at an original (source-mapped) file.',
      ),
    lineNumber: z
      .number()
      .int()
      .min(1)
      .describe('1-based line number where execution should pause.'),
    columnNumber: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Optional 1-based column number to narrow the breakpoint.'),
    condition: z
      .string()
      .optional()
      .describe(
        'Optional JavaScript expression. Breakpoint pauses only when the expression evaluates to true.',
      ),
  },
  handler: async (request, response, context) => {
    const session = context.getDebuggerSession();
    const {url, sourceUri, lineNumber, columnNumber, condition} =
      request.params;
    if (!url && !sourceUri) {
      throw new Error(
        'Provide either url or sourceUri when setting a breakpoint.',
      );
    }
    let sourceId: string | undefined;
    if (sourceUri) {
      sourceId = context.validateSourceUriForSelectedPage(sourceUri);
    }
    const breakpoint = await session.setBreakpoint({
      url: url ?? undefined,
      sourceId,
      lineNumber,
      columnNumber,
      condition,
    });
    const location = session.resolveLocation(breakpoint.resolvedLocation);
    const requestedLocation = sourceUri
      ? `${sourceUri} line ${lineNumber}${columnNumber ? `:${columnNumber}` : ''}`
      : `${url} line ${lineNumber}${columnNumber ? `:${columnNumber}` : ''}`;
    response.appendResponseLine(
      `Breakpoint ${breakpoint.breakpointId} set for ${requestedLocation}. Actual location: ${formatLocation(location)}.`,
    );
  },
});

const removeBreakpointParamsSchema = z.object({
  breakpointId: z
    .string()
    .optional()
    .describe('Breakpoint identifier returned by debugger_set_breakpoint.'),
  url: z
    .string()
    .optional()
    .describe('Compiled script URL used when the breakpoint was created.'),
  sourceUri: z
    .string()
    .optional()
    .describe('Source resource URI returned by page-sources.'),
  lineNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('1-based line number used when the breakpoint was created.'),
  columnNumber: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('1-based column number used when the breakpoint was created.'),
});

export const removeBreakpoint = defineTool({
  name: 'debugger_remove_breakpoint',
  description:
    'Remove a breakpoint by its id, by the compiled URL/line, or by the original `sourceUri`. Pair this with `debugger_list_breakpoints` to keep the pause plan tidy.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: removeBreakpointParamsSchema.shape,
  handler: async (request, response, context) => {
    const session = context.getDebuggerSession();
    const params = removeBreakpointParamsSchema.parse(request.params);

    if (params.breakpointId) {
      const removed = await session.removeBreakpointById(params.breakpointId);
      if (!removed) {
        response.appendResponseLine(
          `No breakpoint found with id ${params.breakpointId}.`,
        );
        return;
      }
      response.appendResponseLine(`Removed breakpoint ${params.breakpointId}.`);
      return;
    }

    if (!params.url && !params.sourceUri) {
      throw new Error(
        'Provide breakpointId, or specify sourceUri or url with a lineNumber to remove a breakpoint.',
      );
    }
    if (params.lineNumber === undefined) {
      throw new Error(
        'lineNumber is required when removing by url or sourceUri.',
      );
    }
    let sourceId: string | undefined;
    if (params.sourceUri) {
      sourceId = context.validateSourceUriForSelectedPage(params.sourceUri);
    }
    const removed = await session.removeBreakpointsByLocation({
      url: params.url,
      sourceId,
      lineNumber: params.lineNumber,
      columnNumber: params.columnNumber,
    });
    if (!removed.length) {
      const locationText = params.sourceUri
        ? params.sourceUri
        : `${params.url}:${params.lineNumber}`;
      response.appendResponseLine(`No breakpoint found at ${locationText}.`);
      return;
    }
    const locationText = params.sourceUri
      ? params.sourceUri
      : `${params.url}:${params.lineNumber}`;
    response.appendResponseLine(
      `Removed ${removed.length} breakpoint(s) at ${locationText}.`,
    );
  },
});

export const listBreakpoints = defineTool({
  name: 'debugger_list_breakpoints',
  description:
    'List all breakpoints on the selected page, highlighting whether each targets a compiled URL or an original `sourceUri`. Run this after adding or removing breakpoints to confirm your debug plan.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const session = context.getDebuggerSession();
    const breakpoints = session.listBreakpoints();
    if (!breakpoints.length) {
      response.appendResponseLine('No breakpoints are currently set.');
      return;
    }

    response.appendResponseLine('Current breakpoints:');
    for (const breakpoint of breakpoints) {
      const location = session.resolveLocation(breakpoint.resolvedLocation);
      const requestedParts: string[] = [];
      if (breakpoint.requested.sourceId) {
        requestedParts.push(
          `sourceUri ${breakpoint.requested.originalUrl ?? breakpoint.requested.sourceId}`,
        );
      } else {
        requestedParts.push(`url ${breakpoint.requested.url}`);
      }
      requestedParts.push(`line ${breakpoint.requested.lineNumber}`);
      if (breakpoint.requested.columnNumber) {
        requestedParts.push(`column ${breakpoint.requested.columnNumber}`);
      }
      response.appendResponseLine(
        `- ${breakpoint.breakpointId}: ${requestedParts.join(', ')} -> actual ${formatLocation(location)}`,
      );
      if (breakpoint.requested.condition) {
        response.appendResponseLine(
          `  condition: ${breakpoint.requested.condition}`,
        );
      }
    }
  },
});

export const pauseDebugger = defineTool({
  name: 'debugger_pause',
  description:
    'Pause JavaScript execution on the selected page immediately. Helpful after setting breakpoints when you want to inspect state without waiting for user interaction or before calling `debugger_get_status`.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const session = context.getDebuggerSession();
    await session.pause();
    response.appendResponseLine(
      'Pause requested. Execution will stop at the next statement.',
    );
  },
});

export const resumeDebugger = defineTool({
  name: 'debugger_resume',
  description:
    'Resume JavaScript execution after a pause. Combine with `debugger_step_over`, `debugger_step_into`, and `debugger_step_out` to control execution flow once a breakpoint hits.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const session = context.getDebuggerSession();
    await session.resume();
    response.appendResponseLine('Execution resumed.');
  },
});

export const stepOver = defineTool({
  name: 'debugger_step_over',
  description:
    'When paused, run the current statement and pause on the next line in the same frame. Use this after reviewing locals with `debugger_get_scopes` when you want to stay in the current function.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const session = context.getDebuggerSession();
    await session.stepOver();
    response.appendResponseLine('Step over requested.');
  },
});

export const stepInto = defineTool({
  name: 'debugger_step_into',
  description:
    'When paused, enter the next function call and pause at its first line. Ideal when the current stack shows a call you need to inspect more deeply.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const session = context.getDebuggerSession();
    await session.stepInto();
    response.appendResponseLine('Step into requested.');
  },
});

export const stepOut = defineTool({
  name: 'debugger_step_out',
  description:
    'Run execution until the current function returns and pause at the caller. Use this to exit a callee after finishing your inspection.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const session = context.getDebuggerSession();
    await session.stepOut();
    response.appendResponseLine('Step out requested.');
  },
});

export const debuggerStatus = defineTool({
  name: 'debugger_get_status',
  description:
    'Summarize whether the debugger is running or paused, why execution stopped, and the current call stack. Run this immediately after triggering a breakpoint (for example: `debugger_set_breakpoint` -> `click` -> `debugger_get_status`) to choose which frame to inspect next.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const session = context.getDebuggerSession();
    response.appendResponseLine(
      `Debugger enabled: ${session.isEnabled() ? 'yes' : 'no'}.`,
    );
    const paused = session.isPaused();
    response.appendResponseLine(`Debugger paused: ${paused ? 'yes' : 'no'}.`);
    if (!paused) {
      return;
    }

    const details = session.getPausedDetails();
    if (!details) {
      return;
    }
    response.appendResponseLine(`Pause reason: ${details.reason}.`);
    if (details.description) {
      response.appendResponseLine(`Description: ${details.description}`);
    }
    if (details.hitBreakpoints.length) {
      response.appendResponseLine(
        `Hit breakpoints: ${details.hitBreakpoints.join(', ')}`,
      );
    }
    response.appendResponseLine('Call stack:');
    details.callFrames.forEach((frame, index) => {
      const location = session.resolveLocation(frame.location);
      const functionName = frame.functionName || '<anonymous>';
      const url = frame.url || location.url || '<anonymous script>';
      const position = `${location.lineNumber ?? frame.location.lineNumber + 1}`;
      const column =
        location.columnNumber ??
        (frame.location.columnNumber !== undefined
          ? frame.location.columnNumber + 1
          : undefined);
      const columnText = column !== undefined ? `:${column}` : '';
      response.appendResponseLine(
        `  [${index}] ${functionName} @ ${url}:${position}${columnText}`,
      );
    });
  },
});

const callFrameIndexSchema = z.object({
  callFrameIndex: z
    .number()
    .int()
    .min(0)
    .describe(
      'Index of the call frame to inspect, as shown in debugger_get_status.',
    ),
});

export const debuggerScopes = defineTool({
  name: 'debugger_get_scopes',
  description:
    'List scope variables for a call frame reported by `debugger_get_status`. Use this before stepping with `debugger_step_over` or evaluating expressions to understand available bindings.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: callFrameIndexSchema.shape,
  handler: async (request, response, context) => {
    const session = context.getDebuggerSession();
    const details = session.getPausedDetails();
    if (!details) {
      throw new Error(
        'Debugger is not paused. Call debugger_get_status first.',
      );
    }
    const callFrame = details.callFrames[request.params.callFrameIndex];
    if (!callFrame) {
      throw new Error('Invalid callFrameIndex.');
    }
    const scopes = await session.describeScopes(callFrame.callFrameId);
    if (!scopes.length) {
      response.appendResponseLine(
        'No enumerable variables found in the selected call frame.',
      );
      return;
    }
    for (const scope of scopes) {
      response.appendResponseLine(`Scope ${scope.name} (${scope.type}):`);
      if (!scope.variables.length) {
        response.appendResponseLine('  <no enumerable bindings>');
        continue;
      }
      for (const variable of scope.variables) {
        response.appendResponseLine(`  ${variable.name}: ${variable.value}`);
      }
    }
  },
});

export const evaluateOnCallFrame = defineTool({
  name: 'debugger_evaluate_expression',
  description:
    'Evaluate a JavaScript expression inside a paused call frame. Combine with `debugger_get_status` (to choose a frame) and `debugger_get_scopes` (to discover variable names) for targeted diagnostics.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    callFrameIndex: callFrameIndexSchema.shape.callFrameIndex,
    expression: z
      .string()
      .min(1)
      .describe(
        'JavaScript expression to evaluate in the selected call frame.',
      ),
  },
  handler: async (request, response, context) => {
    const session = context.getDebuggerSession();
    const details = session.getPausedDetails();
    if (!details) {
      throw new Error(
        'Debugger is not paused. Call debugger_get_status first.',
      );
    }
    const callFrame = details.callFrames[request.params.callFrameIndex];
    if (!callFrame) {
      throw new Error('Invalid callFrameIndex.');
    }
    const result = await session.evaluateOnCallFrame({
      callFrameId: callFrame.callFrameId,
      expression: request.params.expression,
    });
    response.appendResponseLine(`Evaluation result: ${result}`);
  },
});
