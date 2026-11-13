/**
 * WebMCP's DECLARATIVE form API — typed as first-class React props + the
 * SubmitEvent extensions, so the flag-gated conditional spreads in
 * SearchBox/SmartContactForm/NewsletterSignup need no casts.
 *
 * The attributes turn a standard <form> into an agent tool in WebMCP-enabled
 * browsers (Chrome 149 origin trial / ChatGPT's built-in browser); every
 * other browser ignores unknown lowercase attributes, so the forms keep
 * working unchanged. We STILL gate the attributes on the `webMcp` flag
 * (via useFeature(), hydration-stable) because flag-off must render
 * byte-identical HTML — the no-op-in-old-browsers property is not the same
 * as no-bytes.
 *
 * `toolautosubmit` is a boolean CONTENT attribute: pass `""`. It is typed as
 * string — never boolean — because React DROPS `unknown={true}` attributes
 * silently, which would turn "autosubmit allowed" into a no-op nobody sees.
 *
 * This file must stay unclaimed core: the annotated forms survive every
 * profile (the CLI light profile prunes lib/webmcp/ but keeps the forms), so
 * the types they reference must too.
 */
import "react";

declare module "react" {
  interface FormHTMLAttributes<T> {
    /** WebMCP: unique tool name this form registers as. */
    toolname?: string;
    /** WebMCP: what the tool does, for the agent. */
    tooldescription?: string;
    /** WebMCP: allow agent submit without user confirmation. Pass "". */
    toolautosubmit?: string;
  }
  interface InputHTMLAttributes<T> {
    /**
     * WebMCP: parameter description for this control in the synthesized
     * schema. The browser falls back to the associated <label>'s text and
     * then aria-description when absent.
     */
    toolparamdescription?: string;
  }
  interface TextareaHTMLAttributes<T> {
    /** WebMCP: parameter description — textareas synthesize schema params too. */
    toolparamdescription?: string;
  }
  interface SelectHTMLAttributes<T> {
    /** WebMCP: parameter description — selects synthesize enum params. */
    toolparamdescription?: string;
  }
}

declare global {
  interface SubmitEvent {
    /** WebMCP: true when an agent (not the human) invoked this submit. */
    agentInvoked?: boolean;
    /**
     * WebMCP: hand the agent the outcome of the submit it invoked. Typed as
     * Promise-only — the draft's examples always pass a promise, and typing
     * it this way makes the compiler force `Promise.resolve(...)` around
     * synchronous outcomes instead of hoping the browser coerces.
     */
    respondWith?: (response: Promise<unknown>) => void;
  }
}

export {};
