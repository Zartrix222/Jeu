using System.Collections.Generic;
using Industria.Rendering;
using Industria.Simulation.Content;
using UnityEngine;

namespace Industria.World
{
    /// <summary>Places iron and copper deposits deterministically from the world seed.</summary>
    public static class ResourceNodeSpawner
    {
        private struct Request
        {
            public string ItemId;
            public Vector2 Position;
            public ResourcePurity Purity;
        }

        public static List<ResourceNode> Spawn(int seed, WorldShape shape, Terrain terrain, ContentDatabase content, MaterialLibrary materials, Transform parent)
        {
            var rng = new System.Random(seed * 31 + 7);
            var requests = new List<Request>();
            var c = shape.Center;

            // Guaranteed starter deposits around the spawn point.
            requests.Add(new Request { ItemId = "ore_iron", Position = c + new Vector2(18f, 14f), Purity = ResourcePurity.Normal });
            requests.Add(new Request { ItemId = "ore_copper", Position = c + new Vector2(-22f, 16f), Purity = ResourcePurity.Normal });
            requests.Add(new Request { ItemId = "ore_iron", Position = c + new Vector2(-8f, -34f), Purity = ResourcePurity.Pure });
            requests.Add(new Request { ItemId = "ore_copper", Position = c + new Vector2(42f, -20f), Purity = ResourcePurity.Impure });

            AddScattered(requests, rng, shape, terrain, "ore_iron", 14);
            AddScattered(requests, rng, shape, terrain, "ore_copper", 10);

            var nodes = new List<ResourceNode>();
            for (int i = 0; i < requests.Count; i++)
            {
                var r = requests[i];
                if (!content.Items.Contains(r.ItemId)) continue;
                var color = PartBuilder.Hex(content.Items.Get(r.ItemId).color, Color.gray);
                nodes.Add(CreateNode("node_" + i, r, terrain, color, materials, parent, i));
            }
            return nodes;
        }

        private static void AddScattered(List<Request> list, System.Random rng, WorldShape shape, Terrain terrain, string itemId, int count)
        {
            int placed = 0, attempts = 0;
            while (placed < count && attempts++ < count * 40)
            {
                float angle = (float)rng.NextDouble() * Mathf.PI * 2f;
                float dist = 70f + (float)rng.NextDouble() * 400f;
                var p = shape.Center + new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * dist;
                if (p.x < 30f || p.y < 30f || p.x > WorldShape.Size - 30f || p.y > WorldShape.Size - 30f) continue;
                float slope = terrain.terrainData.GetSteepness(p.x / WorldShape.Size, p.y / WorldShape.Size);
                if (slope > 22f) continue;
                bool tooClose = false;
                foreach (var other in list) if (Vector2.Distance(other.Position, p) < 35f) { tooClose = true; break; }
                if (tooClose) continue;
                double roll = rng.NextDouble();
                var purity = roll < 0.3 ? ResourcePurity.Impure : roll > 0.85 ? ResourcePurity.Pure : ResourcePurity.Normal;
                list.Add(new Request { ItemId = itemId, Position = p, Purity = purity });
                placed++;
            }
        }

        private static ResourceNode CreateNode(string id, Request r, Terrain terrain, Color oreColor, MaterialLibrary materials, Transform parent, int index)
        {
            var pos = new Vector3(r.Position.x, 0f, r.Position.y);
            pos.y = terrain.SampleHeight(pos) + terrain.transform.position.y;

            var root = new GameObject($"Gisement {r.ItemId} ({id})");
            root.transform.SetParent(parent, false);
            root.transform.position = pos;

            var visual = new GameObject("Visual").transform;
            visual.SetParent(root.transform, false);

            var rockMat = materials.Lit(new Color(0.26f, 0.25f, 0.24f), 0f, 0.15f);
            var oreMat = materials.Lit(oreColor, 0.65f, 0.55f);
            var glowMat = materials.Emissive(oreColor, oreColor * 0.9f);
            var rng = new System.Random(index * 97 + 13);
            float purityScale = r.Purity == ResourcePurity.Pure ? 1.25f : r.Purity == ResourcePurity.Impure ? 0.8f : 1f;

            // Base rock mound.
            PartBuilder.Part("Rocher", visual, MeshLibrary.Rock(index), rockMat, new Vector3(0f, 0.1f, 0f), new Vector3(3.2f, 1.6f, 3.2f) * purityScale);
            // Ore chunks around.
            int chunks = 5 + (int)(purityScale * 3);
            for (int i = 0; i < chunks; i++)
            {
                float a = i / (float)chunks * Mathf.PI * 2f + (float)rng.NextDouble();
                float d = 0.6f + (float)rng.NextDouble() * 1.1f;
                float s = (0.5f + (float)rng.NextDouble() * 0.6f) * purityScale;
                PartBuilder.Part("Minerai", visual, MeshLibrary.Rock(index + i), oreMat,
                    new Vector3(Mathf.Cos(a) * d, 0.35f + (float)rng.NextDouble() * 0.5f, Mathf.Sin(a) * d),
                    new Vector3(s, s * 0.8f, s), Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f));
            }
            // Crystals (glowing, visible from afar).
            for (int i = 0; i < 3; i++)
            {
                float a = (float)rng.NextDouble() * Mathf.PI * 2f;
                var tilt = Quaternion.Euler((float)rng.NextDouble() * 30f - 15f, 0f, (float)rng.NextDouble() * 30f - 15f);
                PartBuilder.Part("Cristal", visual, MeshLibrary.Cone, glowMat,
                    new Vector3(Mathf.Cos(a) * 0.6f, 0.6f, Mathf.Sin(a) * 0.6f), new Vector3(0.35f, 1.1f, 0.35f) * purityScale, tilt, false);
            }

            var col = root.AddComponent<CapsuleCollider>();
            col.radius = 1.5f * purityScale;
            col.height = 2.4f;
            col.center = new Vector3(0f, 0.8f, 0f);

            var node = root.AddComponent<ResourceNode>();
            node.Init(id, r.ItemId, r.Purity);
            node.Visual = visual;
            return node;
        }
    }
}
