export type XmlNode = Record<string, any>;
export interface OrderedRef {
    tag: string;
    node: XmlNode;
}
export declare function parseXml(input: string): XmlNode;
export declare function orderedChildren(node: XmlNode | undefined): OrderedRef[];
export declare const arr: <T>(v: T | T[] | undefined | null) => T[];
export declare const attr: (node: XmlNode | undefined, name: string) => string | undefined;
export declare const child: (node: XmlNode | undefined, name: string) => XmlNode | undefined;
export declare const children: (node: XmlNode | undefined, name: string) => XmlNode[];
export declare function findByLocalName(node: XmlNode | undefined, localName: string): XmlNode | undefined;
export declare function findAllByLocalName(node: XmlNode | undefined, localName: string): XmlNode[];
export declare function stripNs(name: string): string;
export declare function pickAlternateContentChildren(altNode: XmlNode | undefined): OrderedRef[];
