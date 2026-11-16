export interface XmlNode {
    name: string;
    attrs: Record<string, string>;
    children: XmlNode[];
    text: string;
}
export declare function parseXml(xml: string): XmlNode;
export declare function child(node: XmlNode | undefined, name: string): XmlNode | undefined;
export declare function children(node: XmlNode | undefined, name: string): XmlNode[];
export declare function attr(node: XmlNode | undefined, name: string): string | undefined;
