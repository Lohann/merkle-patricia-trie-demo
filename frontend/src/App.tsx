import MerklePatriciaTrie from "./components/MerklePatriciaTrie.tsx";
import { type WasmContext } from "../../lib.exports.ts";

export type AppProps = {
  context: WasmContext;
};

function App({ context }: AppProps) {
  return <MerklePatriciaTrie context={context} />;
}

export default App;
