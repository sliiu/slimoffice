export type XmlNode = Record<string, unknown>;
export declare function parseXml(input: string): XmlNode;
/** Children in the order they appear in the file. */
export declare function ordered(node: XmlNode): Array<{
    name: string;
    node: XmlNode;
}>;
export declare function child(node: XmlNode, name: string): XmlNode | undefined;
export declare function children(node: XmlNode | undefined, name: string): XmlNode[];
export declare function attr(node: XmlNode, name: string): string | undefined;
export declare function text(node: XmlNode | undefined): string;
