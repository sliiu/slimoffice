const identityTransform = { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };
function mockLayer(shapes) {
    return { id: "layer_main", name: "Main", visible: true, locked: false, shapes };
}
function mockText(partial) {
    return {
        kind: "text",
        id: partial.id,
        name: partial.name,
        visible: true,
        bbox: partial.bbox,
        paragraphs: partial.paragraphs,
        transform: identityTransform,
        zIndex: 0,
        locked: false,
        opacity: 1,
    };
}
export function buildBadDeckFixture() {
    const slides = [
        {
            name: "Cover",
            background: { kind: "solid", color: "#1e40af" },
            layers: [
                mockLayer([
                    mockText({
                        id: "t0",
                        name: "Title",
                        bbox: { x: 100, y: 300, w: 1080, h: 120 },
                        paragraphs: [{ runs: [{ text: "Bad Deck Title" }] }],
                    }),
                ]),
            ],
            notes: "Cover notes",
        },
        { name: "Bullets 1", notes: "Notes 1" },
        { name: "Bullets 2", notes: "Notes 2" },
        { name: "Hero", notes: "Notes 3" },
        { name: "Bullets 3", notes: "Notes 4" },
        {
            name: "Content",
            layers: [
                mockLayer([
                    mockText({
                        id: "t5a",
                        name: "Text A",
                        bbox: { x: 100, y: 100, w: 400, h: 80 },
                        paragraphs: [{ runs: [{ text: "Overlapping A" }] }],
                    }),
                    mockText({
                        id: "t5b",
                        name: "Text B",
                        bbox: { x: 150, y: 120, w: 400, h: 80 },
                        paragraphs: [{ runs: [{ text: "Overlapping B" }] }],
                    }),
                ]),
            ],
            notes: "Notes 5",
        },
        { name: "Bullets 4" },
        { name: "Bullets 5" },
        {
            name: "Violence keyword slide",
            layers: [
                mockLayer([
                    mockText({
                        id: "t8",
                        name: "Bad image violence",
                        bbox: { x: 100, y: 100, w: 400, h: 80 },
                        paragraphs: [{ runs: [{ text: "Content" }] }],
                    }),
                ]),
            ],
            notes: "Notes 8",
        },
        { name: "Cards", notes: "Notes 9" },
        { name: "Bullets 6" },
        { name: "Bullets 7" },
        { name: "Bullets 8" },
        { name: "Image-text", notes: "Notes 13" },
        { name: "Bullets 9", notes: "Notes 14" },
        { name: "Closing", notes: "Notes 15" },
    ];
    return {
        id: "pres_bad_fixture",
        size: { width: 1280, height: 720 },
        slides: slides.map((s, i) => ({
            id: `s${i}`,
            index: i,
            background: (s.background ?? { kind: "solid", color: "#ffffff" }),
            layers: s.layers ?? [mockLayer([])],
            notes: s.notes ?? "",
            visible: true,
            ...s,
        })),
        masters: [],
        theme: { id: "theme_mock", colors: { bg1: "#ffffff" } },
    };
}
