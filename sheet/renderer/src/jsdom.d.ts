declare module "jsdom" {
  export class JSDOM {
    window: Window & { document: Document };
    constructor(html: string);
  }
}
