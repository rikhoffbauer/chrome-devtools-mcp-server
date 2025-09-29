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
  description: `Enable the Chrome DevTools debugger on the currently selected page.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
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
  description: `Disable the Chrome DevTools debugger on the selected page and clear breakpoints.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
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
  description: `Set a breakpoint by URL and line number on the selected page.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    url: z.string().describe('Absolute or relative script URL to match.'),
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
    const breakpoint = await session.setBreakpoint({
      url: request.params.url,
      lineNumber: request.params.lineNumber,
      columnNumber: request.params.columnNumber,
      condition: request.params.condition,
    });
    const location = session.resolveLocation(breakpoint.resolvedLocation);
    response.appendResponseLine(
      `Breakpoint ${breakpoint.breakpointId} set at ${formatLocation(location)}.`,
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
      .describe('Script URL used when the breakpoint was created.'),
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

const removeBreakpointSchema = removeBreakpointParamsSchema.refine(
  value => Boolean(value.breakpointId) || (value.url && value.lineNumber),
  {
    message:
      'Provide a breakpointId or both url and lineNumber to remove a breakpoint.',
  },
);

export const removeBreakpoint = defineTool({
  name: 'debugger_remove_breakpoint',
  description: `Remove a breakpoint by its id or by URL and line number.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: removeBreakpointParamsSchema.shape,
  handler: async (request, response, context) => {
    const session = context.getDebuggerSession();
    const params = removeBreakpointSchema.parse(request.params);

    if (params.breakpointId) {
      const removed = await session.removeBreakpointById(params.breakpointId);
      if (!removed) {
        response.appendResponseLine(
          `No breakpoint found with id ${params.breakpointId}.`,
        );
        return;
      }
      response.appendResponseLine(
        `Removed breakpoint ${params.breakpointId}.`,
      );
      return;
    }

    const removed = await session.removeBreakpointsByLocation({
      url: params.url!,
      lineNumber: params.lineNumber!,
      columnNumber: params.columnNumber,
    });
    if (!removed.length) {
      response.appendResponseLine(
        `No breakpoint found at ${params.url}:${params.lineNumber}.`,
      );
      return;
    }
    response.appendResponseLine(
      `Removed ${removed.length} breakpoint(s) at ${params.url}:${params.lineNumber}.`,
    );
  },
});

export const listBreakpoints = defineTool({
  name: 'debugger_list_breakpoints',
  description: `List all breakpoints registered for the selected page.`,
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
      response.appendResponseLine(
        `- ${breakpoint.breakpointId}: requested ${breakpoint.requested.url}:${breakpoint.requested.lineNumber}` +
          `${breakpoint.requested.columnNumber ? `:${breakpoint.requested.columnNumber}` : ''}` +
          `, actual ${formatLocation(location)}`,
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
  description: `Pause JavaScript execution on the selected page.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const session = context.getDebuggerSession();
    await session.pause();
    response.appendResponseLine('Pause requested. Execution will stop at the next statement.');
  },
});

export const resumeDebugger = defineTool({
  name: 'debugger_resume',
  description: `Resume JavaScript execution after a pause.`,
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
  description: `Advance execution to the next statement, stepping over function calls.`,
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
  description: `Step into the next function call from the current pause location.`,
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
  description: `Run execution until the current function returns.`,
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
  description: `Show debugger state, including pause reason and call stack when paused.`,
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
    .describe('Index of the call frame to inspect, as shown in debugger_get_status.'),
});

export const debuggerScopes = defineTool({
  name: 'debugger_get_scopes',
  description: `List scope variables for a specific call frame while paused.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: callFrameIndexSchema.shape,
  handler: async (request, response, context) => {
    const session = context.getDebuggerSession();
    const details = session.getPausedDetails();
    if (!details) {
      throw new Error('Debugger is not paused. Call debugger_get_status first.');
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
      response.appendResponseLine(
        `Scope ${scope.name} (${scope.type}):`,
      );
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
  description: `Evaluate a JavaScript expression in the context of a paused call frame.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    callFrameIndex: callFrameIndexSchema.shape.callFrameIndex,
    expression: z
      .string()
      .min(1)
      .describe('JavaScript expression to evaluate in the selected call frame.'),
  },
  handler: async (request, response, context) => {
    const session = context.getDebuggerSession();
    const details = session.getPausedDetails();
    if (!details) {
      throw new Error('Debugger is not paused. Call debugger_get_status first.');
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
