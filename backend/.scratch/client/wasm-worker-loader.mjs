import { readFileSync } from 'node:fs';
export default WebAssembly.compile(readFileSync(new URL('./query_engine_bg.wasm', import.meta.url))).then((m) => ({ default: m }));
