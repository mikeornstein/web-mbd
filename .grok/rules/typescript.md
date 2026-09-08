# TypeScript

- Model variants with a `kind` (or other literal) discriminant. Do not use optional-field bags for mutually exclusive states.
- Brand primitives at the boundary. Do not mix raw `string` ids of different kinds.
- Parse external data into a named domain type. Inside the boundary, trust the type.
- `unknown` over `any`. `any` is an error.
- No `as` except after validation. Prefer `satisfies`.
- Exhaustive `switch` over unions: `const _exhaustive: never = x` in the default arm.
- Prefer the real test (Vitest module, Playwright preview) over mocks.
