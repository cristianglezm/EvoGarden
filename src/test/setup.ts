// This file extends Vitest's `expect` functionality with
// matchers from `@testing-library/jest-dom`.
// This allows you to use convenient assertions like `toBeInTheDocument()`.
// See: https://github.com/testing-library/jest-dom

import '@testing-library/jest-dom/vitest';

// jsdom has no canvas: without this its getContext() prints "Not implemented"
// on every call. A plain function (not a spy), so `vi.restoreAllMocks()` cannot
// take it away while a component is still drawing after a test. A test that
// needs to see what was drawn, or a missing canvas, spies on it as before.
if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = function getContext() {
        return null;
    } as typeof HTMLCanvasElement.prototype.getContext;
}
