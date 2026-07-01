/**
 * Local type override for web-tree-sitter.
 *
 * The upstream types declare children/namedChildren as (Node | null)[],
 * but in practice they never contain null entries. This override uses
 * non-nullable arrays to match native tree-sitter's API and avoid
 * pervasive null-check changes across the extraction pipeline.
 *
 * This file takes precedence over node_modules/web-tree-sitter/web-tree-sitter.d.ts
 * because TypeScript resolves local declarations first.
 */
declare module 'web-tree-sitter' {
  export interface Point {
    row: number;
    column: number;
  }

  export interface Range {
    startPosition: Point;
    endPosition: Point;
    startIndex: number;
    endIndex: number;
  }

  export interface Edit {
    startPosition: Point;
    oldEndPosition: Point;
    newEndPosition: Point;
    startIndex: number;
    oldEndIndex: number;
    newEndIndex: number;
  }

  export type ParseCallback = (index: number, position: Point) => string | undefined;

  export interface ParseOptions {
    includedRanges?: Range[];
    progressCallback?: (state: { currentOffset: number; hasError: boolean }) => void;
  }

  export interface EmscriptenModule {
    [key: string]: any;
  }

  export class Parser {
    language: Language | null;
    static init(moduleOptions?: EmscriptenModule): Promise<void>;
    constructor();
    delete(): void;
    setLanguage(language: Language | null): this;
    parse(callback: string | ParseCallback, oldTree?: Tree | null, options?: ParseOptions): Tree | null;
    reset(): void;
    getIncludedRanges(): Range[];
    getTimeoutMicros(): number;
    setTimeoutMicros(timeout: number): void;
    setLogger(callback: ((message: string, isLex: boolean) => void) | boolean | null): this;
    getLogger(): ((message: string, isLex: boolean) => void) | null;
  }

  export class Language {
    types: string[];
    fields: (string | null)[];
    get name(): string | null;
    get version(): number;
    get abiVersion(): number;
    get fieldCount(): number;
    get stateCount(): number;
    fieldIdForName(fieldName: string): number | null;
    fieldNameForId(fieldId: number): string | null;
    idForNodeType(type: string, named: boolean): number | null;
    get nodeTypeCount(): number;
    nodeTypeForId(typeId: number): string | null;
    nodeTypeIsNamed(typeId: number): boolean;
    nodeTypeIsVisible(typeId: number): boolean;
    get supertypes(): number[];
    subtypes(supertype: number): number[];
    nextState(stateId: number, typeId: number): number;
    lookaheadIterator(stateId: number): any;
    query(source: string): any;
    static load(input: string | Uint8Array): Promise<Language>;
  }

  export class Tree {
    language: Language;
    copy(): Tree;
    delete(): void;
    get rootNode(): Node;
    rootNodeWithOffset(offsetBytes: number, offsetExtent: Point): Node;
    edit(edit: Edit): void;
    walk(): TreeCursor;
    getChangedRanges(other: Tree): Range[];
    getIncludedRanges(): Range[];
  }

  export class Node {
    id: number;
    startIndex: number;
    startPosition: Point;
    tree: Tree;
    get typeId(): number;
    get grammarId(): number;
    get type(): string;
    get grammarType(): string;
    get isNamed(): boolean;
    get isExtra(): boolean;
    get isError(): boolean;
    get isMissing(): boolean;
    get hasChanges(): boolean;
    get hasError(): boolean;
    get endIndex(): number;
    get endPosition(): Point;
    get text(): string;
    get parseState(): number;
    get nextParseState(): number;
    equals(other: Node): boolean;
    child(index: number): Node | null;
    namedChild(index: number): Node | null;
    childForFieldId(fieldId: number): Node | null;
    childForFieldName(fieldName: string): Node | null;
    fieldNameForChild(index: number): string | null;
    fieldNameForNamedChild(index: number): string | null;
    childrenForFieldName(fieldName: string): Node[];
    childrenForFieldId(fieldId: number): Node[];
    firstChildForIndex(index: number): Node | null;
    firstNamedChildForIndex(index: number): Node | null;
    get childCount(): number;
    get namedChildCount(): number;
    get firstChild(): Node | null;
    get firstNamedChild(): Node | null;
    get lastChild(): Node | null;
    get lastNamedChild(): Node | null;
    // Override: non-nullable arrays (tree-sitter never returns null in these)
    get children(): Node[];
    get namedChildren(): Node[];
    descendantsOfType(types: string | string[], startPosition?: Point, endPosition?: Point): Node[];
    get nextSibling(): Node | null;
    get previousSibling(): Node | null;
    get nextNamedSibling(): Node | null;
    get previousNamedSibling(): Node | null;
    get descendantCount(): number;
    get parent(): Node | null;
    childWithDescendant(descendant: Node): Node | null;
    descendantForIndex(start: number, end?: number): Node | null;
    namedDescendantForIndex(start: number, end?: number): Node | null;
    descendantForPosition(start: Point, end?: Point): Node | null;
    namedDescendantForPosition(start: Point, end?: Point): Node | null;
    walk(): TreeCursor;
    edit(edit: Edit): void;
    toString(): string;
  }

  export class TreeCursor {
    copy(): TreeCursor;
    delete(): void;
    get currentNode(): Node;
    get currentFieldId(): number;
    get currentFieldName(): string | null;
    get currentDepth(): number;
    get currentDescendantIndex(): number;
    get nodeType(): string;
    get nodeTypeId(): number;
    get nodeStateId(): number;
    get nodeId(): number;
    get nodeIsNamed(): boolean;
    get nodeIsMissing(): boolean;
    get nodeText(): string;
    get startPosition(): Point;
    get endPosition(): Point;
    get startIndex(): number;
    get endIndex(): number;
    gotoFirstChild(): boolean;
    gotoLastChild(): boolean;
    gotoParent(): boolean;
    gotoNextSibling(): boolean;
    gotoPreviousSibling(): boolean;
    gotoDescendant(goalDescendantIndex: number): void;
    gotoFirstChildForIndex(goalIndex: number): boolean;
    gotoFirstChildForPosition(goalPosition: Point): boolean;
    reset(node: Node): void;
    resetTo(cursor: TreeCursor): void;
  }
}
