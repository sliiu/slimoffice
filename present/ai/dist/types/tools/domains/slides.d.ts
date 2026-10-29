export declare const slideTools: (import("...js").ToolDef<Record<string, never>> | import("...js").ToolDef<{
    spec: {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "cover";
        title: string;
        subtitle?: string | undefined;
        author?: string | undefined;
        date?: string | undefined;
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "section";
        number?: string | undefined;
        title: string;
        caption?: string | undefined;
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "bullets";
        title: string;
        bullets: string[];
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "two-column";
        title: string;
        leftTitle?: string | undefined;
        leftBullets: string[];
        rightTitle?: string | undefined;
        rightBullets: string[];
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "quote";
        quote: string;
        attribution?: string | undefined;
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "image-text";
        title: string;
        bullets: string[];
        imageQuery?: string | undefined;
        imagePosition?: "left" | "right" | undefined;
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "table";
        title: string;
        headers: string[];
        rows: string[][];
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "closing";
        title: string;
        message?: string | undefined;
        contact?: string | undefined;
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "content";
        title: string;
        body: string;
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "hero";
        title: string;
        subtitle?: string | undefined;
        eyebrow?: string | undefined;
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "stat";
        value: string;
        label: string;
        context?: string | undefined;
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "cards";
        title: string;
        cards: {
            title: string;
            body: string;
        }[];
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "timeline";
        title: string;
        steps: {
            label: string;
            detail?: string | undefined;
        }[];
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "comparison";
        title: string;
        leftLabel: string;
        leftBullets: string[];
        rightLabel: string;
        rightBullets: string[];
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "agenda";
        title: string;
        items: {
            number?: string | undefined;
            label: string;
            caption?: string | undefined;
        }[];
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "metrics";
        title: string;
        metrics: {
            value: string;
            label: string;
        }[];
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "chart";
        title: string;
        chartType?: "area" | "bar" | "column" | "doughnut" | "line" | "pie" | undefined;
        categories: string[];
        series: {
            name: string;
            values: number[];
        }[];
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "process";
        title: string;
        steps: {
            title: string;
            detail?: string | undefined;
        }[];
    } | {
        notes?: string | undefined;
        bgImageQuery?: string | undefined;
        bgOverlay?: number | undefined;
        heroImageQuery?: string | undefined;
        kind: "banner";
        title: string;
        eyebrow?: string | undefined;
        bullets: string[];
    };
    insertAt?: number | undefined;
    themeId?: string | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
}> | import("...js").ToolDef<{
    from: number;
    to: number;
}> | import("...js").ToolDef<{
    insertAt: number;
}> | import("...js").ToolDef<{
    width: number;
    height: number;
}> | import("...js").ToolDef<{
    themeId: string;
    preserveImageBackgrounds?: boolean | undefined;
}> | import("...js").ToolDef<{
    startIndex: number;
    name: string;
}> | import("...js").ToolDef<{
    sectionId: string;
}> | import("...js").ToolDef<{
    langId: "de" | "en" | "es" | "fr" | "ja" | "ko" | "pt" | "zh";
}> | import("...js").ToolDef<{
    images: {
        src: string;
        caption?: string | undefined;
        natural?: {
            w: number;
            h: number;
        } | undefined;
    }[];
    insertAt?: number | undefined;
    layout?: "2pic" | "4pic" | "fitToSlide" | undefined;
    bw?: boolean | undefined;
    showCaptions?: boolean | undefined;
    frame?: string | undefined;
}> | import("...js").ToolDef<{
    showGuides?: boolean | undefined;
    snapToGrid?: boolean | undefined;
    snapToObjects?: boolean | undefined;
    gridSpacing?: {
        x: number;
        y: number;
    } | undefined;
    slide?: {
        orient: "horz" | "vert";
        pos: number;
    }[] | undefined;
    addGuide?: {
        orient: "horz" | "vert";
        pos: number;
    } | undefined;
    removeGuideIndex?: number | undefined;
}> | import("...js").ToolDef<{
    loop?: boolean | undefined;
    kind?: "browse" | "kiosk" | "present" | undefined;
    showNarration?: boolean | undefined;
    showAnimation?: boolean | undefined;
    useTimings?: boolean | undefined;
    browseShowScrollbar?: boolean | undefined;
    showMediaControls?: boolean | undefined;
    penColor?: string | undefined;
    slides?: "all" | {
        start: number;
        end: number;
    } | undefined;
}>)[];
