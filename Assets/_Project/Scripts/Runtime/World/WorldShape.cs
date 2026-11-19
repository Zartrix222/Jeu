using UnityEngine;

namespace Industria.World
{
    public enum Biome { Grassland, Forest, Mountain, Desert, Volcanic }

    /// <summary>
    /// Pure functions describing NEXUS-01's landscape for a given seed: height and biome at any point.
    /// Layout (1 km²): green valley at the centre (spawn), mountains around the edges (strongest to the north),
    /// a dune desert to the east and a volcanic region to the south-west.
    /// </summary>
    public sealed class WorldShape
    {
        public const float Size = 1024f;
        public const float MaxHeight = 220f;

        private readonly float _ox, _oz, _ox2, _oz2;

        public Vector2 Center => new Vector2(Size * 0.5f, Size * 0.5f);
        public Vector2 VolcanoCenter => new Vector2(Size * 0.24f, Size * 0.22f);
        public float VolcanoRadius => 190f;
        public float DesertStartX => Size * 0.66f;
        public Vector2 LakeCenter => Center + new Vector2(-150f, 130f);
        public float LakeRadius => 70f;
        public const float WaterLevel01 = 0.075f;
        public static float WaterLevel => WaterLevel01 * MaxHeight;

        public WorldShape(int seed)
        {
            var rng = new System.Random(seed);
            _ox = (float)rng.NextDouble() * 10000f;
            _oz = (float)rng.NextDouble() * 10000f;
            _ox2 = (float)rng.NextDouble() * 10000f;
            _oz2 = (float)rng.NextDouble() * 10000f;
        }

        /// <summary>Normalised height (0..1 of <see cref="MaxHeight"/>) at world x/z.</summary>
        public float Height01(float x, float z)
        {
            var p = new Vector2(x, z);
            float distCenter = Vector2.Distance(p, Center);
            float d = distCenter / (Size * 0.5f);

            float hills = Fbm(x * 0.0045f + _ox, z * 0.0045f + _oz, 5);
            float h = 0.07f + hills * 0.07f;

            // Mountain ring, stronger to the north (high z).
            float warp = (Mathf.PerlinNoise(x * 0.002f + _ox2, z * 0.002f + _oz2) - 0.5f) * 0.35f;
            float north = Mathf.Clamp01((z / Size - 0.55f) * 2.2f);
            float mountainMask = SmoothStep(0.55f, 0.95f, d + warp) + north * 0.45f * SmoothStep(0.25f, 0.6f, d);
            mountainMask = Mathf.Clamp01(mountainMask);
            float ridge = Ridged(x * 0.0032f + _ox2, z * 0.0032f + _oz2, 5);
            h += ridge * ridge * 0.62f * mountainMask;

            // Desert: smoother ground with dunes.
            float desert = DesertFactor(x, z);
            if (desert > 0f)
            {
                float dunes = (Mathf.Sin(x * 0.045f + Mathf.PerlinNoise(x * 0.01f, z * 0.01f) * 6f) * 0.5f + 0.5f) * 0.025f;
                float flat = 0.08f + hills * 0.03f + dunes;
                h = Mathf.Lerp(h, Mathf.Min(h, flat + mountainMask * 0.2f), desert);
            }

            // Volcano: cone with a crater.
            float vd = Vector2.Distance(p, VolcanoCenter);
            if (vd < VolcanoRadius)
            {
                float t = 1f - vd / VolcanoRadius;
                float cone = Mathf.Pow(t, 1.8f) * 0.48f;
                float crater = vd < 28f ? (1f - vd / 28f) * 0.12f : 0f;
                h = Mathf.Max(h, 0.08f + cone - crater + hills * 0.02f);
            }

            // Lake basin: smooth bowl whose rim rises a few metres above the water.
            float ld = Vector2.Distance(p, LakeCenter);
            if (ld < LakeRadius * 1.4f)
            {
                float t = Mathf.Clamp01(ld / (LakeRadius * 1.15f));
                float bowl = WaterLevel01 - 0.035f + 0.05f * t * t + hills * 0.006f;
                float blend = 1f - SmoothStep(LakeRadius, LakeRadius * 1.4f, ld);
                h = Mathf.Lerp(h, bowl, blend);
            }

            // Spawn valley: flat, safe area for the first factory.
            float flatten = 1f - SmoothStep(45f, 110f, distCenter);
            h = Mathf.Lerp(h, 0.085f + hills * 0.012f, flatten);
            return Mathf.Clamp01(h);
        }

        public float DesertFactor(float x, float z)
        {
            float edge = DesertStartX + (Mathf.PerlinNoise(z * 0.006f + _oz, _ox) - 0.5f) * 120f;
            return SmoothStep(edge - 40f, edge + 40f, x);
        }

        /// <summary>1 inside the lake, fading to 0 past its shore.</summary>
        public float LakeFactor(float x, float z)
        {
            float d = Vector2.Distance(new Vector2(x, z), LakeCenter);
            return 1f - SmoothStep(LakeRadius * 0.9f, LakeRadius * 1.25f, d);
        }

        public float VolcanicFactor(float x, float z)
        {
            float vd = Vector2.Distance(new Vector2(x, z), VolcanoCenter);
            return 1f - SmoothStep(VolcanoRadius * 0.75f, VolcanoRadius * 1.1f, vd);
        }

        public Biome BiomeAt(float x, float z, float height01, float slopeDeg)
        {
            if (VolcanicFactor(x, z) > 0.5f) return Biome.Volcanic;
            if (DesertFactor(x, z) > 0.5f) return slopeDeg > 32f ? Biome.Mountain : Biome.Desert;
            if (slopeDeg > 33f || height01 > 0.36f) return Biome.Mountain;
            float forest = Mathf.PerlinNoise(x * 0.008f + _ox2, z * 0.008f + _oz);
            return forest > 0.52f ? Biome.Forest : Biome.Grassland;
        }

        private static float Fbm(float x, float z, int octaves)
        {
            float sum = 0f, amp = 0.5f, freq = 1f, norm = 0f;
            for (int i = 0; i < octaves; i++)
            {
                sum += Mathf.PerlinNoise(x * freq, z * freq) * amp;
                norm += amp; amp *= 0.5f; freq *= 2.03f;
            }
            return sum / norm;
        }

        private static float Ridged(float x, float z, int octaves)
        {
            float sum = 0f, amp = 0.5f, freq = 1f, norm = 0f;
            for (int i = 0; i < octaves; i++)
            {
                float n = 1f - Mathf.Abs(Mathf.PerlinNoise(x * freq, z * freq) * 2f - 1f);
                sum += n * n * amp;
                norm += amp; amp *= 0.5f; freq *= 2.1f;
            }
            return sum / norm;
        }

        public static float SmoothStep(float a, float b, float x)
        {
            float t = Mathf.Clamp01((x - a) / (b - a));
            return t * t * (3f - 2f * t);
        }
    }
}
