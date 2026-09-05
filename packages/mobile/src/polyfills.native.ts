import { ReadableStream, TransformStream, WritableStream } from "web-streams-polyfill";

// oRPC uses Web Streams for its peer transport; Hermes is not a browser runtime.
if (typeof globalThis.ReadableStream === "undefined") {
  Object.assign(globalThis, { ReadableStream, TransformStream, WritableStream });
}
