<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->

# Chrome DevTools MCP Tool Reference

- **[Input automation](#input-automation)** (7 tools)
  - [`click`](#click)
  - [`drag`](#drag)
  - [`fill`](#fill)
  - [`fill_form`](#fill_form)
  - [`handle_dialog`](#handle_dialog)
  - [`hover`](#hover)
  - [`upload_file`](#upload_file)
- **[Navigation automation](#navigation-automation)** (7 tools)
  - [`close_page`](#close_page)
  - [`list_pages`](#list_pages)
  - [`navigate_page`](#navigate_page)
  - [`navigate_page_history`](#navigate_page_history)
  - [`new_page`](#new_page)
  - [`select_page`](#select_page)
  - [`wait_for`](#wait_for)
- **[Emulation](#emulation)** (3 tools)
  - [`emulate_cpu`](#emulate_cpu)
  - [`emulate_network`](#emulate_network)
  - [`resize_page`](#resize_page)
- **[Performance](#performance)** (3 tools)
  - [`performance_analyze_insight`](#performance_analyze_insight)
  - [`performance_start_trace`](#performance_start_trace)
  - [`performance_stop_trace`](#performance_stop_trace)
- **[Network](#network)** (2 tools)
  - [`get_network_request`](#get_network_request)
  - [`list_network_requests`](#list_network_requests)
- **[Debugging](#debugging)** (4 tools)
  - [`evaluate_script`](#evaluate_script)
  - [`list_console_messages`](#list_console_messages)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)

## Input automation

### `click`

**Description:** Clicks on the provided element

**Parameters:**

- **dblClick** (boolean) _(optional)_: Set to true for double clicks. Default is false.
- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot

---

### `drag`

**Description:** [`Drag`](#drag) an element onto another element

**Parameters:**

- **from_uid** (string) **(required)**: The uid of the element to [`drag`](#drag)
- **to_uid** (string) **(required)**: The uid of the element to drop into

---

### `fill`

**Description:** Type text into a input, text area or select an option from a &lt;select&gt; element.

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **value** (string) **(required)**: The value to [`fill`](#fill) in

---

### `fill_form`

**Description:** [`Fill`](#fill) out multiple form elements at once

**Parameters:**

- **elements** (array) **(required)**: Elements from snapshot to [`fill`](#fill) out.

---

### `handle_dialog`

**Description:** If a browser dialog was opened, use this command to handle it

**Parameters:**

- **action** (enum: "accept", "dismiss") **(required)**: Whether to dismiss or accept the dialog
- **promptText** (string) _(optional)_: Optional prompt text to enter into the dialog.

---

### `hover`

**Description:** [`Hover`](#hover) over the provided element

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot

---

### `upload_file`

**Description:** Upload a file through a provided element.

**Parameters:**

- **filePath** (string) **(required)**: The local path of the file to upload
- **uid** (string) **(required)**: The uid of the file input element or an element that will open file chooser on the page from the page content snapshot

---

## Navigation automation

### `close_page`

**Description:** Closes the page by its index. The last open page cannot be closed.

**Parameters:**

- **pageIdx** (number) **(required)**: The index of the page to close. Call [`list_pages`](#list_pages) to list pages.

---

### `list_pages`

**Description:** Get a list of pages open in the browser.

**Parameters:** None

---

### `navigate_page`

**Description:** Navigates the currently selected page to a URL.

**Parameters:**

- **url** (string) **(required)**: URL to navigate the page to

---

### `navigate_page_history`

**Description:** Navigates the currently selected page.

**Parameters:**

- **navigate** (enum: "back", "forward") **(required)**: Whether to navigate back or navigate forward in the selected pages history

---

### `new_page`

**Description:** Creates a new page

**Parameters:**

- **url** (string) **(required)**: URL to load in a new page.

---

### `select_page`

**Description:** Select a page as a context for future tool calls.

**Parameters:**

- **pageIdx** (number) **(required)**: The index of the page to select. Call [`list_pages`](#list_pages) to list pages.

---

### `wait_for`

**Description:** Wait for the specified text to appear on the selected page.

**Parameters:**

- **text** (string) **(required)**: Text to appear on the page

---

## Emulation

### `emulate_cpu`

**Description:** Emulates CPU throttling by slowing down the selected page's execution.

**Parameters:**

- **throttlingRate** (number) **(required)**: The CPU throttling rate representing the slowdown factor 1-20x. Set the rate to 1 to disable throttling

---

### `emulate_network`

**Description:** Emulates network conditions such as throttling on the selected page.

**Parameters:**

- **throttlingOption** (enum: "No emulation", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") **(required)**: The network throttling option to emulate. Available throttling options are: No emulation, Slow 3G, Fast 3G, Slow 4G, Fast 4G. Set to "No emulation" to disable.

---

### `resize_page`

**Description:** Resizes the selected page's window so that the page has specified dimension

**Parameters:**

- **height** (number) **(required)**: Page height
- **width** (number) **(required)**: Page width

---

## Performance

### `performance_analyze_insight`

**Description:** Provides more detailed information on a specific Performance Insight that was highlighed in the results of a trace recording.

**Parameters:**

- **insightName** (string) **(required)**: The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"

---

### `performance_start_trace`

**Description:** Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.

**Parameters:**

- **autoStop** (boolean) **(required)**: Determines if the trace recording should be automatically stopped.
- **reload** (boolean) **(required)**: Determines if, once tracing has started, the page should be automatically reloaded.

---

### `performance_stop_trace`

**Description:** Stops the active performance trace recording on the selected page.

**Parameters:** None

---

## Network

### `get_network_request`

**Description:** Gets a network request by URL. You can get all requests by calling [`list_network_requests`](#list_network_requests).

**Parameters:**

- **url** (string) **(required)**: The URL of the request.

---

### `list_network_requests`

**Description:** List all requests for the currently selected page

**Parameters:**

- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of requests to return. When omitted, returns all requests.
- **resourceTypes** (array) _(optional)_: Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.

---

## Debugging

### `debugger_start_session`

**Description:** Enable the Chrome DevTools debugger on the selected page so you can manage breakpoints, expose page sources, and inspect execution state. Start every debugging workflow here before listing `page-sources` resources or installing breakpoints.

**Parameters:** None

---

### `debugger_stop_session`

**Description:** Disable the debugger on the selected page and clear every breakpoint. Use this after you finish investigating an issue so future actions do not pause unexpectedly.

**Parameters:** None

---

### `debugger_set_breakpoint`

**Description:** Install a breakpoint on the selected page using either a compiled script URL or a `sourceUri` from the `page-sources` resource. Typical flow: `debugger_start_session` -> inspect the source list -> call `debugger_set_breakpoint` -> trigger an action such as `click` -> read pause state with `debugger_get_status`.

**Parameters:**

- **url** (string) _(optional)_: Absolute or relative compiled script URL where the breakpoint should be applied.
- **sourceUri** (string) _(optional)_: A resource URI returned by `page-sources` that points at an original (source-mapped) file.
- **lineNumber** (integer) **(required)**: 1-based line number where execution should pause.
- **columnNumber** (integer) _(optional)_: 1-based column number to narrow the breakpoint.
- **condition** (string) _(optional)_: JavaScript expression evaluated when the breakpoint is hit; execution pauses only when it evaluates to true.

---

### `debugger_remove_breakpoint`

**Description:** Remove a breakpoint by its identifier, by compiled URL, or by original `sourceUri`. Combine this with `debugger_list_breakpoints` when refining your pause plan after an investigation.

**Parameters:**

- **breakpointId** (string) _(optional)_: Identifier returned by `debugger_set_breakpoint`.
- **url** (string) _(optional)_: Compiled script URL used when the breakpoint was created. Requires `lineNumber`.
- **sourceUri** (string) _(optional)_: Source resource URI returned by `page-sources`. Requires `lineNumber`.
- **lineNumber** (integer) _(optional)_: 1-based line number associated with the breakpoint. Required when using `url` or `sourceUri`.
- **columnNumber** (integer) _(optional)_: 1-based column number, if the breakpoint was narrowed to a column.

---

### `debugger_list_breakpoints`

**Description:** List every breakpoint on the selected page, highlighting whether each targets a compiled URL or an original `sourceUri`. Run this after adding or removing breakpoints to confirm the current debug plan.

**Parameters:** None

---

### `debugger_pause`

**Description:** Pause JavaScript execution on the selected page immediately. Helpful after setting breakpoints when you want to inspect state without waiting for user interaction or before calling `debugger_get_status`.

**Parameters:** None

---

### `debugger_resume`

**Description:** Resume JavaScript execution after a pause. Combine with `debugger_step_over`, `debugger_step_into`, and `debugger_step_out` to control execution flow once a breakpoint hits.

**Parameters:** None

---

### `debugger_step_over`

**Description:** When paused, run the current statement and pause on the next line in the same frame. Use this after reviewing locals with `debugger_get_scopes` when you want to stay in the current function.

**Parameters:** None

---

### `debugger_step_into`

**Description:** When paused, enter the next function call and pause at its first line. Ideal when the current stack shows a call you need to inspect more deeply.

**Parameters:** None

---

### `debugger_step_out`

**Description:** Run execution until the current function returns and pause at the caller. Use this to exit a callee after finishing your inspection.

**Parameters:** None

---

### `debugger_get_status`

**Description:** Summarize whether the debugger is running or paused, why execution stopped, and the current call stack. Run this immediately after triggering a breakpoint (for example: `debugger_set_breakpoint` -> `click` -> `debugger_get_status`) to choose which frame to inspect next.

**Parameters:** None

---

### `debugger_get_scopes`

**Description:** List scope variables for a call frame reported by `debugger_get_status`. Use this before stepping with `debugger_step_over` or evaluating expressions to understand available bindings.

**Parameters:**

- **callFrameIndex** (integer) **(required)**: Index of the call frame to inspect, as shown in `debugger_get_status`.

---

### `debugger_evaluate_expression`

**Description:** Evaluate a JavaScript expression inside a paused call frame. Combine with `debugger_get_status` (to choose a frame) and `debugger_get_scopes` (to discover variable names) for targeted diagnostics.

**Parameters:**

- **callFrameIndex** (integer) **(required)**: Index of the call frame to evaluate against.
- **expression** (string) **(required)**: JavaScript expression to evaluate in the selected call frame.

---

### `evaluate_script`

**Description:** Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON so returned values have to be JSON-serializable.

**Parameters:**

- **args** (array) _(optional)_: An optional list of arguments to pass to the function.
- **function** (string) **(required)**: A JavaScript function to run in the currently selected page.
  Example without arguments: `() => {
  return document.title
}` or `async () => {
  return await fetch("example.com")
}`.
  Example with arguments: `(el) => {
  return el.innerText;
}`

---

### `list_console_messages`

**Description:** List all console messages for the currently selected page

**Parameters:** None

---

### `take_screenshot`

**Description:** Take a screenshot of the page or element.

**Parameters:**

- **format** (enum: "png", "jpeg") _(optional)_: Type of format to save the screenshot as. Default is "png"
- **fullPage** (boolean) _(optional)_: If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.
- **uid** (string) _(optional)_: The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.

---

### `take_snapshot`

**Description:** Take a text snapshot of the currently selected page. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot.

**Parameters:** None

---
