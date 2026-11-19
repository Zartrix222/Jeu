using Industria.Rendering;
using UnityEngine;

namespace Industria.World
{
    /// <summary>Builds the Unity Terrain (heights + painted layers) from a <see cref="WorldShape"/>.</summary>
    public static class TerrainBuilder
    {
        // Mobile friendly resolutions: 513 heightmap (2 m / sample), 256 splat map, 4 layers (single pass).
        private const int HeightRes = 513;
        private const int SplatRes = 256;

        public static Terrain Build(WorldShape shape, MaterialLibrary materials, Transform parent)
        {
            var data = new TerrainData
            {
                name = "NEXUS-01 Terrain",
                heightmapResolution = HeightRes,
            };
            data.size = new Vector3(WorldShape.Size, WorldShape.MaxHeight, WorldShape.Size);

            var heights = new float[HeightRes, HeightRes];
            float step = WorldShape.Size / (HeightRes - 1);
            for (int z = 0; z < HeightRes; z++)
                for (int x = 0; x < HeightRes; x++)
                    heights[z, x] = shape.Height01(x * step, z * step);
            data.SetHeights(0, 0, heights);

            data.terrainLayers = CreateLayers();
            data.alphamapResolution = SplatRes;
            data.baseMapResolution = 256;
            PaintSplat(shape, data);

            var go = Terrain.CreateTerrainGameObject(data);
            go.name = "Terrain";
            go.transform.SetParent(parent, false);
            var terrain = go.GetComponent<Terrain>();
            terrain.heightmapPixelError = 6f;
            terrain.basemapDistance = 180f;
            terrain.drawInstanced = true;
            terrain.drawTreesAndFoliage = false;
            var mat = materials.TerrainMaterial();
            if (mat != null) terrain.materialTemplate = mat;
            return terrain;
        }

        private static TerrainLayer[] CreateLayers()
        {
            return new[]
            {
                Layer("Herbe", ProceduralTextures.Noise("grass", new Color(0.20f, 0.30f, 0.14f), new Color(0.33f, 0.42f, 0.2f), 6f, 128, 1), 6f),
                Layer("Roche", ProceduralTextures.Noise("rock", new Color(0.30f, 0.29f, 0.28f), new Color(0.52f, 0.5f, 0.47f), 5f, 128, 2), 10f),
                Layer("Sable", ProceduralTextures.Noise("sand", new Color(0.70f, 0.58f, 0.40f), new Color(0.84f, 0.73f, 0.53f), 7f, 128, 3), 8f),
                Layer("Cendre", ProceduralTextures.Noise("ash", new Color(0.08f, 0.07f, 0.07f), new Color(0.25f, 0.18f, 0.15f), 6f, 128, 4), 7f),
            };
        }

        private static TerrainLayer Layer(string name, Texture2D albedo, float tile)
        {
            return new TerrainLayer
            {
                name = name,
                diffuseTexture = albedo,
                tileSize = new Vector2(tile, tile),
                smoothness = 0.05f,
                metallic = 0f,
            };
        }

        private static void PaintSplat(WorldShape shape, TerrainData data)
        {
            int res = data.alphamapResolution;
            var maps = new float[res, res, 4];
            for (int z = 0; z < res; z++)
            {
                for (int x = 0; x < res; x++)
                {
                    float nx = x / (float)(res - 1), nz = z / (float)(res - 1);
                    float wx = nx * WorldShape.Size, wz = nz * WorldShape.Size;
                    float h = data.GetInterpolatedHeight(nx, nz) / WorldShape.MaxHeight;
                    float slope = data.GetSteepness(nx, nz);

                    float rock = Mathf.Clamp01((slope - 24f) / 14f) + Mathf.Clamp01((h - 0.34f) * 6f);
                    float sand = shape.DesertFactor(wx, wz);
                    float ash = shape.VolcanicFactor(wx, wz);
                    float grass = 1f;

                    rock = Mathf.Clamp01(rock);
                    grass *= (1f - rock) * (1f - sand) * (1f - ash);
                    sand *= (1f - rock) * (1f - ash);
                    ash *= (1f - rock * 0.5f);

                    float sum = grass + rock + sand + ash;
                    if (sum <= 0.0001f) { grass = 1f; sum = 1f; }
                    maps[z, x, 0] = grass / sum;
                    maps[z, x, 1] = rock / sum;
                    maps[z, x, 2] = sand / sum;
                    maps[z, x, 3] = ash / sum;
                }
            }
            data.SetAlphamaps(0, 0, maps);
        }
    }
}
