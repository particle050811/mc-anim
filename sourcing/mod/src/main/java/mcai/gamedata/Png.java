package mcai.gamedata;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;

/** 最小的 PNG 编码（8 位 RGBA、不滤波、deflate 9 级）：不靠游戏的 NativeImage，同样的像素永远出同样的字节，换版本也不变。 */
public final class Png {
    private Png() {
    }

    public static byte[] encode(int width, int height, int[] argb) throws IOException {
        ByteArrayOutputStream raw = new ByteArrayOutputStream();
        Deflater deflater = new Deflater(9);
        try (DeflaterOutputStream z = new DeflaterOutputStream(raw, deflater)) {
            byte[] row = new byte[1 + width * 4];
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    int c = argb[y * width + x];
                    row[1 + x * 4] = (byte) (c >> 16);
                    row[2 + x * 4] = (byte) (c >> 8);
                    row[3 + x * 4] = (byte) c;
                    row[4 + x * 4] = (byte) (c >>> 24);
                }
                z.write(row);
            }
        } finally {
            deflater.end();
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        DataOutputStream d = new DataOutputStream(out);
        d.write(new byte[]{(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'});
        ByteArrayOutputStream ihdr = new ByteArrayOutputStream();
        DataOutputStream h = new DataOutputStream(ihdr);
        h.writeInt(width);
        h.writeInt(height);
        h.write(new byte[]{8, 6, 0, 0, 0});
        chunk(d, "IHDR", ihdr.toByteArray());
        chunk(d, "IDAT", raw.toByteArray());
        chunk(d, "IEND", new byte[0]);
        return out.toByteArray();
    }

    private static void chunk(DataOutputStream d, String type, byte[] data) throws IOException {
        byte[] t = type.getBytes(StandardCharsets.US_ASCII);
        d.writeInt(data.length);
        d.write(t);
        d.write(data);
        CRC32 crc = new CRC32();
        crc.update(t);
        crc.update(data);
        d.writeInt((int) crc.getValue());
    }
}
