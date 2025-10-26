import MerklePatriciaTrie from "./components/MerklePatriciaTrie.tsx";
import { type WasmContext } from "@scoped/trie-wasm-bindings";

export type AppProps = {
  context: WasmContext;
};

function App({ context }: AppProps) {
  return <MerklePatriciaTrie context={context} />;
}

export default App;
