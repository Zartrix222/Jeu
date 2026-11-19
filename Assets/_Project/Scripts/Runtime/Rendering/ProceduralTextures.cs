using UnityEngine;

namespace Industria.Rendering
{
    /// <summary>Small runtime-generated textures (no imported art needed for the prototype).</summary>
    public static class ProceduralTextures
    {
        /// <summary>Tileable noisy texture around a base color.</summary>
        public static Texture2D Noise(string name, Color a, Color b, float frequency, int size = 128, int seed = 0)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, true) { name = name, wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Bilinear, anisoLevel = 2 };
            var pixels = new Color[size * size];
            float off = seed * 17.123f;
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float u = x / (float)size, v = y / (float)size;
                    float n = TileableNoise(u, v, frequency, off) * 0.65f + TileableNoise(u, v, frequency * 4f, off + 31f) * 0.35f;
                    pixels[y * size + x] = Color.Lerp(a, b, n);
                }
            }
            tex.SetPixels(pixels);
            tex.Apply(true, true);
            return tex;
        }

        /// <summary>Perlin noise made tileable by blending four samples.</summary>
        private static float TileableNoise(float u, float v, float f, float off)
        {
            float n00 = Mathf.PerlinNoise(u * f + off, v * f + off);
            float n10 = Mathf.PerlinNoise((u - 1f) * f + off, v * f + off);
            float n01 = Mathf.PerlinNoise(u * f + off, (v - 1f) * f + off);
            float n11 = Mathf.PerlinNoise((u - 1f) * f + off, (v - 1f) * f + off);
            return Mathf.Lerp(Mathf.Lerp(n00, n10, u), Mathf.Lerp(n01, n11, u), v);
        }

        /// <summary>Belt texture: dark rubber with lighter chevrons.</summary>
        public static Texture2D BeltStripes()
        {
            const int size = 64;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, true) { name = "BeltStripes", wrapMode = TextureWrapMode.Repeat };
            var dark = new Color(0.09f, 0.09f, 0.1f);
            var light = new Color(0.32f, 0.33f, 0.35f);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float cx = Mathf.Abs(x - size * 0.5f) / (size * 0.5f);
                    float chevron = Mathf.Repeat(y / (float)size + cx * 0.35f, 1f);
                    bool stripe = chevron < 0.18f && cx < 0.8f;
                    bool edge = cx > 0.9f;
                    tex.SetPixel(x, y, edge ? light * 0.6f : (stripe ? light : dark));
                }
            tex.Apply(true, true);
            return tex;
        }

        /// <summary>Soft ring used by the scanner pulse in the HUD.</summary>
        public static Texture2D Ring(int size = 128)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { name = "Ring", wrapMode = TextureWrapMode.Clamp };
            float c = (size - 1) * 0.5f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float d = Mathf.Sqrt((x - c) * (x - c) + (y - c) * (y - c)) / c;
                    float a = Mathf.Clamp01(1f - Mathf.Abs(d - 0.92f) / 0.08f);
                    tex.SetPixel(x, y, new Color(1f, 1f, 1f, a));
                }
            tex.Apply();
            return tex;
        }

        public static Texture2D Solid(Color color)
        {
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false) { name = "Solid", wrapMode = TextureWrapMode.Clamp };
            tex.SetPixels(new[] { color, color, color, color });
            tex.Apply();
            return tex;
        }
    }
}
