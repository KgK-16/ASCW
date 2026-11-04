// LZF decompression (the format of Krita's layer tiles), used by tools/map.py through ctypes.
// Returns the decompressed length, or -1 on broken data.
#include <stdint.h>
#include <string.h>

int lzf_dec(const uint8_t *in, int in_len, uint8_t *out, int out_len) {
    const uint8_t *ip = in, *in_end = in + in_len;
    uint8_t *op = out, *out_end = out + out_len;
    while (ip < in_end) {
        unsigned ctrl = *ip++;
        if (ctrl < 32) { // a run of ctrl + 1 literal bytes
            ctrl++;
            if (op + ctrl > out_end || ip + ctrl > in_end) return -1;
            memcpy(op, ip, ctrl);
            op += ctrl;
            ip += ctrl;
        } else { // a back reference: length (3 bits, or 7 + one more byte) and offset
            unsigned len = ctrl >> 5;
            int offset = (ctrl & 31) << 8;
            if (len == 7) len += *ip++;
            offset += *ip++;
            len += 2;
            uint8_t *ref = op - offset - 1;
            if (ref < out || op + len > out_end) return -1;
            while (len--) *op++ = *ref++;
        }
    }
    return (int)(op - out);
}
