// deno-lint-ignore-file no-explicit-any
import * as Immutable from "immutable";
import React from "react";
import * as d3 from "d3";
import {
  type PortableEntry,
  type SelectedNodes,
  type TrieNode,
} from "../reducers/trie.ts";
import { Nib } from "../../../nibbles.ts";
import { type Command, Commands } from "../reducers/index.ts";

enum NodeType {
  Empty = "empty",
  Leaf = "leaf",
  Branch = "branch",
  NibbledBranch = "nibbled branch",
  Extension = "extension",
}

interface SvgNode {
  type: NodeType;
  id: string;
  parents: SvgNode[];
  key: string;
  parentNib: string | null;
  nibbles: string | null;
  value: string | null;
  encoded: string | null;
  svgCircle: SVGCircleElement;
  svgText: SVGTextElement;
  path?: SVGPathElement;
  children: SvgNode[];
}

const removeHexPrefix = (nibbles: string | undefined): string | undefined => {
  if (nibbles === undefined) return nibbles;
  nibbles = nibbles.trim();
  if (nibbles.startsWith("0x")) {
    nibbles = nibbles.substring(2);
  }
  if (nibbles.length === 0) return undefined;
  return nibbles;
};

const removeNibblesPrefix = (
  nibbles: string | undefined,
  parentNib: Nib,
): string => {
  if (parentNib.length !== 1) throw new Error(`invalid nib: ${parentNib}`);
  nibbles = removeHexPrefix(nibbles);
  return nibbles ? `${parentNib}${nibbles}` : parentNib;
};

const getNodeType = (node: TrieNode): NodeType => {
  const hasChildren: number = Object.keys(node.children).length > 0 ? 1 : 0;
  const hasNibble: number = node.nibbles !== undefined ? 1 : 0;
  const hasValue: number = node.nibbles !== undefined ? 1 : 0;
  let n: number = 0 | 0;
  n |= hasValue | 0;
  n |= (hasNibble | 0) << 1 | 0;
  n |= (hasChildren | 0) << 2 | 0;
  switch (n | 0) {
    case 0:
      return NodeType.Empty;
    case 1:
    case 3:
      return NodeType.Leaf;
    case 2:
      return NodeType.Extension;
    case 4:
    case 5:
      return NodeType.Branch;
    case 6:
    case 7:
      return NodeType.NibbledBranch;
  }
  throw new Error("unreachable");
};

function assertChildNode(
  nodes: Immutable.Map<string, TrieNode>,
  node: TrieNode,
  leafs: Leafs,
  visited: Map<string, SvgNode>,
  parentNib: Nib,
  parents: SvgNode[],
  prefix: string,
): string {
  if (!nodes.has(node.hash)) {
    throw new Error("[bug] child node not listed!");
  }
  if (parents.length === 0) {
    throw new Error(
      `[bug] only the root node doesn't have parents: ${node.hash}`,
    );
  }
  if (!prefix.startsWith("0x")) {
    throw new Error(
      `[bug] node prefix must start with '0x': ${node.hash}, prefix: '${prefix}'`,
    );
  }
  if (parentNib.length !== 1) {
    throw new Error(`[bug] invalid parent nib: ${parentNib}`);
  }
  const duplicated = parents.find((parent) => (parent.id === node.hash));
  if (duplicated) {
    const parentList = parents.map((parent) => parent.id).join(", ");
    throw new Error(
      `[bug] ciclic parent, a node cannot be parent of itself!: ${node.hash}, parent: ${parentList}`,
    );
  }
  const exists = visited.get(node.hash);
  if (exists) {
    if (exists.parentNib === parentNib) {
      throw new Error(
        `[bug] cannot visit a child with same parent parent nib twice! ${node.hash}: ${parentNib} == ${exists.parentNib}`,
      );
    }
    if (exists.nibbles !== node.nibbles) {
      throw new Error(
        `[bug] child nibble mismatch! ${exists.id}: ${node.nibbles} != ${exists.nibbles}`,
      );
    }
    if (parents.includes(exists)) {
      throw new Error("[bug] ciclic parent");
    }
    if (exists.id !== node.hash) {
      throw new Error(
        `[bug] child hash mismatch! ${exists.id} != ${node.hash}`,
      );
    }
  }
  const nibbles = removeNibblesPrefix(node.nibbles, parentNib);
  if (nibbles.indexOf("x") !== -1) {
    throw new Error(`INVALID NIBBLES: '${nibbles}'`);
  }
  const key = `${prefix}${nibbles}`;
  if (Object.prototype.hasOwnProperty.call(leafs, key)) {
    const repeated = leafs[key];
    throw new Error(
      `[bug] repeated leaft node key: ${node.hash} and ${repeated.id} has the key: ${key}`,
    );
  }
  return key;
}

function cloneChildNode(
  nodes: Immutable.Map<string, TrieNode>,
  leafs: Leafs,
  node: TrieNode,
  parentNib: Nib,
  parents: SvgNode[],
  visited: Map<string, SvgNode>,
  prefix: string,
): SvgNode {
  const child = visited.get(node.hash);
  if (!child) {
    throw new Error("[bug] only visited nodes can be cloned!");
  }
  prefix = assertChildNode(
    nodes,
    node,
    leafs,
    visited,
    parentNib,
    parents,
    prefix,
  );
  const clone: SvgNode = {
    ...child,
    key: prefix,
    nibbles: removeHexPrefix(node.nibbles) ?? null,
    parentNib,
    parents: parents.slice(),
    path: child.path,
    children: child.children.slice(),
  };
  leafs[clone.key] = clone;
  return clone;
}

function buildChildNode(
  nodes: Immutable.Map<string, TrieNode>,
  leafs: Leafs,
  node: TrieNode,
  parentNib: Nib,
  parents: SvgNode[],
  visited: Map<string, SvgNode>,
  prefix: string,
): SvgNode {
  if (visited.has(node.hash)) {
    // Node already visited, clone it!
    return cloneChildNode(
      nodes,
      leafs,
      node,
      parentNib,
      parents,
      visited,
      prefix,
    );
  }
  const key = assertChildNode(
    nodes,
    node,
    leafs,
    visited,
    parentNib,
    parents,
    prefix,
  );
  const trie: SvgNode = {
    type: getNodeType(node),
    id: node.hash,
    parents: parents.slice(),
    key,
    nibbles: removeHexPrefix(node.nibbles) ?? null,
    parentNib,
    value: node.value ?? null,
    encoded: node.encoded,
    children: [],
    svgCircle: null as unknown as SVGCircleElement,
    svgText: null as unknown as SVGTextElement,
    path: undefined,
  };
  leafs[trie.key] = trie;
  visited.set(trie.id, trie);
  const parentIndex = parents.length;
  parents.push(trie);
  Object.entries(node.children).map(([nib, childHash]) => {
    const child = nodes.get(childHash);
    if (child === undefined) throw new Error(`child not found ${childHash}`);
    const newChild = buildChildNode(
      nodes,
      leafs,
      child,
      nib,
      parents,
      visited,
      trie.key,
    );
    trie.children.push(newChild);
    if (parents.length !== (parentIndex + 1)) {
      throw new Error(
        `[bug] child must pop prefix before return: ${childHash}.`,
      );
    }
    if (newChild.parents[parentIndex] !== trie) {
      const message = parents.map((parent) => parent.id).join(", ");
      throw new Error(
        `invalid parent at index ${parentIndex}! ${childHash} -> ${message}`,
      );
    }
  });
  parents.pop();
  return trie;
}

// an empty array guaranteed to never change.
const FROZEN_EMPTY_ARRAY: any[] = [];
Object.freeze(FROZEN_EMPTY_ARRAY);

function rootFromNodes(
  nodes: Immutable.Map<string, TrieNode>,
  merkleRoot: string,
): [SvgNode, Leafs] {
  if (!nodes.has(merkleRoot)) {
    throw new Error(`node with merkle root ${merkleRoot} not found!`);
  }
  const node: TrieNode = nodes.get(merkleRoot)!;
  const nibbles = removeHexPrefix(node.nibbles);
  const root: SvgNode = {
    type: getNodeType(node),
    id: node.hash,
    key: nibbles ? `0x${nibbles}` : "0x",
    nibbles: nibbles ?? null,
    path: undefined,
    parentNib: null,
    value: node.value ?? null,
    encoded: node.encoded,
    parents: FROZEN_EMPTY_ARRAY,
    children: [],
    svgCircle: null as unknown as SVGCircleElement,
    svgText: null as unknown as SVGTextElement,
  };
  const leafs: Leafs = { [root.key]: root };
  const visited: Map<string, SvgNode> = new Map();
  visited.set(root.id, root);
  const parents: SvgNode[] = [root];
  Object.entries(node.children).map(([nib, childHash]) => {
    const child = nodes.get(childHash);
    if (child === undefined) throw new Error(`child not found ${childHash}`);
    const newChild = buildChildNode(
      nodes,
      leafs,
      child,
      nib,
      parents,
      visited,
      root.key,
    );
    root.children.push(newChild);
    const childPrefix = `${root.key}${nib}`;
    if (!newChild.key.startsWith(childPrefix)) {
      throw new Error(
        `[bug] child.key must start with root.key, expected: '${childPrefix}' got: '${newChild.key}'`,
      );
    }
    if (parents.length !== 1) {
      throw new Error(
        "[bug] unexpected parent list size, child must pop itself before return",
      );
    }
    if (newChild.parents[0] !== root) {
      const message = parents.map((parent) => parent.id).join(", ");
      throw new Error(`invalid parent at index 0! ${childHash} -> ${message}`);
    }
  });
  return [root, leafs];
}

const trunc = (str: string, maxLen: number, begin = true): string => {
  if (str.length <= maxLen) return str;
  const diff = str.length - maxLen;
  if (maxLen > 3) {
    return begin
      ? `...${str.substring(diff + 3, str.length)}`
      : `${str.substring(0, str.length - diff - 3)}...`;
  }
  return "...";
};

function getTrieNodeText(node: SvgNode, skipValue = false): string {
  let nibbles: string | undefined = node.nibbles ?? undefined;
  if (node.parentNib) {
    nibbles = removeNibblesPrefix(nibbles, node.parentNib);
  }

  if (nibbles) {
    if (!skipValue && node.value) {
      const totalMaxLen = 24;
      const nibblesMaxLen = 12;
      const nibblesLen = Math.min(nibbles.length, nibblesMaxLen);
      const valueMaxLen = totalMaxLen - nibblesLen;
      const valueLen = Math.min(node.value.length, valueMaxLen);
      return `${trunc(nibbles, nibblesLen, false)} (${
        trunc(node.value, valueLen, false)
      })`;
    }

    if (nibbles.length > 16) {
      return nibbles.substring(0, 8) + "... ..." +
        nibbles.substring(nibbles.length - 8, nibbles.length);
    }
    return nibbles;
  } else if (node.value) {
    return `(${node.value})`;
  }
  if (node.parents.length !== 0) {
    throw new Error(`child node without nibbles: ${node}`);
  }
  return node.key;
}

function createSVG(data: SvgNode, width: number): SVGElement {
  // const width = 724;

  // Compute the tree height; this approach will allow the height of the
  // SVG to scale according to the breadth (width) of the tree layout.
  const root: d3.HierarchyNode<SvgNode> = d3.hierarchy(data);
  const dx = 30;
  const dy = width / (root.height + 1);

  // Create a tree layout.
  // const tree = d3.cluster<MerklePatriciaTrieNode>().nodeSize([dx, dy]);
  const tree = d3.tree<SvgNode>().nodeSize([dx, dy]);

  // Sort the tree and apply the layout.
  root.sort((a, b) => {
    const lhs = getTrieNodeText(a.data);
    const rhs = getTrieNodeText(b.data);
    return d3.ascending(lhs, rhs);
  });
  tree(root);

  // Compute the extent of the tree. Note that x and y are swapped here
  // because in the tree layout, x is the breadth, but when displayed, the
  // tree extends right rather than down.
  let x0 = Infinity;
  let x1 = -x0;
  root.each((d) => {
    const x = d.x;
    if (x === undefined) return;
    if (x > x1) x1 = x;
    if (x < x0) x0 = x;
  });

  // Compute the adjusted height of the tree.
  const height = x1 - x0 + dx * 2;
  // const height = x1 - x0 + dx * 20;

  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-dy / 3, x0 - dx, width, height])
    .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

  svg.append("g")
    .attr("fill", "none")
    // .attr("stroke", "#555")
    .attr("class", "dark:stroke-white stroke-neutral-600")
    .attr("stroke-opacity", 0.4)
    .attr("stroke-width", 1.5)
    .selectAll()
    .data(root.links())
    .join("path")
    .attr(
      "d",
      (d) => {
        const linkGenerator = d3
          .linkHorizontal<
            d3.HierarchyLink<SvgNode>,
            [number, number]
          >()
          .source((d) => [d.source.y ?? 0, d.source.x ?? 0])
          .target((d) => [d.target.y ?? 0, d.target.x ?? 0]);
        return linkGenerator(d);
      },
    )
    .each((n, i, g) => {
      const el = g[i];
      if (el === null || el === undefined) return;
      n.target.data.path = el;
    });

  const node = svg.append("g")
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", 3)
    .selectAll()
    .data(root.descendants())
    .join("g")
    .attr("transform", (d) => `translate(${d.y},${d.x})`);

  node.append("circle")
    .attr("fill", (d) => d.children ? "#555" : "#999")
    .attr("r", 2.5)
    .each((n, i, g) => {
      n.data.svgCircle = g[i];
    });

  node.append("text")
    .attr("dy", "0.31em")
    .attr("x", (d) => d.children ? -6 : 6)
    .attr("text-anchor", (d) => d.children ? "end" : "start")
    // .attr("x", (d) => (d.data.value !== null) ? -6 : 6)
    // .attr("text-anchor", (d) => (d.data.value !== null) ? "end" : "start")
    .text((d) => getTrieNodeText(d.data))
    .attr(
      "class",
      "dark:stroke-none stroke-white dark:fill-white cursor-pointer",
    )
    .attr("paint-order", "stroke")
    .each((n, i, g) => {
      n.data.svgText = g[i];
    });

  return svg.node()!;
}

type Leafs = { [key: string]: SvgNode };
interface SvgState {
  svg: SVGElement;
  trie: SvgNode;
  leafs: Leafs;
}

function trieWalk(
  node: SvgNode,
  path: SvgNode[],
  leafs: Leafs,
) {
  if (path.includes(node)) {
    throw new Error(`repeated node: ${node.id}`);
  }
  path.push(node);
  if (node.value) {
    const key = "0x" + path.map((parent) => parent.nibbles).join("");
    if (Object.prototype.hasOwnProperty.call(leafs, key)) {
      console.error(node);
      throw new Error(`repeated node at '${key}'`);
    }
    leafs[key] = node;
  }
  Object.entries(node.children).forEach(([, child]) => {
    trieWalk(child, path, leafs);
  });
  path.pop();
}

function buildSvgState(
  nodes: Immutable.Map<string, TrieNode>,
  merkleRoot: string,
  width: number,
  dispatch: React.Dispatch<Command>,
): SvgState {
  const [trie, leafs]: [SvgNode, Leafs] = rootFromNodes(
    nodes,
    merkleRoot,
  );
  const svg = createSVG(trie, width);

  Object.entries(leafs).forEach(([key, node]) => {
    if (node.value === null) return;
    node.svgText.addEventListener("mouseenter", (ev: MouseEvent) => {
      dispatch(Commands.trie.highlight({ [key]: "red" }));
    });
    node.svgText.addEventListener("mouseleave", (ev: MouseEvent) => {
      dispatch(Commands.trie.highlight({ [key]: undefined }));
    });
  });
  return { svg, trie, leafs };
}

const setOrRemoveStyle = (
  element: ElementCSSInlineStyle,
  prop: string,
  value: string | undefined,
) => {
  if (value !== undefined) {
    element.style.setProperty(prop, value);
  } else {
    element.style.removeProperty(prop);
  }
};

function selectSvgNodesRecursive(
  selected: SelectedNodes,
  node: SvgNode,
): string | undefined {
  let color: string | undefined = selected.get(node.key);
  node.children.forEach((child) => {
    const childColor = selectSvgNodesRecursive(selected, child);
    if (color === undefined) {
      color = childColor;
    }
  });
  if (node.path) {
    setOrRemoveStyle(node.path, "stroke", color);
  }
  const circle: SVGCircleElement = node.svgCircle;
  setOrRemoveStyle(circle, "stroke", color);
  setOrRemoveStyle(circle, "fill", color);
  return color;
}

function selectSvgNodes(
  selected: SelectedNodes,
  leafs: Leafs,
  merkleRoot: string,
): void {
  const root = Object.values(leafs).find((node) => (node.id === merkleRoot));
  if (root) {
    selectSvgNodesRecursive(selected, root);
  } else {
    console.error("ROOT NOT FOUND:", merkleRoot, leafs);
  }
}

interface ClusterProps {
  nodes: Immutable.Map<string, TrieNode>;
  merkleRoot?: string;
  selected: SelectedNodes;
  dispatch: React.Dispatch<Command>;
}

function Cluster({ nodes, merkleRoot, selected, dispatch }: ClusterProps) {
  const [div, divRef] = React.useState<HTMLDivElement | null>(null);
  const state: SvgState | null = React.useMemo(() => {
    if (merkleRoot && div) {
      return buildSvgState(nodes, merkleRoot, div.offsetWidth * 0.95, dispatch);
    }
    return null;
  }, [merkleRoot, div]);

  if (div && state) {
    const child = div.firstChild;
    if (child && child !== state.svg) {
      div.replaceChild(state.svg, child);
    } else if (div.children.length === 0) {
      div.appendChild(state.svg);
    }
    if (merkleRoot) {
      selectSvgNodes(selected, state.leafs, merkleRoot);
    }
  }
  return <div ref={divRef} className="pb-6 pt-16" />;
}

export default Cluster;
