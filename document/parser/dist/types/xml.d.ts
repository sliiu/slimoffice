export type XmlNode = Record<string, unknown>;
export declare function parseXml(input: string): XmlNode;
/** Parses one element and returns its markup with the original prefixes, so it can be written back unchanged. */
export declare function keepMarkup(input: string): string;
/** The body of a document, parsed with prefixes kept, in document order. */
export declare function keptBody(input: string): Array<{
    name: string;
    node: XmlNode;
}>;
/**
 * One element's markup with its original prefixes. `path` is the local name at each level,
 * and `occurrence` counts how many earlier siblings share that name, so the prefixed tree
 * lines up with the tree that had its prefixes removed.
 */
export declare function keptAt(items: Array<{
    name: string;
    node: XmlNode;
}>, index: number, path: Array<[string, string, number]>): string;
/** Children in the order they appear in the file. */
export declare function ordered(node: XmlNode): Array<{
    name: string;
    node: XmlNode;
}>;
export declare function child(node: XmlNode, name: string): XmlNode | undefined;
export declare function children(node: XmlNode | undefined, name: string): XmlNode[];
export declare function attr(node: XmlNode, name: string): string | undefined;
export declare function text(node: XmlNode | undefined): string;
/** The markup of one node, with its attributes and children, so a part the model does not edit can be written back as it was. */
export declare function serialize(name: string, node: XmlNode): string;
//# sourceMappingURL=xml.d.ts.map