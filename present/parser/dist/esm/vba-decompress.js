/** MS-OVBA §2.4.1 — decompress `dir` / module streams in vbaProject.bin. */
function copyTokenBitCount(decompressedCurrent) {
    if (decompressedCurrent <= 16)
        return 12;
    if (decompressedCurrent <= 32)
        return 11;
    if (decompressedCurrent <= 64)
        return 10;
    if (decompressedCurrent <= 128)
        return 9;
    if (decompressedCurrent <= 256)
        return 8;
    if (decompressedCurrent <= 512)
        return 7;
    if (decompressedCurrent <= 1024)
        return 6;
    if (decompressedCurrent <= 2048)
        return 5;
    return 4;
}
/** Decompress a VBA compressed container; returns null when signature / layout invalid. */
export function decompressVbaStream(data) {
    if (!data.length)
        return new Uint8Array(0);
    if (data[0] !== 0x01)
        return null;
    const output = [];
    let pos = 1;
    while (pos < data.length) {
        if (pos + 1 >= data.length)
            break;
        const header = data[pos] | (data[pos + 1] << 8);
        pos += 2;
        const chunkSize = (header & 0x0fff) + 3;
        const isCompressed = (header & 0x8000) !== 0;
        const chunkEnd = Math.min(pos + chunkSize - 2, data.length);
        if (!isCompressed) {
            const rawEnd = Math.min(chunkEnd, pos + 4096, data.length);
            for (let i = pos; i < rawEnd; i++)
                output.push(data[i]);
            pos = chunkEnd;
            continue;
        }
        const chunkStartOutput = output.length;
        while (pos < chunkEnd) {
            if (pos >= data.length)
                break;
            const flagByte = data[pos];
            pos += 1;
            for (let bit = 0; bit < 8; bit++) {
                if (pos >= chunkEnd)
                    break;
                if (((flagByte >> bit) & 1) === 0) {
                    output.push(data[pos]);
                    pos += 1;
                }
                else {
                    if (pos + 1 >= data.length) {
                        pos = chunkEnd;
                        break;
                    }
                    const token = data[pos] | (data[pos + 1] << 8);
                    pos += 2;
                    const decompressedCurrent = output.length - chunkStartOutput;
                    const bitCount = copyTokenBitCount(decompressedCurrent);
                    const lengthMask = 0xffff >> bitCount;
                    const offsetMask = ~lengthMask;
                    const length = ((token & lengthMask) + 3) >>> 0;
                    const offset = (((token & offsetMask) >>> (16 - bitCount)) + 1) >>> 0;
                    if (offset > output.length)
                        break;
                    const copyStart = output.length - offset;
                    for (let i = 0; i < length; i++)
                        output.push(output[copyStart + (i % offset)]);
                }
            }
        }
    }
    return new Uint8Array(output);
}
