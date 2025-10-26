import { type Nib, TrieChildren } from "./nibbles.ts";

export interface MerklePatriciaTrieNode {
  id: string | null;
  depth: number;
  nibbles: string | null;
  value: string | null;
  encoded: string | null;
  children: { [key: Nib]: MerklePatriciaTrieNode };
}

export class JSMerklePatriciaTrie {
  readonly id?: string;
  readonly depth: number;
  readonly parent?: WeakRef<JSMerklePatriciaTrie>;
  readonly nibbles?: string;
  readonly value?: string;
  readonly raw_bytes?: string;
  readonly children: TrieChildren<JSMerklePatriciaTrie>;

  constructor(
    children: TrieChildren<JSMerklePatriciaTrie>,
    depth: number,
    id?: string,
    nibbles?: string,
    value?: string,
    raw_bytes?: string,
    parent?: WeakRef<JSMerklePatriciaTrie>,
  ) {
    this.id = id;
    this.depth = depth;
    this.parent = parent;
    this.nibbles = nibbles;
    this.value = value;
    this.raw_bytes = raw_bytes;
    this.children = children;
  }

  public toJSON(): MerklePatriciaTrieNode {
    return {
      id: this.id ?? null,
      depth: this.depth,
      nibbles: this.nibbles ?? null,
      value: this.value ?? null,
      encoded: this.raw_bytes ?? null,
      children: this.children.toObject(([, trie]) => trie.toJSON()),
    };
  }
}

export class JSTrieBuilder {
  public id?: string;
  public nibbles?: string;
  public value?: string;
  public raw_bytes?: string;
  public children: TrieChildren<JSTrieBuilder>;

  constructor() {
    this.id = undefined;
    this.nibbles = undefined;
    this.value = undefined;
    this.raw_bytes = undefined;
    this.children = new TrieChildren();
  }

  public push_child(nib: number, child: JSTrieBuilder) {
    if (!(child instanceof JSTrieBuilder)) {
      throw new Error("child must be of type MerklePatriciaTrieBuilder");
    }
    this.children.set(nib, child);
  }

  private _build(
    depth: number,
    parent?: WeakRef<JSMerklePatriciaTrie>,
  ): JSMerklePatriciaTrie {
    const children: TrieChildren<JSMerklePatriciaTrie> = new TrieChildren();
    const root = new JSMerklePatriciaTrie(
      children,
      depth,
      this.id,
      this.nibbles,
      this.value,
      this.raw_bytes,
      parent,
    );
    this.children.forEach(([nib, child]) => {
      const n = child._build(depth + 1, new WeakRef(root));
      children.set(nib, n);
    });
    return root;
  }

  public build(): JSMerklePatriciaTrie {
    return this._build(0);
  }
}
