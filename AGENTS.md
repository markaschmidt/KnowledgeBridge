# Development guidance

This is the public Knowledge Bridge source repository. Do not put personal vault notes, registry files, passphrases, transcripts, embeddings, private Rhen source or real credential fixtures here.

- Share policy/retrieval logic through packages. Keep editor and Obsidian APIs in their host adapters.
- Every search, read, graph traversal and capture must enforce the same approved workspace profile. Never accept a tool-supplied root or workspace override.
- Apply scope before candidate generation and graph construction, and revalidate policy before returning content.
- Sealed envelopes and Rhen-denied paths must never become plaintext search results. Do not call decrypted application APIs to bypass this.
- Preserve create-only capture semantics until revision checks and coordinated writes are implemented.
- Do not copy private Rhen code. Implement a documented public contract independently.
- Use synthetic temporary vaults for tests. No test should discover or scan the user's vaults.
- Run `npm run check` and the repository-specific packaging command. Do not change a sibling repository or the shared core pin implicitly.
- Keep docs honest about implemented vs planned features and measured vs proposed performance.
- Keep `sources/` from any surrounding ChatGPT project untouched.
