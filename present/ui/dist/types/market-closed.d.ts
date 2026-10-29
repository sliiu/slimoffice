/** 未上架时三个站点读的公开地址。失败或未配置时视为已上架。 */
export declare function marketStatusUrl(explicitBase?: string): string | null;
export declare function marketIsOpen(explicitBase?: string): Promise<boolean>;
export declare function renderMarketClosed(target?: HTMLElement): void;
