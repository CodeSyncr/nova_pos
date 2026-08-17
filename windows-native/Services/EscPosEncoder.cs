using System;
using System.Collections.Generic;
using System.Text;

namespace NovaPOS.Desktop.Services;

/// <summary>
/// ESC/POS command builder — a direct port of src/lib/esc-pos-encoder.ts so a
/// receipt printed from the native till comes out byte-for-byte like one printed
/// from the web app.
/// </summary>
public class EscPosEncoder
{
    private readonly List<byte> _buffer = new();

    public EscPosEncoder Initialize()
    {
        Raw(0x1B, 0x40);        // ESC @  — reset
        Raw(0x1B, 0x4D, 0x00);  // ESC M 0 — Font A
        return this;
    }

    public EscPosEncoder AlignLeft() => Raw(0x1B, 0x61, 0x00);

    public EscPosEncoder AlignCenter() => Raw(0x1B, 0x61, 0x01);

    public EscPosEncoder AlignRight() => Raw(0x1B, 0x61, 0x02);

    public EscPosEncoder Bold(bool on = true) => Raw(0x1B, 0x45, (byte)(on ? 0x01 : 0x00));

    public EscPosEncoder SizeDouble() => Raw(0x1D, 0x21, 0x11);

    public EscPosEncoder SizeNormal() => Raw(0x1D, 0x21, 0x00);

    /// <summary>Rupee sign becomes "Rs" and anything outside printable ASCII is dropped.</summary>
    private static string Sanitise(string value, bool keepNewlines)
    {
        var sb = new StringBuilder(value.Length);
        foreach (char c in value.Replace("\u20B9", "Rs"))
        {
            if (keepNewlines && (c == '\n' || c == '\r')) { sb.Append(c); continue; }
            if (c >= 0x20 && c <= 0x7E) sb.Append(c);
        }
        return sb.ToString();
    }

    public EscPosEncoder Text(string value)
    {
        foreach (char c in Sanitise(value, keepNewlines: true))
            _buffer.Add((byte)c);
        return this;
    }

    public EscPosEncoder Line(string value = "") => Text(value + "\n");

    public EscPosEncoder Divider(int charWidth = 32, char character = '-') => Line(new string(character, charWidth));

    /// <summary>Left label, right value, padded to the paper width.</summary>
    public EscPosEncoder Row(string left, string right, int charWidth = 32)
    {
        string safeLeft = Sanitise(left, false);
        string safeRight = Sanitise(right, false);

        int spaceNeeded = charWidth - (safeLeft.Length + safeRight.Length);
        if (spaceNeeded > 0)
        {
            Text(safeLeft + new string(' ', spaceNeeded) + safeRight + "\n");
        }
        else
        {
            int maxLeft = Math.Max(0, charWidth - safeRight.Length - 2);
            string truncated = safeLeft.Length > maxLeft ? safeLeft[..maxLeft] + ".." : safeLeft;
            int pad = Math.Max(1, charWidth - (truncated.Length + safeRight.Length));
            Text(truncated + new string(' ', pad) + safeRight + "\n");
        }

        return this;
    }

    /// <summary>Item / qty / amount columns, sized for 32- or 48-character paper.</summary>
    public EscPosEncoder ThreeColumnRow(string col1, string col2, string col3, int charWidth = 32)
    {
        string c1 = Sanitise(col1, false);
        string c2 = Sanitise(col2, false);
        string c3 = Sanitise(col3, false);

        int w1 = 17, w2 = 5, w3 = 10;
        if (charWidth >= 48) { w1 = 29; w2 = 7; w3 = 12; }

        c1 = c1.Length > w1 ? c1[..(w1 - 2)] + ".." : c1.PadRight(w1);
        if (c2.Length > w2) c2 = c2[..w2];
        c2 = c2.PadLeft(w2);
        if (c3.Length > w3) c3 = c3[..w3];
        c3 = c3.PadLeft(w3);

        return Text(c1 + c2 + c3 + "\n");
    }

    public EscPosEncoder ItemRow(string name, int quantity, string total, int charWidth = 32)
        => ThreeColumnRow(name, "x" + quantity, total, charWidth);

    /// <summary>Hardware-rendered QR code (model 2, module 6, EC level M).</summary>
    public EscPosEncoder QrCode(string data)
    {
        byte[] payload = Encoding.ASCII.GetBytes(data);

        Raw(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model
        Raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06);       // module size
        Raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);       // error correction

        int numBytes = payload.Length + 3;
        Raw(0x1D, 0x28, 0x6B, (byte)(numBytes & 0xFF), (byte)((numBytes >> 8) & 0xFF), 0x31, 0x50, 0x30);
        _buffer.AddRange(payload);

        Raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);       // print
        return this;
    }

    public EscPosEncoder Cut()
    {
        Raw(0x1B, 0x64, 0x05);        // feed 5 lines
        Raw(0x1D, 0x56, 0x41, 0x08);  // cut
        return this;
    }

    /// <summary>ESC p — cash drawer kick on pin 2.</summary>
    public EscPosEncoder KickDrawer() => Raw(0x1B, 0x70, 0x00, 0x1E, 0xFF);

    public EscPosEncoder Raw(params byte[] bytes)
    {
        _buffer.AddRange(bytes);
        return this;
    }

    public byte[] Encode() => _buffer.ToArray();
}
