using Industria.Rendering;
using UnityEngine;

namespace Industria.World
{
    /// <summary>
    /// Scatters trees and boulders. Shared meshes + instanced materials, LOD culling, colliders only on trunks,
    /// so a few hundred props stay cheap on mobile.
    /// </summary>
    public static class VegetationSpawner
    {
        public static void Spawn(int seed, WorldShape shape, Terrain terrain, MaterialLibrary materials, Transform parent)
        {
            var root = new GameObject("Vegetation").transform;
            root.SetParent(parent, false);
            var rng = new System.Random(seed * 13 + 3);

            var trunkMat = materials.Lit(new Color(0.24f, 0.17f, 0.12f), 0f, 0.1f);
            var leafMats = new[]
            {
                materials.Lit(new Color(0.12f, 0.26f, 0.15f), 0f, 0.15f),
                materials.Lit(new Color(0.16f, 0.32f, 0.2f), 0f, 0.15f),
                materials.Lit(new Color(0.10f, 0.28f, 0.27f), 0f, 0.2f), // alien teal pines
            };
            var rockMat = materials.Lit(new Color(0.36f, 0.35f, 0.33f), 0f, 0.12f);
            var desertRockMat = materials.Lit(new Color(0.55f, 0.42f, 0.30f), 0f, 0.12f);
            var basaltMat = materials.Lit(new Color(0.07f, 0.06f, 0.06f), 0f, 0.3f);
            var lavaMat = materials.Emissive(new Color(0.3f, 0.06f, 0.0f), new Color(2.4f, 0.55f, 0.08f));

            var data = terrain.terrainData;
            int trees = 0, rocks = 0;
            for (int i = 0; i < 9000 && (trees < 650 || rocks < 260); i++)
            {
                float x = 15f + (float)rng.NextDouble() * (WorldShape.Size - 30f);
                float z = 15f + (float)rng.NextDouble() * (WorldShape.Size - 30f);
                if (Vector2.Distance(new Vector2(x, z), shape.Center) < 30f) continue; // keep spawn clear
                float nx = x / WorldShape.Size, nz = z / WorldShape.Size;
                float slope = data.GetSteepness(nx, nz);
                float h01 = data.GetInterpolatedHeight(nx, nz) / WorldShape.MaxHeight;
                var biome = shape.BiomeAt(x, z, h01, slope);
                var pos = new Vector3(x, data.GetInterpolatedHeight(nx, nz) + terrain.transform.position.y, z);
                double roll = rng.NextDouble();

                if (trees < 650 && slope < 28f && (biome == Biome.Forest || (biome == Biome.Grassland && roll < 0.12)))
                {
                    CreateTree(root, pos, rng, trunkMat, leafMats[rng.Next(leafMats.Length)]);
                    trees++;
                }
                else if (rocks < 260 && roll < 0.08)
                {
                    var mat = biome == Biome.Desert ? desertRockMat : biome == Biome.Volcanic ? basaltMat : rockMat;
                    CreateRock(root, pos, rng, mat, i);
                    if (biome == Biome.Volcanic && rng.NextDouble() < 0.35) CreateLavaVent(root, pos + new Vector3(3f, 0f, 2f), lavaMat, terrain);
                    rocks++;
                }
            }
            Debug.Log($"[World] Végétation : {trees} arbres, {rocks} rochers.");
        }

        private static void CreateTree(Transform parent, Vector3 pos, System.Random rng, Material trunk, Material leaves)
        {
            float scale = 0.8f + (float)rng.NextDouble() * 0.9f;
            var go = new GameObject("Arbre");
            go.transform.SetParent(parent, false);
            go.transform.position = pos;
            go.transform.rotation = Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f);
            go.transform.localScale = Vector3.one * scale;

            var t = go.transform;
            var r1 = PartBuilder.Cylinder("Tronc", t, trunk, new Vector3(0f, 1.5f, 0f), 0.45f, 3f).GetComponent<Renderer>();
            var r2 = PartBuilder.Part("Feuillage1", t, MeshLibrary.Cone, leaves, new Vector3(0f, 2f, 0f), new Vector3(3.6f, 4.2f, 3.6f)).GetComponent<Renderer>();
            var r3 = PartBuilder.Part("Feuillage2", t, MeshLibrary.Cone, leaves, new Vector3(0f, 4.3f, 0f), new Vector3(2.6f, 3.6f, 2.6f)).GetComponent<Renderer>();

            var col = go.AddComponent<CapsuleCollider>();
            col.radius = 0.3f;
            col.height = 4f;
            col.center = new Vector3(0f, 2f, 0f);

            AddCulling(go, new[] { r1, r2, r3 }, 0.012f);
        }

        private static void CreateRock(Transform parent, Vector3 pos, System.Random rng, Material mat, int variant)
        {
            float s = 0.8f + (float)rng.NextDouble() * 2.8f;
            var go = PartBuilder.Part("Rocher", parent, MeshLibrary.Rock(variant), mat, pos + Vector3.down * s * 0.2f,
                new Vector3(s * 1.3f, s, s * 1.1f), Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f));
            var col = go.AddComponent<SphereCollider>();
            col.radius = 0.42f;
            AddCulling(go, new[] { go.GetComponent<Renderer>() }, 0.008f);
        }

        private static void CreateLavaVent(Transform parent, Vector3 pos, Material lava, Terrain terrain)
        {
            pos.y = terrain.SampleHeight(pos) + 0.05f;
            PartBuilder.Part("Lave", parent, MeshLibrary.Cylinder, lava, pos, new Vector3(2.2f, 0.05f, 1.6f), null, false);
        }

        private static void AddCulling(GameObject go, Renderer[] renderers, float cullHeight)
        {
            var lod = go.AddComponent<LODGroup>();
            lod.SetLODs(new[] { new LOD(cullHeight, renderers) });
            lod.RecalculateBounds();
        }
    }
}
