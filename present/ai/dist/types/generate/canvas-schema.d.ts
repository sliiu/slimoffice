import { z } from "zod";
import { normalizeSystemId } from "../deckgen/visual-system.js";
export { normalizeSystemId };
export declare const CANVAS_ELEMENT_KINDS: readonly ["text", "image", "rule", "bar", "surface", "ellipse", "line", "chart", "table", "overlay", "shape", "icon", "diagram", "device"];
export declare const CanvasElementSchema: z.ZodObject<{
    slot: z.ZodOptional<z.ZodString>;
    kind: z.ZodEnum<{
        bar: "bar";
        chart: "chart";
        device: "device";
        diagram: "diagram";
        ellipse: "ellipse";
        icon: "icon";
        image: "image";
        line: "line";
        overlay: "overlay";
        rule: "rule";
        shape: "shape";
        surface: "surface";
        table: "table";
        text: "text";
    }>;
    bbox: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodNumber;
        h: z.ZodNumber;
    }, z.core.$strip>;
    paintRole: z.ZodOptional<z.ZodEnum<{
        accent: "accent";
        accentSoft: "accentSoft";
        bg: "bg";
        ink: "ink";
        line: "line";
        muted: "muted";
        surface: "surface";
    }>>;
    text: z.ZodOptional<z.ZodString>;
    runs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        emphasis: z.ZodOptional<z.ZodEnum<{
            accent: "accent";
            bold: "bold";
            mono: "mono";
        }>>;
    }, z.core.$strip>>>;
    fontSize: z.ZodOptional<z.ZodNumber>;
    fontWeight: z.ZodOptional<z.ZodNumber>;
    align: z.ZodOptional<z.ZodEnum<{
        end: "end";
        middle: "middle";
        start: "start";
    }>>;
    src: z.ZodOptional<z.ZodString>;
    rx: z.ZodOptional<z.ZodNumber>;
    fillAlpha: z.ZodOptional<z.ZodNumber>;
    italic: z.ZodOptional<z.ZodBoolean>;
    caps: z.ZodOptional<z.ZodLiteral<"all">>;
    glow: z.ZodOptional<z.ZodBoolean>;
    treatment: z.ZodOptional<z.ZodEnum<{
        [x: string]: string;
    }>>;
    gradient: z.ZodOptional<z.ZodObject<{
        angle: z.ZodNumber;
        toRole: z.ZodEnum<{
            accent: "accent";
            accentSoft: "accentSoft";
            bg: "bg";
            ink: "ink";
            line: "line";
            muted: "muted";
            surface: "surface";
        }>;
        fromAlpha: z.ZodOptional<z.ZodNumber>;
        toAlpha: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    shadow: z.ZodOptional<z.ZodObject<{
        blur: z.ZodNumber;
        dx: z.ZodNumber;
        dy: z.ZodNumber;
        alpha: z.ZodNumber;
    }, z.core.$strip>>;
    chart: z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<{
            area: "area";
            bar: "bar";
            column: "column";
            doughnut: "doughnut";
            line: "line";
            pie: "pie";
        }>;
        categories: z.ZodArray<z.ZodString>;
        series: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            values: z.ZodArray<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    table: z.ZodOptional<z.ZodObject<{
        headers: z.ZodArray<z.ZodString>;
        rows: z.ZodArray<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    x2: z.ZodOptional<z.ZodNumber>;
    y2: z.ZodOptional<z.ZodNumber>;
    dash: z.ZodOptional<z.ZodEnum<{
        dash: "dash";
        dot: "dot";
        solid: "solid";
    }>>;
    arrow: z.ZodOptional<z.ZodEnum<{
        both: "both";
        end: "end";
        none: "none";
    }>>;
    preset: z.ZodOptional<z.ZodString>;
    strokeOnly: z.ZodOptional<z.ZodBoolean>;
    icon: z.ZodOptional<z.ZodString>;
    link: z.ZodOptional<z.ZodNumber>;
    diagram: z.ZodOptional<z.ZodObject<{
        layout: z.ZodEnum<{
            [x: string]: string;
        }>;
        items: z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodObject<{
            title: z.ZodString;
            body: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>]>>;
    }, z.core.$strip>>;
    device: z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<{
            agendaList: "agendaList";
            calloutNote: "calloutNote";
            comparePlanes: "comparePlanes";
            iconLabelGrid: "iconLabelGrid";
            kpiRow: "kpiRow";
            numberedList: "numberedList";
            quoteBlock: "quoteBlock";
            stepStrip: "stepStrip";
            takeawayBand: "takeawayBand";
        }>;
        items: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            body: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodString>;
            note: z.ZodOptional<z.ZodString>;
            icon: z.ZodOptional<z.ZodString>;
            target: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>]>>>;
        text: z.ZodOptional<z.ZodString>;
        attribution: z.ZodOptional<z.ZodString>;
        icon: z.ZodOptional<z.ZodString>;
        left: z.ZodOptional<z.ZodObject<{
            title: z.ZodString;
            points: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        right: z.ZodOptional<z.ZodObject<{
            title: z.ZodString;
            points: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const CanvasSlideSchema: z.ZodObject<{
    job: z.ZodString;
    variant: z.ZodOptional<z.ZodString>;
    background: z.ZodOptional<z.ZodObject<{
        kind: z.ZodEnum<{
            image: "image";
            linear: "linear";
            solid: "solid";
        }>;
        src: z.ZodOptional<z.ZodString>;
        paintRole: z.ZodOptional<z.ZodEnum<{
            accent: "accent";
            accentSoft: "accentSoft";
            bg: "bg";
            ink: "ink";
            line: "line";
            muted: "muted";
            surface: "surface";
        }>>;
        overlay: z.ZodOptional<z.ZodNumber>;
        overlayRole: z.ZodOptional<z.ZodEnum<{
            accent: "accent";
            accentSoft: "accentSoft";
            bg: "bg";
            ink: "ink";
            line: "line";
            muted: "muted";
            surface: "surface";
        }>>;
        scrim: z.ZodOptional<z.ZodObject<{
            direction: z.ZodEnum<{
                bottom: "bottom";
                flat: "flat";
                left: "left";
                radial: "radial";
                right: "right";
                top: "top";
            }>;
            strength: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        angle: z.ZodOptional<z.ZodNumber>;
        toRole: z.ZodOptional<z.ZodEnum<{
            accent: "accent";
            accentSoft: "accentSoft";
            bg: "bg";
            ink: "ink";
            line: "line";
            muted: "muted";
            surface: "surface";
        }>>;
    }, z.core.$strip>>;
    elements: z.ZodArray<z.ZodObject<{
        slot: z.ZodOptional<z.ZodString>;
        kind: z.ZodEnum<{
            bar: "bar";
            chart: "chart";
            device: "device";
            diagram: "diagram";
            ellipse: "ellipse";
            icon: "icon";
            image: "image";
            line: "line";
            overlay: "overlay";
            rule: "rule";
            shape: "shape";
            surface: "surface";
            table: "table";
            text: "text";
        }>;
        bbox: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            w: z.ZodNumber;
            h: z.ZodNumber;
        }, z.core.$strip>;
        paintRole: z.ZodOptional<z.ZodEnum<{
            accent: "accent";
            accentSoft: "accentSoft";
            bg: "bg";
            ink: "ink";
            line: "line";
            muted: "muted";
            surface: "surface";
        }>>;
        text: z.ZodOptional<z.ZodString>;
        runs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            emphasis: z.ZodOptional<z.ZodEnum<{
                accent: "accent";
                bold: "bold";
                mono: "mono";
            }>>;
        }, z.core.$strip>>>;
        fontSize: z.ZodOptional<z.ZodNumber>;
        fontWeight: z.ZodOptional<z.ZodNumber>;
        align: z.ZodOptional<z.ZodEnum<{
            end: "end";
            middle: "middle";
            start: "start";
        }>>;
        src: z.ZodOptional<z.ZodString>;
        rx: z.ZodOptional<z.ZodNumber>;
        fillAlpha: z.ZodOptional<z.ZodNumber>;
        italic: z.ZodOptional<z.ZodBoolean>;
        caps: z.ZodOptional<z.ZodLiteral<"all">>;
        glow: z.ZodOptional<z.ZodBoolean>;
        treatment: z.ZodOptional<z.ZodEnum<{
            [x: string]: string;
        }>>;
        gradient: z.ZodOptional<z.ZodObject<{
            angle: z.ZodNumber;
            toRole: z.ZodEnum<{
                accent: "accent";
                accentSoft: "accentSoft";
                bg: "bg";
                ink: "ink";
                line: "line";
                muted: "muted";
                surface: "surface";
            }>;
            fromAlpha: z.ZodOptional<z.ZodNumber>;
            toAlpha: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        shadow: z.ZodOptional<z.ZodObject<{
            blur: z.ZodNumber;
            dx: z.ZodNumber;
            dy: z.ZodNumber;
            alpha: z.ZodNumber;
        }, z.core.$strip>>;
        chart: z.ZodOptional<z.ZodObject<{
            type: z.ZodEnum<{
                area: "area";
                bar: "bar";
                column: "column";
                doughnut: "doughnut";
                line: "line";
                pie: "pie";
            }>;
            categories: z.ZodArray<z.ZodString>;
            series: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                values: z.ZodArray<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        table: z.ZodOptional<z.ZodObject<{
            headers: z.ZodArray<z.ZodString>;
            rows: z.ZodArray<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        x2: z.ZodOptional<z.ZodNumber>;
        y2: z.ZodOptional<z.ZodNumber>;
        dash: z.ZodOptional<z.ZodEnum<{
            dash: "dash";
            dot: "dot";
            solid: "solid";
        }>>;
        arrow: z.ZodOptional<z.ZodEnum<{
            both: "both";
            end: "end";
            none: "none";
        }>>;
        preset: z.ZodOptional<z.ZodString>;
        strokeOnly: z.ZodOptional<z.ZodBoolean>;
        icon: z.ZodOptional<z.ZodString>;
        link: z.ZodOptional<z.ZodNumber>;
        diagram: z.ZodOptional<z.ZodObject<{
            layout: z.ZodEnum<{
                [x: string]: string;
            }>;
            items: z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodObject<{
                title: z.ZodString;
                body: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>]>>;
        }, z.core.$strip>>;
        device: z.ZodOptional<z.ZodObject<{
            type: z.ZodEnum<{
                agendaList: "agendaList";
                calloutNote: "calloutNote";
                comparePlanes: "comparePlanes";
                iconLabelGrid: "iconLabelGrid";
                kpiRow: "kpiRow";
                numberedList: "numberedList";
                quoteBlock: "quoteBlock";
                stepStrip: "stepStrip";
                takeawayBand: "takeawayBand";
            }>;
            items: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodObject<{
                title: z.ZodOptional<z.ZodString>;
                body: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodString>;
                note: z.ZodOptional<z.ZodString>;
                icon: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>]>>>;
            text: z.ZodOptional<z.ZodString>;
            attribution: z.ZodOptional<z.ZodString>;
            icon: z.ZodOptional<z.ZodString>;
            left: z.ZodOptional<z.ZodObject<{
                title: z.ZodString;
                points: z.ZodArray<z.ZodString>;
            }, z.core.$strip>>;
            right: z.ZodOptional<z.ZodObject<{
                title: z.ZodString;
                points: z.ZodArray<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * Canvas JSON must not go through outline field aliases (`layout` → `layoutHint`).
 * Models often say layout/theme/shapes; map those onto the canvas schema.
 */
export declare function normalizeCanvasDeck(raw: unknown): unknown;
export declare const CanvasDeckSchema: z.ZodObject<{
    systemId: z.ZodString;
    themeId: z.ZodOptional<z.ZodEnum<{
        ikb: "ikb";
        indigo: "indigo";
        ink: "ink";
        kraft: "kraft";
        lemon: "lemon";
        signal: "signal";
    }>>;
    palette: z.ZodOptional<z.ZodObject<{
        bg: z.ZodString;
        surface: z.ZodOptional<z.ZodString>;
        ink: z.ZodString;
        muted: z.ZodOptional<z.ZodString>;
        line: z.ZodOptional<z.ZodString>;
        accent: z.ZodString;
        accentSoft: z.ZodOptional<z.ZodString>;
        brand: z.ZodOptional<z.ZodString>;
        onPhoto: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    slides: z.ZodArray<z.ZodObject<{
        job: z.ZodString;
        variant: z.ZodOptional<z.ZodString>;
        background: z.ZodOptional<z.ZodObject<{
            kind: z.ZodEnum<{
                image: "image";
                linear: "linear";
                solid: "solid";
            }>;
            src: z.ZodOptional<z.ZodString>;
            paintRole: z.ZodOptional<z.ZodEnum<{
                accent: "accent";
                accentSoft: "accentSoft";
                bg: "bg";
                ink: "ink";
                line: "line";
                muted: "muted";
                surface: "surface";
            }>>;
            overlay: z.ZodOptional<z.ZodNumber>;
            overlayRole: z.ZodOptional<z.ZodEnum<{
                accent: "accent";
                accentSoft: "accentSoft";
                bg: "bg";
                ink: "ink";
                line: "line";
                muted: "muted";
                surface: "surface";
            }>>;
            scrim: z.ZodOptional<z.ZodObject<{
                direction: z.ZodEnum<{
                    bottom: "bottom";
                    flat: "flat";
                    left: "left";
                    radial: "radial";
                    right: "right";
                    top: "top";
                }>;
                strength: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            angle: z.ZodOptional<z.ZodNumber>;
            toRole: z.ZodOptional<z.ZodEnum<{
                accent: "accent";
                accentSoft: "accentSoft";
                bg: "bg";
                ink: "ink";
                line: "line";
                muted: "muted";
                surface: "surface";
            }>>;
        }, z.core.$strip>>;
        elements: z.ZodArray<z.ZodObject<{
            slot: z.ZodOptional<z.ZodString>;
            kind: z.ZodEnum<{
                bar: "bar";
                chart: "chart";
                device: "device";
                diagram: "diagram";
                ellipse: "ellipse";
                icon: "icon";
                image: "image";
                line: "line";
                overlay: "overlay";
                rule: "rule";
                shape: "shape";
                surface: "surface";
                table: "table";
                text: "text";
            }>;
            bbox: z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
                w: z.ZodNumber;
                h: z.ZodNumber;
            }, z.core.$strip>;
            paintRole: z.ZodOptional<z.ZodEnum<{
                accent: "accent";
                accentSoft: "accentSoft";
                bg: "bg";
                ink: "ink";
                line: "line";
                muted: "muted";
                surface: "surface";
            }>>;
            text: z.ZodOptional<z.ZodString>;
            runs: z.ZodOptional<z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                emphasis: z.ZodOptional<z.ZodEnum<{
                    accent: "accent";
                    bold: "bold";
                    mono: "mono";
                }>>;
            }, z.core.$strip>>>;
            fontSize: z.ZodOptional<z.ZodNumber>;
            fontWeight: z.ZodOptional<z.ZodNumber>;
            align: z.ZodOptional<z.ZodEnum<{
                end: "end";
                middle: "middle";
                start: "start";
            }>>;
            src: z.ZodOptional<z.ZodString>;
            rx: z.ZodOptional<z.ZodNumber>;
            fillAlpha: z.ZodOptional<z.ZodNumber>;
            italic: z.ZodOptional<z.ZodBoolean>;
            caps: z.ZodOptional<z.ZodLiteral<"all">>;
            glow: z.ZodOptional<z.ZodBoolean>;
            treatment: z.ZodOptional<z.ZodEnum<{
                [x: string]: string;
            }>>;
            gradient: z.ZodOptional<z.ZodObject<{
                angle: z.ZodNumber;
                toRole: z.ZodEnum<{
                    accent: "accent";
                    accentSoft: "accentSoft";
                    bg: "bg";
                    ink: "ink";
                    line: "line";
                    muted: "muted";
                    surface: "surface";
                }>;
                fromAlpha: z.ZodOptional<z.ZodNumber>;
                toAlpha: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            shadow: z.ZodOptional<z.ZodObject<{
                blur: z.ZodNumber;
                dx: z.ZodNumber;
                dy: z.ZodNumber;
                alpha: z.ZodNumber;
            }, z.core.$strip>>;
            chart: z.ZodOptional<z.ZodObject<{
                type: z.ZodEnum<{
                    area: "area";
                    bar: "bar";
                    column: "column";
                    doughnut: "doughnut";
                    line: "line";
                    pie: "pie";
                }>;
                categories: z.ZodArray<z.ZodString>;
                series: z.ZodArray<z.ZodObject<{
                    name: z.ZodString;
                    values: z.ZodArray<z.ZodNumber>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            table: z.ZodOptional<z.ZodObject<{
                headers: z.ZodArray<z.ZodString>;
                rows: z.ZodArray<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            x2: z.ZodOptional<z.ZodNumber>;
            y2: z.ZodOptional<z.ZodNumber>;
            dash: z.ZodOptional<z.ZodEnum<{
                dash: "dash";
                dot: "dot";
                solid: "solid";
            }>>;
            arrow: z.ZodOptional<z.ZodEnum<{
                both: "both";
                end: "end";
                none: "none";
            }>>;
            preset: z.ZodOptional<z.ZodString>;
            strokeOnly: z.ZodOptional<z.ZodBoolean>;
            icon: z.ZodOptional<z.ZodString>;
            link: z.ZodOptional<z.ZodNumber>;
            diagram: z.ZodOptional<z.ZodObject<{
                layout: z.ZodEnum<{
                    [x: string]: string;
                }>;
                items: z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodObject<{
                    title: z.ZodString;
                    body: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>]>>;
            }, z.core.$strip>>;
            device: z.ZodOptional<z.ZodObject<{
                type: z.ZodEnum<{
                    agendaList: "agendaList";
                    calloutNote: "calloutNote";
                    comparePlanes: "comparePlanes";
                    iconLabelGrid: "iconLabelGrid";
                    kpiRow: "kpiRow";
                    numberedList: "numberedList";
                    quoteBlock: "quoteBlock";
                    stepStrip: "stepStrip";
                    takeawayBand: "takeawayBand";
                }>;
                items: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodObject<{
                    title: z.ZodOptional<z.ZodString>;
                    body: z.ZodOptional<z.ZodString>;
                    value: z.ZodOptional<z.ZodString>;
                    note: z.ZodOptional<z.ZodString>;
                    icon: z.ZodOptional<z.ZodString>;
                    target: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>]>>>;
                text: z.ZodOptional<z.ZodString>;
                attribution: z.ZodOptional<z.ZodString>;
                icon: z.ZodOptional<z.ZodString>;
                left: z.ZodOptional<z.ZodObject<{
                    title: z.ZodString;
                    points: z.ZodArray<z.ZodString>;
                }, z.core.$strip>>;
                right: z.ZodOptional<z.ZodObject<{
                    title: z.ZodString;
                    points: z.ZodArray<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CanvasDeck = z.infer<typeof CanvasDeckSchema>;
