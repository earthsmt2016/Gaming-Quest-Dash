---
name: JSX IIFE pattern
description: Correct syntax for immediately-invoked function expressions inside JSX expressions
---

The correct pattern for using an IIFE in JSX to run block-level logic and return JSX:

```jsx
{(() => {
  const computed = doSomething();
  return <Component value={computed} />;
})()}
```

**Why:** The closing `()` invokes the arrow function. The `{` and `}` are the JSX expression delimiters. There is NO additional `)` between `})()` and `}` — that causes a Babel parse error "Unexpected token }".

**Wrong (causes parse error):**
```jsx
{(() => {
  return <A />;
})()
)}  // ← extra ) is wrong
```

**How to apply:** Whenever you use an IIFE inside JSX (e.g., to compute grouped/derived data inline), make sure the closing is exactly `})()}` with no extra parenthesis.
