---
'foldkit': minor
---

Add `Definition.makeCommandsStep(commands)` for reusable Steps that preserve the Model and return an existing Command collection. The helper checks result Messages against its owning Block and preserves Command Service requirements and child Binding registration evidence. Construction and Step application remain pure; Runtime executes the returned Commands independently.

Use the general Step authoring helper for Model-dependent Commands, additional arguments, field changes, or OutMessages. Ordinary update branches can continue returning their result objects directly.
