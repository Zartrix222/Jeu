using Industria.Rendering;
using UnityEngine;

namespace Industria.World
{
    /// <summary>
    /// Scatters flora and rocks. Shared meshes + instanced materials, LOD culling, colliders only on trunks
    /// and boulders, so a few hundred props stay cheap on mobile.
    /// </summary>
    public static class VegetationSpawner
    {
        private const int MaxTrees = 700;
        private const int MaxRocks = 280;
        private const int MaxBushes = 450;
        private const int MaxGlow = 140;

        private sealed class Palette
        {
            public Material Trunk, PaleTrunk, Rock, DesertRock, Basalt, Lava, Moss, GlowStem, GlowCap, AlienTip;
            public Material[] Pine, Broadleaf, Bush, Alien;
        }

        public static void Spawn(int seed, WorldShape shape, Terrain terrain, MaterialLibrary m, Transform parent)
        {
            var root = new GameObject("Vegetation").transform;
            root.SetParent(parent, false);
            var rng = new System.Random(seed * 13 + 3);

            var pal = new Palette
            {
                Trunk = m.Lit(new Color(0.24f, 0.17f, 0.12f), 0f, 0.1f),
                PaleTrunk = m.Lit(new Color(0.62f, 0.6f, 0.55f), 0f, 0.2f),
                Rock = m.Lit(new Color(0.36f, 0.35f, 0.33f), 0f, 0.12f),
                DesertRock = m.Lit(new Color(0.58f, 0.43f, 0.3f), 0f, 0.12f),
                Basalt = m.Lit(new Color(0.07f, 0.06f, 0.06f), 0.1f, 0.35f),
                Lava = m.Emissive(new Color(0.3f, 0.06f, 0.0f), new Color(3f, 0.7f, 0.1f)),
                Moss = m.Lit(new Color(0.2f, 0.3f, 0.14f), 0f, 0.1f),
                GlowStem = m.Lit(new Color(0.75f, 0.78f, 0.7f), 0f, 0.3f),
                GlowCap = m.Emissive(new Color(0.1f, 0.5f, 0.55f), new Color(0.2f, 1.6f, 1.8f)),
                AlienTip = m.Emissive(new Color(0.5f, 0.2f, 0.6f), new Color(1.4f, 0.4f, 2.0f)),
                Pine = new[] { m.Lit(new Color(0.11f, 0.24f, 0.14f), 0f, 0.15f), m.Lit(new Color(0.14f, 0.29f, 0.18f), 0f, 0.15f) },
                Broadleaf = new[] { m.Lit(new Color(0.24f, 0.38f, 0.16f), 0f, 0.2f), m.Lit(new Color(0.32f, 0.42f, 0.14f), 0f, 0.2f), m.Lit(new Color(0.45f, 0.36f, 0.12f), 0f, 0.2f) },
                Bush = new[] { m.Lit(new Color(0.18f, 0.3f, 0.13f), 0f, 0.15f), m.Lit(new Color(0.25f, 0.33f, 0.12f), 0f, 0.15f) },
                Alien = new[] { m.Lit(new Color(0.08f, 0.3f, 0.3f), 0.1f, 0.35f), m.Lit(new Color(0.2f, 0.16f, 0.36f), 0.1f, 0.35f) },
            };

            var data = terrain.terrainData;
            int trees = 0, rocks = 0, bushes = 0, glow = 0;
            for (int i = 0; i < 14000 && (trees < MaxTrees || rocks < MaxRocks || bushes < MaxBushes); i++)
            {
                float x = 15f + (float)rng.NextDouble() * (WorldShape.Size - 30f);
                float z = 15f + (float)rng.NextDouble() * (WorldShape.Size - 30f);
                if (Vector2.Distance(new Vector2(x, z), shape.Center) < 30f) continue; // keep spawn clear
                if (shape.LakeFactor(x, z) > 0.15f) continue;
                float nx = x / WorldShape.Size, nz = z / WorldShape.Size;
                float slope = data.GetSteepness(nx, nz);
                float height = data.GetInterpolatedHeight(nx, nz);
                if (height < WorldShape.WaterLevel + 0.6f) continue;
                var biome = shape.BiomeAt(x, z, height / WorldShape.MaxHeight, slope);
                var pos = new Vector3(x, height + terrain.transform.position.y, z);
                double roll = rng.NextDouble();

                bool green = biome == Biome.Forest || biome == Biome.Grassland;
                if (trees < MaxTrees && slope < 28f && (biome == Biome.Forest || (biome == Biome.Grassland && roll < 0.1)))
                {
                    double kind = rng.NextDouble();
                    if (kind < 0.5) Pine(root, pos, rng, pal);
                    else if (kind < 0.85) Broadleaf(root, pos, rng, pal);
                    else Alien(root, pos, rng, pal);
                    trees++;
                    if (biome == Biome.Forest && glow < MaxGlow && rng.NextDouble() < 0.25)
                    {
                        Mushrooms(root, pos + new Vector3(1.5f, 0f, 1.2f), rng, pal, terrain);
                        glow++;
                    }
                }
                else if (bushes < MaxBushes && green && slope < 30f && roll < 0.35)
                {
                    Bush(root, pos, rng, pal);
                    bushes++;
                }
                else if (rocks < MaxRocks && roll < 0.08)
                {
                    var mat = biome == Biome.Desert ? pal.DesertRock : biome == Biome.Volcanic ? pal.Basalt : pal.Rock;
                    Boulder(root, pos, rng, mat, i, green ? pal.Moss : null);
                    if (biome == Biome.Volcanic && rng.NextDouble() < 0.4) LavaVent(root, pos + new Vector3(3f, 0f, 2f), pal.Lava, terrain, rng);
                    rocks++;
                }
            }
            Debug.Log($"[World] Végétation : {trees} arbres, {bushes} buissons, {glow} bosquets lumineux, {rocks} rochers.");
        }

        private static GameObject Root(Transform parent, string name, Vector3 pos, System.Random rng, float scale)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.position = pos;
            go.transform.rotation = Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f);
            go.transform.localScale = Vector3.one * scale;
            return go;
        }

        private static void Trunk(GameObject go, float height)
        {
            var col = go.AddComponent<CapsuleCollider>();
            col.radius = 0.3f;
            col.height = height;
            col.center = new Vector3(0f, height * 0.5f, 0f);
        }

        private static void Pine(Transform parent, Vector3 pos, System.Random rng, Palette p)
        {
            var go = Root(parent, "Pin", pos, rng, 0.8f + (float)rng.NextDouble() * 0.9f);
            var t = go.transform;
            var leaves = p.Pine[rng.Next(p.Pine.Length)];
            PartBuilder.Cylinder("Tronc", t, p.Trunk, new Vector3(0f, 1.5f, 0f), 0.45f, 3f);
            PartBuilder.Part("Étage 1", t, MeshLibrary.Cone, leaves, new Vector3(0f, 1.6f, 0f), new Vector3(3.8f, 3.4f, 3.8f));
            PartBuilder.Part("Étage 2", t, MeshLibrary.Cone, leaves, new Vector3(0f, 3.2f, 0f), new Vector3(3.0f, 3.0f, 3.0f));
            PartBuilder.Part("Étage 3", t, MeshLibrary.Cone, leaves, new Vector3(0f, 4.7f, 0f), new Vector3(2.0f, 2.6f, 2.0f));
            Trunk(go, 4f);
            Cull(go, 0.012f);
        }

        private static void Broadleaf(Transform parent, Vector3 pos, System.Random rng, Palette p)
        {
            var go = Root(parent, "Feuillu", pos, rng, 0.8f + (float)rng.NextDouble() * 0.7f);
            var t = go.transform;
            var leaves = p.Broadleaf[rng.Next(p.Broadleaf.Length)];
            PartBuilder.Cylinder("Tronc", t, p.PaleTrunk, new Vector3(0f, 1.7f, 0f), 0.4f, 3.4f);
            PartBuilder.Cylinder("Branche", t, p.PaleTrunk, new Vector3(0.45f, 3.1f, 0f), 0.18f, 1.4f, Quaternion.Euler(0f, 0f, -35f));
            for (int i = 0; i < 4; i++)
            {
                float a = i * 1.7f + (float)rng.NextDouble();
                var off = new Vector3(Mathf.Cos(a) * 0.9f, 3.6f + (float)rng.NextDouble() * 1.2f, Mathf.Sin(a) * 0.9f);
                float s = 1.8f + (float)rng.NextDouble() * 1.0f;
                PartBuilder.Part("Feuillage", t, MeshLibrary.Rock(i), leaves, off, new Vector3(s, s * 0.9f, s));
            }
            Trunk(go, 3.4f);
            Cull(go, 0.012f);
        }

        private static void Alien(Transform parent, Vector3 pos, System.Random rng, Palette p)
        {
            var go = Root(parent, "Flèche alien", pos, rng, 0.9f + (float)rng.NextDouble() * 0.8f);
            var t = go.transform;
            var body = p.Alien[rng.Next(p.Alien.Length)];
            PartBuilder.Part("Tige", t, MeshLibrary.Cone, body, Vector3.zero, new Vector3(0.9f, 7f, 0.9f));
            for (int i = 0; i < 3; i++)
            {
                float a = i * 2.1f;
                var tilt = Quaternion.Euler(Mathf.Cos(a) * 28f, 0f, Mathf.Sin(a) * 28f);
                PartBuilder.Part("Fronde", t, MeshLibrary.Cone, body, new Vector3(0f, 2f + i * 1.3f, 0f), new Vector3(0.5f, 3f, 0.5f), tilt);
            }
            PartBuilder.Part("Pointe", t, MeshLibrary.Sphere, p.AlienTip, new Vector3(0f, 7f, 0f), Vector3.one * 0.35f, null, false);
            Trunk(go, 5f);
            Cull(go, 0.01f);
        }

        private static void Bush(Transform parent, Vector3 pos, System.Random rng, Palette p)
        {
            var go = Root(parent, "Buisson", pos, rng, 0.6f + (float)rng.NextDouble() * 0.8f);
            var mat = p.Bush[rng.Next(p.Bush.Length)];
            for (int i = 0; i < 3; i++)
            {
                float a = i * 2.1f;
                PartBuilder.Part("Touffe", go.transform, MeshLibrary.Rock(i + 1), mat, new Vector3(Mathf.Cos(a) * 0.5f, 0.35f, Mathf.Sin(a) * 0.5f), new Vector3(1.3f, 1f, 1.3f), null, false);
            }
            Cull(go, 0.02f);
        }

        private static void Mushrooms(Transform parent, Vector3 pos, System.Random rng, Palette p, Terrain terrain)
        {
            pos.y = terrain.SampleHeight(pos) + terrain.transform.position.y;
            var go = Root(parent, "Champignons lumineux", pos, rng, 1f);
            int n = 3 + rng.Next(4);
            for (int i = 0; i < n; i++)
            {
                float a = (float)rng.NextDouble() * Mathf.PI * 2f, d = (float)rng.NextDouble() * 0.9f;
                float h = 0.25f + (float)rng.NextDouble() * 0.45f;
                var at = new Vector3(Mathf.Cos(a) * d, 0f, Mathf.Sin(a) * d);
                PartBuilder.Cylinder("Pied", go.transform, p.GlowStem, at + Vector3.up * h * 0.5f, 0.07f, h);
                PartBuilder.Part("Chapeau", go.transform, MeshLibrary.Sphere, p.GlowCap, at + Vector3.up * h, new Vector3(0.32f, 0.14f, 0.32f) * (1f + h), null, false);
            }
            Cull(go, 0.02f);
        }

        private static void Boulder(Transform parent, Vector3 pos, System.Random rng, Material mat, int variant, Material moss)
        {
            float s = 0.8f + (float)rng.NextDouble() * 2.8f;
            var go = PartBuilder.Part("Rocher", parent, MeshLibrary.Rock(variant), mat, pos + Vector3.down * s * 0.2f,
                new Vector3(s * 1.3f, s, s * 1.1f), Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f));
            var col = go.AddComponent<SphereCollider>();
            col.radius = 0.42f;
            if (moss != null && rng.NextDouble() < 0.5)
                PartBuilder.Part("Mousse", go.transform, MeshLibrary.Rock(variant + 1), moss, new Vector3(0f, 0.28f, 0f), new Vector3(0.85f, 0.35f, 0.85f), null, false);
            Cull(go, 0.008f);
        }

        private static void LavaVent(Transform parent, Vector3 pos, Material lava, Terrain terrain, System.Random rng)
        {
            pos.y = terrain.SampleHeight(pos) + 0.05f;
            float s = 1.6f + (float)rng.NextDouble() * 2f;
            PartBuilder.Part("Lave", parent, MeshLibrary.Cylinder, lava, pos, new Vector3(s, 0.05f, s * 0.75f), Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f), false);
        }

        private static void Cull(GameObject go, float cullHeight)
        {
            var lod = go.AddComponent<LODGroup>();
            lod.SetLODs(new[] { new LOD(cullHeight, go.GetComponentsInChildren<Renderer>()) });
            lod.RecalculateBounds();
        }
    }
}
