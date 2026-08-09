# EdgeScope Codex Instructions

- Treat EdgeScope as a production-quality final product, not a beta, prototype, MVP, or v1.
- Use a skill only when the user explicitly names that exact skill in the current prompt.
- Do not inspect, open, invoke, or apply any skill merely to determine whether it may be useful.
- If no skill is explicitly named in the current prompt, work without skills.
- All installed skills must remain explicit-only with `allow_implicit_invocation: false`.
- Do not use or inspect Graphify unless the user explicitly requests Graphify in the current prompt.
- Make only changes required by the current task; do not broaden scope automatically.
- Do not migrate, replace, delete, or clean production infrastructure or external accounts unless explicitly requested.
- Treat this repository as the active EdgeScope workspace. Do not modify or delete any old fallback workspace, backup, or safety history unless explicitly requested.
